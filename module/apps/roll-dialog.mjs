import LOTM_VTTRoll from "../dice/lotm-roll.mjs";
import { signedTerm } from "../helpers/skill-check-formula.mjs";
import { defaultMessageMode, messageModeButtons, postRoll } from "../helpers/message-modes.mjs";
import { currentSpirituality, spendSpirituality, spiritualityNote } from "../helpers/spirituality.mjs";
import { statusRollExtras, targetedActors } from "../effects/status-rolls.mjs";
import { checkBonusRows } from "../helpers/check-bonuses.mjs";
import { checkSucceeds, defenseValue, effectiveDefenseTarget, isAttackHit, isMissingDefenseTarget, naturalD20 } from "../helpers/check-results.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** Partials every roll dialog's template uses (templates/apps/roll-dialog/). */
const PARTIALS = "systems/lotm/templates/apps/roll-dialog";
export const ROLL_DIALOG_PARTIALS = [
  `${PARTIALS}/modifiers.hbs`,
  `${PARTIALS}/spirituality.hbs`,
  `${PARTIALS}/footer.hbs`,
];

/**
 * Shared base for every roll popup.
 *
 *   LotmRollDialog            (this file) modifiers, who-sees-it buttons, Spirituality, the Roll button, posting to chat
 *     ├─ SkillCheckDialog     (skill-check-dialog.mjs)     skills, and actions that use a skill
 *     ├─ AttributeCheckDialog (attribute-check-dialog.mjs) clicking an attribute total
 *     └─ ActionRollDialog     (action-roll-dialog.mjs)     actions with no skill, rolling their own formula
 *
 * What this class does for all of them:
 *   - opens and waits: `await SomeDialog.prompt(...)` gives the evaluated Roll, or null if the window was closed
 *     (closing rolls nothing and spends nothing)
 *   - Shift-click: prompt(..., { fast: true }) rolls straight away with the defaults, without the window
 *   - the modifiers list (add with the button or Enter, remove with the x)
 *   - four toggle buttons for who sees the roll: Public, Private GM, Blind GM, Self (helpers/message-modes.mjs).
 *     They start on the chat sidebar's choice and only change this one roll.
 *   - an optional "Spend N Spirituality" checkbox (helpers/spirituality.mjs)
 *   - an optional DC: the dialog shows it, and the chat card says whether the roll passed (meets or beats the DC;
 *     a natural 20 always passes, a natural 1 always fails: helpers/check-results.mjs)
 *   - a natural 20 / natural 1 says Big Success / Big Failure on the chat card
 *   - an action or spell with a Defense Targeted: its targeted tokens' defenses are checked, hit or miss
 *     (saved on the message as flags.lotm.attack, shown by helpers/check-chat.mjs)
 *   - every roll saves what Burning Luck needs on the message (flags.lotm.check, helpers/luck.mjs)
 *   - the DC can be typed in or changed in the window, for this roll only (not for status checks, whose DC is the
 *     rule's, or sanity and promotion checks, which are rolled against Sanity)
 *   - an action or spell with outcome tables saves them on the message, for the Roll Outcome button
 *     (helpers/outcome-tables.mjs)
 *   - statuses (effects/status-rolls.mjs): the roller's and their targets' modifiers start in the list (Angry -4,
 *     Fear -4, Advantage +2, a Helpless target +2), and their notes show in the dialog and on the chat card
 *   - rolling, and posting to chat as the character
 *
 * A dialog that extends this class only fills in its own part:
 *   static PARTS          its template (which includes the shared partials above)
 *   static prompt(...)    builds the dialog and calls this.show(app, { fast })
 *   _prepareBodyContext() the data its own section of the template needs
 *   _formula()            the full roll formula, including this.modifiers (see modifierTerms())
 *   _totalLabel()         what the Roll button shows in brackets, e.g. "+7"
 *   _flavor()             the chat message's title, e.g. "Pistol Check (Agility)"
 *   rollKind              "skill", "attribute" or "action", for the status modifiers (default "attribute")
 *   rollSkillKey          the skill rolled, for skill checks (Deaf notes Listen checks); rollSkillUuid its UUID
 *   usesStatusExtras      false for rolls the statuses' modifiers don't belong in (sanity and promotion checks)
 *   _resultFor(roll)      what the chat card says about the result, and the flags saved on the message
 * Like the sheets, Foundry merges DEFAULT_OPTIONS down the chain, so a dialog only lists what's new for it.
 */
