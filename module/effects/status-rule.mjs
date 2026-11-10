/**
 * The rules of one status (Bound, Fear, Bleeding, ...).
 *
 *   StatusRule       (this file) everything a status can do with settings alone: change Physical Defense and
 *                    movement, link to its rules page, show a button that ends it, a line on the start-of-turn card,
 *                    modifiers and notes in roll dialogs, and the actions it stops (a warning with Use Anyway)
 *     ├─ BleedingRule  (rules/bleeding.mjs)  start of turn: roll 1d2 Health lost; Treated button
 *     ├─ BloodbathRule (rules/bloodbath.mjs) starts Bleeding; start of turn: Physique 15 or faint (Helpless)
 *     ├─ DyingRule     (rules/dying.mjs)     start of turn: Physique 10 or die; Will 15 to act; only free / quick actions
 *     ├─ FearRule      (rules/fear.mjs)      start of turn and Effects tab: Will 15 to resist the forced movement
 *     ├─ AngryRule     (rules/angry.mjs)     start of turn and Effects tab: Will 20 to calm down; meditation; -4 (or -2)
 *     ├─ SemiOutOfControlRule   (rules/semi-out-of-control.mjs)   1d2 rounds; Will 10 each turn or a 0/1 sanity check
 *     ├─ IndeterminateMadnessRule (rules/indeterminate-madness.mjs) d8 symptom; daily 0/1 sanity check
 *     └─ OutOfControlRule       (rules/out-of-control.mjs)       Sanity 0: the GM takes over
 *
 * One StatusRule is made for every entry in STATUSES (status-effects.mjs). Rules are looked up by status id, so a
 * status works the same however it got onto the actor: toggled from the Token HUD or the Effects tab, added
 * automatically, or carried by a spell's own effect (an effect named "Terrified" with statuses: ["fear"]).
 *
 * The settings are read by:
 *   defense, movement   effects/status-math.mjs, while the actor's data is prepared (data/actor/base-actor.mjs)
 *   reference, buttons  the Effects tab (sheets/base-actor-sheet.mjs)
 *   toStatusEffect()    Foundry's status list, CONFIG.statusEffects (registerStatusEffects in status-effects.mjs)
 *   onApplied()         when an effect with the status is put on an actor (documents/active-effect.mjs)
 *   turnStart(), onTurnCheck()  the start-of-turn card (effects/turn-start.mjs)
 *   onTurnStart()       when the creature's turn starts in combat, before the card (documents/combat.mjs): countdowns
 *   applyCheckResult()  what a status check's result does; Burning Luck calls it again when Luck changes the result
 *                       (helpers/luck.mjs)
 *   rollModifier(), rollNote(), targetRollModifier(), targetRollNote()
 *                       the roll dialogs (effects/status-rolls.mjs, apps/roll-dialog.mjs)
 *   restriction()       using an action or spell (effects/status-restrictions.mjs)
 *
 * Roll settings: roll and targetRoll (modifiers), note and targetNote (notes); see the constructor.
 * A roll's "kind" is "skill" (a skill check), "attribute" (an attribute check) or "action" (an action's or spell's
 * attack roll, with or without a skill).
 */

import { statusChat } from "./status-checks.mjs";
import { formatHTML } from "../helpers/render.mjs";

/** The journal in the LOTM Rules compendium that has one page per status. */
export const STATUS_JOURNAL = "Compendium.lotm.rules_compendium.JournalEntry.xVlBNlTOMkhLtx6h";


export default class StatusRule {

