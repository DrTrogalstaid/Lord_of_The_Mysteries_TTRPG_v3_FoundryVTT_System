import LotmRollDialog, { ROLL_DIALOG_PARTIALS } from "./roll-dialog.mjs";
import { spiritualityCost } from "../helpers/spirituality.mjs";

/**
 * ActionRollDialog
 * ----------------
 * Popup for an action that has no skill: it rolls the action's own Attack Roll Macro
 * (e.g. "1d20 +@attributes.agi.total[AGI]") plus any modifiers. Opened by helpers/action-roll.mjs.
 * Built on LotmRollDialog (roll-dialog.mjs), which gives it the modifiers list, the who-sees-it buttons,
 * the Spirituality checkbox and the Roll button. This class only adds the action and its formula.
 * (Actions that use a skill go through SkillCheckDialog instead.)
 */
export default class ActionRollDialog extends LotmRollDialog {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["action-roll-dialog"],
  };

  /** @override */
  static PARTS = {
    form: { template: "systems/lotm/templates/apps/action-roll-dialog.hbs", templates: ROLL_DIALOG_PARTIALS }
  };

  /**
   * @param {Actor} actor
   * @param {Item} action
   * @param {string} formula            The action's Attack Roll Macro (already checked to be a valid formula).
   * @param {object} [options]
   * @param {object} [options.chat]     Chat flags and the damage buttons (see actionChatExtras in action-roll.mjs).
   */
  constructor(actor, action, formula, { chat = {}, ...options } = {}) {
    super(actor, {
      // The action's Modifiers field starts in the list, labelled with its name, removable for this roll.
      modifiers: [{ label: action.name, value: Number(action.system.modifiers) || 0 }],
      spirituality: { cost: spiritualityCost(action), reason: action.name },
      chat,
      ...options
    });
    this.action = action;
    this.baseFormula = formula;
  }

  /**
   * Open the dialog (or, with `fast`, roll right away).
   * @param {Actor} actor
   * @param {Item} action
   * @param {string} formula
   * @param {object} [options]
   * @param {object} [options.chat]
   * @param {boolean} [options.fast]  Shift-click: roll right away with the defaults.
   * @returns {Promise<Roll|null>}
   */
  static async prompt(actor, action, formula, { chat = {}, fast = false } = {}) {
    return this.show(new this(actor, action, formula, { chat }), { fast });
  }

  /** The formula with the actor's numbers filled in, e.g. "1d20 +3[AGI]", for showing in the dialog. */
  get filledFormula() {
    return Roll.replaceFormulaData(this.baseFormula, this.actor.getRollData(), { missing: "0" });
  }

  /** @override */
  get title() {
    return this.action.name;
  }

  /** @override */
  _prepareBodyContext() {
    return { actionName: this.action.name, actionDice: this.filledFormula };
  }

  /** "1d20 +3[AGI] +2" (just the formula when there are no modifiers) @override */
  _totalLabel() {
    const mods = super._totalLabel();
    return mods ? `${this.filledFormula} ${mods}` : this.filledFormula;
  }

  /** @override */
  _formula() {
    return [this.baseFormula, this.modifierTerms()].filter(Boolean).join(" ");
  }

  /** @override */
  _flavor() {
    return Handlebars.escapeExpression(this.action.name);
  }
}