export default class LotmRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    // "skill-check-dialog" keeps the existing dialog styles (src/scss/components/_skill-check-dialog.scss) on every roll dialog.
    classes: ["lotm", "roll-dialog", "skill-check-dialog"],
    window: {
      icon: "fa-solid fa-dice-d20",
      resizable: false
    },
    position: { width: 400, height: "auto" },
    form: {
      handler: LotmRollDialog.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      addModifier: LotmRollDialog.#onAddModifier,
      removeModifier: LotmRollDialog.#onRemoveModifier,
      setMessageMode: LotmRollDialog.#onSetMessageMode,
    }
  };

  /**
   * @param {Actor} actor
   * @param {object} [options]
   * @param {{label: string, value: number}[]} [options.modifiers]  Modifiers the list starts with (removable for this roll).
   * @param {{cost: number, reason: string}} [options.spirituality] A Spirituality cost to offer spending (an action's).
   * @param {{flags?: object, footer?: string}} [options.chat]      Extra chat message flags, and HTML added after the
   *                                                                flavor (an action's Roll Damage buttons).
   * @param {number|null} [options.dc]                              A DC to beat (Physique 15, ...), or null for none.
   * @param {object|null} [options.outcome]  What a status check decides ({ statusId, check, effectUuid }), saved on
   *                                         the message so Burning Luck can change the result (helpers/luck.mjs).
   */
  constructor(actor, { modifiers = [], spirituality = null, chat = {}, dc = null, outcome = null, ...options } = {}) {
    super(options);
    this.actor = actor;
    this.modifiers = modifiers.filter((m) => m.value).map((m) => ({ id: foundry.utils.randomID(), ...m }));
    this.messageMode = defaultMessageMode();
    this.chat = chat;
    this.dc = (dc === null || dc === undefined || Number.isNaN(Number(dc))) ? null : Number(dc);
    this.outcome = outcome;
    // Notes from statuses (Deaf, Blind, an Invisible target, ...): filled in by addStatusExtras when it opens.
    this.statusNotes = [];
    this.statusExtrasAdded = false;

    // Spirituality: ticked when the actor has enough, and it can't be ticked when they don't.
    this.spiritCost = Math.max(0, Number(spirituality?.cost) || 0);
    this.spiritReason = spirituality?.reason ?? "";
    this.spendSpirit = this.spiritCost > 0 && currentSpirituality(actor).value >= this.spiritCost;

    this.submitted = false;
    this.resolve = null;
  }

  /**
   * Open a dialog and wait for it, or roll straight away when `fast` (Shift-click).
   * Dialogs that extend this class call it from their own static prompt().
   * @param {LotmRollDialog} app
   * @param {object} [options]
   * @param {boolean} [options.fast]  Roll with the defaults, without showing the window.
   * @returns {Promise<Roll|null>}    The roll, or null if the window was closed without rolling.
   */
  static show(app, { fast = false } = {}) {
    app.addStatusExtras();
    if (fast) return app.roll();
    return new Promise((resolve) => {
      app.resolve = resolve;
      app.addEventListener("close", () => {
        if (!app.submitted) resolve(null);
      }, { once: true });
      app.render(true);
    });
  }

  /* -------------------------------------------- */
  /*  For the dialogs that extend this class       */
  /* -------------------------------------------- */

  /** What kind of roll this is, for status modifiers: "skill", "attribute" or "action". */
  get rollKind() {
    return "attribute";
  }

  /** For a skill check: the skill's UUID. */
  get rollSkillUuid() {
    return null;
  }

  /** For a skill check: the skill's key (Deaf notes Listen checks). */
  get rollSkillKey() {
    return null;
  }

  /**
   * Whether the roller's and targets' statuses add their modifiers and notes. Sanity and promotion checks say no:
   * they're rolled under a number, so Angry's -4 would help instead of hurt.
   */
  get usesStatusExtras() {
    return true;
  }

  /**
   * Whether the window has a DC box the player can type in. Not for status checks (the rule sets the DC);
   * the sanity and promotion dialogs say no too.
   */
  get isDcEditable() {
    return !this.outcome;
  }

  /** The attribute this roll uses, for its check bonus (helpers/check-bonuses.mjs). null when it isn't known. */
  get checkAttributeKey() {
    return this.attributeKey ?? null;
  }

  /**
   * Put the check bonus rows for the roll's attribute in the modifiers list ("Spirit Vision +2"), replacing the
   * ones for any attribute picked before. Removable for this roll like any other row.
   */
  refreshCheckBonuses() {
    this.modifiers = this.modifiers.filter((m) => !m.checkBonus);
    const key = this.checkAttributeKey;
    if (!key) return;
    for (const row of checkBonusRows(this.actor, key)) {
      const label = row.label.replace(/[[\]]/g, "");   // it goes into the formula as "+2[Spirit Vision]"
      this.modifiers.push({ id: foundry.utils.randomID(), label, value: row.value, img: row.img, checkBonus: true });
    }
  }

  /**
   * Add what the roller's and their targets' statuses bring to this roll (effects/status-rolls.mjs): their
   * modifiers as rows in the list, removable like any other, and their notes. Done once, when the dialog opens.
   */
  addStatusExtras() {
    if (this.statusExtrasAdded) return;
    this.statusExtrasAdded = true;
    if (!this.usesStatusExtras) return;
    const { modifiers, notes } = statusRollExtras({
      actor: this.actor,
      kind: this.rollKind,
      skillKey: this.rollSkillKey,
      skillUuid: this.rollSkillUuid,
      targets: targetedActors(),
    });
    for (const modifier of modifiers) {
      // The label goes into the roll formula as "-4[Fear vs. Bob]", so it can't have square brackets of its own.
      const label = modifier.label.replace(/[[\]]/g, "");
      this.modifiers.push({ id: foundry.utils.randomID(), label, value: modifier.value, img: modifier.img, status: true });
    }
    this.statusNotes = notes;
    this.refreshCheckBonuses();
  }

  /** Data for the dialog's own section of the template. @returns {object|Promise<object>} */
  _prepareBodyContext() {
    return {};
  }

  /** The full roll formula, including this.modifiers. @returns {string} */
  _formula() {
    throw new Error(`${this.constructor.name} must define _formula()`);
  }

  /** The Roll button's bracketed part. Default: the modifiers' total, e.g. "+2" ("" when there are none). */
  _totalLabel() {
    const total = this.modifierTotal();
    return total ? signedTerm(total) : "";
  }

  /** The chat message's title. @returns {string} */
  _flavor() {
    return "";
  }

  /** The modifiers as roll terms, e.g. "+2[Cover] -1[Wounded]" (the N[Label] style LOTM_VTTRoll shows in its breakdown). */
  modifierTerms() {
    return this.modifiers.map((m) => `${signedTerm(m.value)}[${m.label}]`).join(" ");
  }

  /** The modifiers added together. */
  modifierTotal() {
    return this.modifiers.reduce((sum, m) => sum + m.value, 0);
  }

  /* -------------------------------------------- */
  /*  Rendering                                    */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const spirit = currentSpirituality(this.actor);
    const modes = messageModeButtons(this.messageMode);
    return {
      ...(await this._prepareBodyContext()),
      modifiers: this.modifiers,
      messageModes: modes,
      messageModeLabel: modes.find((m) => m.active)?.label ?? "",
      spiritCost: this.spiritCost,
      spiritValue: spirit.value,
      spiritAffordable: spirit.value >= this.spiritCost,
      spendSpirit: this.spendSpirit,
      totalLabel: this._totalLabel(),
      dc: this.dc,
      dcEditable: this.isDcEditable,
      statusNotes: this.statusNotes,
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Remember the Spirituality checkbox, so anything that redraws the dialog keeps it.
    this.element.querySelector("input[name=spendSpirituality]")?.addEventListener("change", (ev) => {
      this.spendSpirit = ev.target.checked;
    });

    // The DC box: blank = no DC. Saved as it's typed, so pressing Enter to roll uses it.
    this.element.querySelector("input[name=dc]")?.addEventListener("input", (ev) => {
      const text = ev.target.value.trim();
      const value = Number(text);
      this.dc = (text === "" || !Number.isFinite(value)) ? null : Math.max(0, Math.floor(value));
    });

    // Enter in the modifier's number box adds it instead of rolling.
    this.element.querySelector(".add-modifier-row .mod-value")?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      LotmRollDialog.#onAddModifier.call(this, ev, ev.currentTarget);
    });
  }

  /* -------------------------------------------- */
  /*  Rolling                                      */
  /* -------------------------------------------- */

  /**
   * Roll, spend the Spirituality (if ticked) and post to chat. Used by the Roll button and by Shift-click.
   * @returns {Promise<Roll>}
   */
  async roll() {
    this.submitted = true;

    const roll = new LOTM_VTTRoll(this._formula(), this.actor.getRollData());
    await roll.evaluate();

    let spent = null;
    if (this.spiritCost > 0) {
      // Not enough: spendSpirituality warns and spends nothing. The roll still happens; the GM decides.
      if (this.spendSpirit || currentSpirituality(this.actor).value < this.spiritCost) {
        spent = await spendSpirituality(this.actor, this.spiritCost, { reason: this.spiritReason, chat: false });
      }
    }

    const result = await this._resultFor(roll);
    await postRoll(roll, {
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: this._flavor() + result.html + this.#statusNotesHTML() + spiritualityNote(spent) + (this.chat.footer ?? ""),
      flags: foundry.utils.mergeObject(foundry.utils.deepClone(this.chat.flags ?? {}), result.flags ?? {}, { inplace: false }),
    }, this.messageMode);

    this.resolve?.(roll);
    return roll;
  }

  /**
   * What the chat card says about the result, and what's saved on the message:
   *   - the DC's result, when there's a DC (meet or beat it; natural 20 passes, natural 1 fails)
   *   - "Big Success" / "Big Failure" on a natural 20 / 1
   *   - flags.lotm.check: who rolled, the total, the natural d20, the DC and its result (for Burning Luck)
   *   - flags.lotm.attack: an action's or spell's hit check against the targeted tokens (see #attackFor)
   * The sanity and promotion dialogs replace this with their own.
   * @param {Roll} roll   The evaluated roll.
   * @returns {Promise<{html: string, flags: object}>}
   */
  async _resultFor(roll) {
    const natural = naturalD20(roll);
    const check = {
      actorUuid: this.actor.uuid,
      title: LotmRollDialog.plainText(this._flavor()),
      total: roll.total,
      natural,
      kind: this.rollKind,
      dc: this.dc,
    };
    if (this.outcome) check.outcome = this.outcome;

    let html = "";
    if (this.dc !== null) {
      check.success = checkSucceeds({ total: roll.total, natural, dc: this.dc });
      html += LotmRollDialog.dcResultHTML(this.dc, check.success);
    }
    html += LotmRollDialog.naturalHTML(natural);

    // Outcome tables: drawn by the Roll Outcome button, by the result against the DC (helpers/outcome-tables.mjs).
    const successTable = this.action?.system?.successTable ?? null;
    const failureTable = this.action?.system?.failureTable ?? null;
    if (this.dc !== null && (successTable || failureTable)) check.tables = { success: successTable, failure: failureTable };

    const lotm = { check };
    const attack = this.#attackFor(roll, natural);
    if (attack) lotm.attack = attack;
    // Tokens targeted, but nothing to check them against: tell the GM why there's no Hit / Miss.
    else if (isMissingDefenseTarget(this.action?.system, game.user?.targets?.size ?? 0)) {
      html += `<p class="lotm-gm-only hint">${game.i18n.format("LORD_OF_THE_MYSTERIES.Attack.NoDefenseTarget", {
        name: Handlebars.escapeExpression(this.action.name),
      })}</p>`;
    }
    return { html, flags: { lotm } };
  }

  /**
   * An action's or spell's hit check: its Defense Targeted (system.defenseTarget) against each token the user has
   * targeted. A gun shot left blank uses "too fast to dodge" (effectiveDefenseTarget). null when the roll isn't for
   * an action with a defense to check.
   * The defenses aren't written into the card: helpers/check-chat.mjs shows Hit / Miss to everyone and the numbers
   * only to the GM.
   * @param {Roll} roll
   * @param {number|null} natural
   * @returns {{defenseTarget: string, targets: {tokenUuid: string, actorUuid: string, name: string, defense: number|null, hit: boolean|null}[]}|null}
   */
  #attackFor(roll, natural) {
    const defenseTarget = effectiveDefenseTarget(this.action?.system);
    if (!defenseTarget) return null;
    const targets = [...(game.user?.targets ?? [])].filter((token) => token.actor).map((token) => {
      const defense = defenseValue(token.actor.system, defenseTarget);
      return {
        tokenUuid: token.document.uuid,
        actorUuid: token.actor.uuid,
        name: token.name,
        defense,
        hit: defense === null ? null : isAttackHit({ total: roll.total, natural, defense }),
      };
    });
    return { defenseTarget, targets };
  }

  /**
   * " DC 15: Success" (or Failure) for a chat card.
   * @param {number} dc
   * @param {boolean} success
   * @returns {string}
   */
  static dcResultHTML(dc, success) {
    const result = game.i18n.localize(`LORD_OF_THE_MYSTERIES.RollDialog.${success ? "Success" : "Failure"}`);
    return ` <span class="roll-dc-result ${success ? "success" : "failure"}">`
      + `${game.i18n.format("LORD_OF_THE_MYSTERIES.RollDialog.DCResult", { dc, result })}</span>`;
  }

  /**
   * "Big Success" on a natural 20, "Big Failure" on a natural 1, nothing otherwise.
   * @param {number|null} natural
   * @returns {string}
   */
  static naturalHTML(natural) {
    if (natural !== 20 && natural !== 1) return "";
    const isSuccess = natural === 20;
    const label = game.i18n.localize(`LORD_OF_THE_MYSTERIES.RollDialog.${isSuccess ? "BigSuccess" : "BigFailure"}`);
    return `<div class="lotm roll-natural ${isSuccess ? "big-success" : "big-failure"}">`
      + `<i class="fa-solid ${isSuccess ? "fa-star" : "fa-skull"}"></i> ${label}</div>`;
  }

  /**
   * HTML as plain text ("Shoot: Pistol Check (Agility)"), for saving a roll's title in its flags.
   * @param {string} html
   * @returns {string}
   */
  static plainText(html) {
    const div = document.createElement("div");
    div.innerHTML = html ?? "";
    return div.textContent.trim();
  }

  /** The status notes for the chat card, or "" when there are none. */
  #statusNotesHTML() {
    if (!this.statusNotes.length) return "";
    return `<div class="lotm roll-status-notes">${this.statusNotes.map((note) => `<p>${note}</p>`).join("")}</div>`;
  }

  static async #onSubmit(event, form, formData) {
    await this.roll();
  }

  /** @override */
  async close(options) {
    if (!this.submitted) this.resolve?.(null);
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Buttons                                      */
  /* -------------------------------------------- */

  static #onAddModifier(event, target) {
    const nameInput = this.element.querySelector(".add-modifier-row .mod-name");
    const valueInput = this.element.querySelector(".add-modifier-row .mod-value");
    const value = Number(valueInput.value);

    if (!value || Number.isNaN(value)) {
      ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.SkillCheck.InvalidModifier"));
      return;
    }

    this.modifiers.push({
      id: foundry.utils.randomID(),
      label: nameInput.value.trim() || game.i18n.localize(value > 0 ? "LORD_OF_THE_MYSTERIES.RollDialog.Bonus" : "LORD_OF_THE_MYSTERIES.RollDialog.Penalty"),
      value
    });
    this.render();
  }

  static #onRemoveModifier(event, target) {
    const id = target.dataset.modifierId;
    this.modifiers = this.modifiers.filter((m) => m.id !== id);
    this.render();
  }

  /**
   * One of the who-sees-it buttons (data-mode). Changes the buttons in place rather than redrawing the dialog,
   * so a modifier that's half typed in isn't lost.
   */
  static #onSetMessageMode(event, target) {
    this.messageMode = target.dataset.mode;
    for (const button of this.element.querySelectorAll("[data-action=setMessageMode]")) {
      const active = button.dataset.mode === this.messageMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    const label = this.element.querySelector(".roll-mode-label");
    if (label) label.textContent = target.dataset.tooltip ?? "";
  }
}