  /**
   * @param {string} id        The status id, e.g. "bound". Also the key of its language strings.
   * @param {object} config    Its entry in STATUSES (status-effects.mjs), plus `order`.
   */
  constructor(id, config = {}) {
    /** The status id, e.g. "bound". */
    this.id = id;
    /** Language key of its name. */
    this.name = `LORD_OF_THE_MYSTERIES.Status.Names.${id}`;
    /** Its icon. */
    this.img = config.img ?? "icons/svg/aura.svg";
    /** Its position in the Token HUD and the Effects tab. */
    this.order = config.order ?? 0;
    /** Its page id in the Status Effects journal, or null. */
    this.page = config.page ?? null;
    /**
     * Statuses that come with this one (Helpless brings Bound). Each one gets its own linked effect on the actor,
     * so the token shows its icon too (see LordOfTheMysteriesActiveEffect in documents/active-effect.mjs).
     */
    this.implies = config.implies ?? [];
    /** What it does to Physical Defense: { agility: "half"|"none", dodge: "none", modifier: number }, or null. */
    this.defense = config.defense ?? null;
    /** What it does to movement: { agility: "half"|"none" }, or null. */
    this.movement = config.movement ?? null;
    /** A button that ends the status: { label, icon, chat } (language keys; chat gets {name}), or null. */
    this.endButton = config.endButton ?? null;
    /** A line on the start-of-turn card while the creature has this status (language key; {name}, {source}), or null. */
    this.turnStartNote = config.turnStartNote ?? null;
    /**
     * A modifier on the creature's own rolls: { modifier, kinds, scope }, or null.
     *   kinds  which rolls ("skill", "attribute", "action"); default all three
     *   scope  "all", or "source": only rolls against the effect's source (see rollModifier)
     */
    this.roll = config.roll ?? null;
    /** A modifier on rolls made against a creature with this status: { modifier, kinds, label }, or null. */
    this.targetRoll = config.targetRoll ?? null;
    /** A note on the creature's own rolls: { key, kinds, skill } (skill: only that skill's checks, by key), or null. */
    this.note = config.note ?? null;
    /** A note on rolls made against a creature with this status: { key, kinds }, or null. */
    this.targetNote = config.targetNote ?? null;
    /**
     * What it stops the creature doing: { actionTypes, traits, all, reason }, or null.
     *   actionTypes  action types it rules out ("move"); traits  action traits it rules out ("speech");
     *   all          every action; reason  language key of the warning.
     */
    this.restrict = config.restrict ?? null;
  }


  /* -------------------------------------------- */
  /*  Rolls                                        */
  /* -------------------------------------------- */

  /**
   * Whether a roll setting (roll, targetRoll, rollNote, targetNote) covers this kind of roll.
   * @param {{kinds?: string[]}} setting
   * @param {string} kind
   * @returns {boolean}
   */
  static coversKind(setting, kind) {
    return !setting?.kinds?.length || setting.kinds.includes(kind);
  }


  /**
   * The modifier this status puts in the creature's own roll dialog, or null.
   * A "source" modifier (Fear's -4, Advantage's +2) only counts against the effect's source: it's left out when
   * the roller has targets and none of them is the source. With no targets it's added, named after the source,
   * so the player can take it out if the roll has nothing to do with that creature.
   * @param {Actor} actor
   * @param {ActiveEffect} effect
   * @param {{kind: string, targets: Actor[]}} context
   * @returns {{key: string, label: string, value: number, img: string}|null}   key: two the same aren't both added.
   */
  rollModifier(actor, effect, { kind, targets = [] }) {
    if (!this.roll || !StatusRule.coversKind(this.roll, kind)) return null;
    const value = this.rollValue(effect);
    if (!value) return null;

    const name = game.i18n.localize(this.name);
    if (this.roll.scope !== "source") return { key: this.id, label: name, value, img: this.img };

    const sourceUuid = effect.system?.source;
    if (!sourceUuid) return { key: this.id, label: name, value, img: this.img };
    if (targets.length && !targets.some((target) => target?.uuid === sourceUuid)) return null;
    const source = effect.sourceActor?.name ?? game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.TheSource");
    return {
      key: `${this.id}:${sourceUuid}`,
      label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Rolls.Against", { status: name, source }),
      value,
      img: this.img,
    };
  }


  /**
   * The size of this status's roll modifier for one effect. Angry overrides it (halved by Meditation).
   * @param {ActiveEffect} effect
   * @returns {number}
   */
  rollValue(effect) {
    return Number(this.roll?.modifier) || 0;
  }


  /**
   * The modifier on a roll made against a creature with this status (attacking a Helpless creature: +2), or null.
   * @param {Actor} target
   * @param {ActiveEffect} effect
   * @param {{kind: string}} context
   * @returns {{key: string, label: string, value: number}|null}
   */
  targetRollModifier(target, effect, { kind }) {
    if (!this.targetRoll || !StatusRule.coversKind(this.targetRoll, kind)) return null;
    const value = Number(this.targetRoll.modifier) || 0;
    if (!value) return null;
    return { key: `target:${this.id}`, label: game.i18n.localize(this.targetRoll.label), value, img: this.img };
  }


