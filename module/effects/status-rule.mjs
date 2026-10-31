/**
 * The rules of one status (Bound, Fear, Bleeding, ...).
 *
 *   StatusRule       (this file) everything a status can do with settings alone: change Physical Defense and
 *                    movement, link to its rules page, show a button that ends it, a line on the start-of-turn card
 *     ├─ BleedingRule  (rules/bleeding.mjs)  start of turn: roll 1d2 Health lost; Treated button
 *     ├─ BloodbathRule (rules/bloodbath.mjs) starts Bleeding; start of turn: Physique 15 or faint (Helpless)
 *     ├─ DyingRule     (rules/dying.mjs)     start of turn: Physique 15 or die; Will 15 to act
 *     ├─ FearRule      (rules/fear.mjs)      start of turn and Effects tab: Will 15 to resist the forced movement
 *     └─ AngryRule     (rules/angry.mjs)     start of turn and Effects tab: Will 20 to calm down; meditation
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
 */

import { statusChat } from "./status-checks.mjs";

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
   * both escaped, ready to put in chat HTML.
   * @param {string} key
   * @param {Actor} actor
   * @param {ActiveEffect} [effect]
   * @param {object} [extra]   More values for the string.
   * @returns {string}
   */
  text(key, actor, effect = null, extra = {}) {
    const escape = Handlebars.escapeExpression;
    const source = effect?.sourceActor?.name ?? game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.TheSource");
    return game.i18n.format(key, { name: escape(actor?.name ?? ""), source: escape(source), ...extra });
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
