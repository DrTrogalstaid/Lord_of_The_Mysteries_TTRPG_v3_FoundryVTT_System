import LOTM_VTTRoll from "../dice/lotm-roll.mjs";
import { signedTerm } from "../helpers/skill-check-formula.mjs";
import { defaultMessageMode, messageModeButtons, postRoll } from "../helpers/message-modes.mjs";
import { currentSpirituality, spendSpirituality, spiritualityNote } from "../helpers/spirituality.mjs";

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
 *   - rolling, and posting to chat as the character
 *
 * A dialog that extends this class only fills in its own part:
 *   static PARTS          its template (which includes the shared partials above)
 *   static prompt(...)    builds the dialog and calls this.show(app, { fast })
 *   _prepareBodyContext() the data its own section of the template needs
 *   _formula()            the full roll formula, including this.modifiers (see modifierTerms())
 *   _totalLabel()         what the Roll button shows in brackets, e.g. "+7"
 *   _flavor()             the chat message's title, e.g. "Pistol Check (Agility)"
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
   */
  constructor(actor, { modifiers = [], spirituality = null, chat = {}, ...options } = {}) {
    super(options);
    this.actor = actor;
    this.modifiers = modifiers.filter((m) => m.value).map((m) => ({ id: foundry.utils.randomID(), ...m }));
    this.messageMode = defaultMessageMode();
    this.chat = chat;

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
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Remember the Spirituality checkbox, so anything that redraws the dialog keeps it.
    this.element.querySelector("input[name=spendSpirituality]")?.addEventListener("change", (ev) => {
      this.spendSpirit = ev.target.checked;
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

    await postRoll(roll, {
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: this._flavor() + spiritualityNote(spent) + (this.chat.footer ?? ""),
      flags: this.chat.flags ?? {},
    }, this.messageMode);

    this.resolve?.(roll);
    return roll;
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