  /**
   * A note in the creature's own roll dialog and on its chat card (Deaf on a Listen check), or null.
   * @param {Actor} actor
   * @param {ActiveEffect} effect
   * @param {{kind: string, skillKey?: string, skillUuid?: string}} context
   *   The note's skill is a skill key ("listening"); a UUID there still works.
   * @returns {string|null}  HTML (escaped).
   */
  rollNote(actor, effect, { kind, skillKey = null, skillUuid = null }) {
    const note = this.note;
    if (!note || !StatusRule.coversKind(note, kind)) return null;
    if (note.skill && note.skill !== skillKey && note.skill !== skillUuid) return null;
    return this.text(note.key, actor, effect);
  }


  /**
   * A note on a roll made against a creature with this status (Invisible: find it first), or null.
   * @param {Actor} target
   * @param {ActiveEffect} effect
   * @param {{kind: string}} context
   * @returns {string|null}  HTML (escaped). {name} is the target.
   */
  targetRollNote(target, effect, { kind }) {
    if (!this.targetNote || !StatusRule.coversKind(this.targetNote, kind)) return null;
    return this.text(this.targetNote.key, target, effect);
  }


  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /**
   * Why this status stops the creature using an action or spell right now, or null when it doesn't.
   * The player can still use it after the warning (Use Anyway), so the GM and players can talk it over.
   * @param {Item} item       The action or spell.
   * @param {Actor} actor
   * @param {ActiveEffect} effect
   * @returns {string|null}   The warning (plain text).
   */
  restriction(item, actor, effect) {
    const rule = this.restrict;
    if (!rule) return null;
    const type = item?.system?.actionType ?? "";
    const traits = new Set(item?.system?.traits ?? []);
    const stopped = rule.all
      || (rule.actionTypes ?? []).includes(type)
      || (rule.traits ?? []).some((trait) => traits.has(trait));
    return stopped ? game.i18n.localize(rule.reason) : null;
  }


  /** UUID of its rules page, or null. */
  get reference() {
    return this.page ? `${STATUS_JOURNAL}.JournalEntryPage.${this.page}` : null;
  }


  /**
   * The effect's showIcon setting: always draw the status's icon on the token. Foundry's default only draws it for
   * effects with a duration, and statuses usually have none (Bound lasts until it's removed).
   * @type {number}
   */
  static get SHOW_ICON() {
    return CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS;
  }


  /** A link to its rules page, for an effect's description. (No label, so the link shows the page's own name.) */
  get description() {
    return this.reference ? `<p>@UUID[${this.reference}]</p>` : "";
  }


  /**
   * Its entry in Foundry's status list (CONFIG.statusEffects): what the Token HUD shows, and the effect
   * Foundry creates when it's toggled on. Each effect has just this one status; statuses it implies get
   * their own linked effects.
   * @returns {object}
   */
  toStatusEffect() {
    const config = {
      id: this.id,
      name: this.name,
      img: this.img,
      order: this.order,
      hud: true,
      type: "effect",
      showIcon: StatusRule.SHOW_ICON,
    };
    if (this.description) config.description = this.description;
    return config;
  }


  /**
   * Data for a new effect with only this status. Used for the linked effects of implied statuses
   * (Helpless creates a Bound effect). Runs after startup, so the name is translated here.
   * @param {object} [system]   The effect's system data, e.g. { impliedBy: "<effect id>" }.
   * @param {object} [extra]    Other effect data, e.g. { disabled: true }.
   * @returns {object}
   */
  toEffectData(system = {}, extra = {}) {
    return {
      name: game.i18n.localize(this.name),
      img: this.img,
      type: "effect",
      statuses: [this.id],
      description: this.description,
      // Without this the token wouldn't show the icon (see SHOW_ICON).
      showIcon: StatusRule.SHOW_ICON,
      system,
      ...extra,
    };
  }


  /**
   * A language string with {name} (the creature) and {source} (who the effect is about, or "its source") filled in,
   * ready to put in chat HTML: every value is escaped (formatHTML, helpers/render.mjs).
   * @param {string} key
   * @param {Actor} actor
   * @param {ActiveEffect} [effect]
   * @param {object} [extra]   More values for the string. One that's already HTML goes in as langHTML / safeHTML.
   * @returns {string}  HTML
   */
  text(key, actor, effect = null, extra = {}) {
    const source = effect?.sourceActor?.name ?? game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.TheSource");
    return formatHTML(key, { name: actor?.name ?? "", source, ...extra });
  }


  /**
   * An effect with this status was just put on an actor. Runs once, on the client that created it.
   * Nothing by default; Bloodbath starts Bleeding.
   * @param {ActiveEffect} effect
   * @returns {Promise<void>}
   */
  async onApplied(effect) {}


  /**
   * What this status puts on the creature's start-of-turn card (effects/turn-start.mjs), or null for nothing.
   * By default its turnStartNote (Shock's reminder), with no buttons.
   * @param {Actor} actor
   * @param {ActiveEffect} effect
   * @returns {{text: string, buttons?: {check: string, label: string}[]}|null}   text is HTML.
   */
  turnStart(actor, effect) {
    if (!this.turnStartNote) return null;
    return { text: this.text(this.turnStartNote, actor, effect) };
  }


  /**
   * One of this status's buttons on a start-of-turn card was clicked (see turnStart).
   * @param {string} check             The button's check id.
   * @param {ActiveEffect} effect      The effect the button is for.
   * @param {object} [options]
   * @param {boolean} [options.fast]   Shift-click: roll right away, without the dialog.
   * @returns {Promise<boolean>}       true when the button was used (a roll was made), so it can't be used again.
   */
  async onTurnCheck(check, effect, options = {}) {
    return false;
  }


  /**
   * What one of this status's checks does once its result is known (die, faint, resist, calm down...).
   * Called right after the roll, and again by Burning Luck when Luck turns a pass into a fail or back
   * (helpers/luck.mjs), with isLuckChange: then it also undoes what the old result did, where it can.
   * @param {string} check             The check's id ("physique", "resist", ...).
   * @param {ActiveEffect} effect
   * @param {boolean} success
   * @param {object} [options]
   * @param {boolean} [options.isLuckChange]  The result was changed by Burning Luck.
   * @returns {Promise<boolean>}       true when the status handled it. false: Burning Luck tells the GM to adjust by hand.
   */
  async applyCheckResult(check, effect, success, { isLuckChange = false } = {}) {
    return false;
  }


  /**
   * The creature's turn just started in combat (documents/combat.mjs), before its start-of-turn card is made.
   * For statuses that count down (Semi-Out-of-Control). Runs on the GM's client. Nothing by default.
   * @param {Actor} actor
   * @param {ActiveEffect} effect
   * @returns {Promise<void>}
   */
  async onTurnStart(actor, effect) {}


  /**
   * The check data to save on a status check's roll, so Burning Luck can change its result (rollStatusCheck).
   * @param {string} check
   * @param {ActiveEffect} effect
   * @returns {{statusId: string, check: string, effectUuid: string}}
   */
  outcomeFor(check, effect) {
    return { statusId: this.id, check, effectUuid: effect.uuid };
  }


  /**
   * The buttons this status adds to its effect's row on the Effects tab.
   * @param {ActiveEffect} effect
   * @returns {{statusId: string, id: string, label: string, icon: string}[]}
   */
  buttons(effect) {
    if (!this.endButton) return [];
    return [{
      statusId: this.id,
      id: "end",
      label: game.i18n.localize(this.endButton.label),
      icon: this.endButton.icon ?? "",
    }];
  }


  /**
   * One of this status's buttons was clicked.
   * @param {string} buttonId          The button's id (see buttons()).
   * @param {ActiveEffect} effect      The effect the button belongs to.
   * @returns {Promise<void>}
   */
  async onButton(buttonId, effect) {
    if (buttonId === "end") return this.endStatus(effect);
  }


  /**
   * End this status on an effect: the effect is deleted when this was its only status, otherwise just this status
   * is taken off it (a spell's effect keeps its other statuses and changes). Then says so in chat, seen by the
   * actor's owners and the GMs: the given line, or the endButton's.
   * @param {ActiveEffect} effect
   * @param {object} [options]
   * @param {string} [options.chat]   Language key of the chat line ({name}, {source}). Default: the endButton's.
   * @returns {Promise<void>}
   */
  async endStatus(effect, { chat = this.endButton?.chat } = {}) {
    const actor = effect.parent;
    // Read before the effect is deleted.
    const line = (chat && actor?.documentName === "Actor") ? this.text(chat, actor, effect) : null;

    const others = [...effect.statuses].filter((id) => id !== this.id && !this.implies.includes(id));
    if (others.length) await effect.update({ statuses: others });
    else await effect.delete();

    if (line) await statusChat(actor, line);
  }
}
