import LotmRollDialog, { ROLL_DIALOG_PARTIALS } from "./roll-dialog.mjs";
import { signedTerm } from "../helpers/skill-check-formula.mjs";

/**
 * AttributeCheckDialog
 * --------------------
 * Popup for an attribute check (clicking an attribute's total on a sheet): 1d20 plus the attribute's total,
 * plus any modifiers. Built on LotmRollDialog (roll-dialog.mjs), which gives it the modifiers list, the
 * who-sees-it buttons and the Roll button. This class only adds which attribute it is.
 */
export default class AttributeCheckDialog extends LotmRollDialog {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["attribute-check-dialog"],
  };

  /** @override */
  static PARTS = {
    form: { template: "systems/lotm/templates/apps/attribute-check-dialog.hbs", templates: ROLL_DIALOG_PARTIALS }
  };

  /**
   * @param {Actor} actor
   * @param {string} attributeKey   A key of CONFIG.LORD_OF_THE_MYSTERIES.attributes ("str", "agi", ...).
   * @param {object} [options]
   */
  constructor(actor, attributeKey, options = {}) {
    super(actor, options);
    this.attributeKey = attributeKey;
  }

  /**
   * Open the dialog (or, with `fast`, roll right away).
   * @param {Actor} actor
   * @param {string} attributeKey
   * @param {object} [options]
   * @param {boolean} [options.fast]  Shift-click: roll right away with no modifiers.
   * @returns {Promise<Roll|null>}
   */
  static async prompt(actor, attributeKey, { fast = false } = {}) {
    if (!actor?.system.attributes?.[attributeKey]) return null;
    return this.show(new this(actor, attributeKey), { fast });
  }

  /** "Strength" */
  get attributeName() {
    return game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.attributes[this.attributeKey]);
  }

  /** The attribute's total. */
  get attributeTotal() {
    return this.actor.system.attributes[this.attributeKey]?.total ?? 0;
  }

  /** @override */
  get title() {
    return game.i18n.format("LORD_OF_THE_MYSTERIES.AttributeCheck.Title", { attribute: this.attributeName });
  }

  /** @override */
  _prepareBodyContext() {
    return { attributeName: this.attributeName, attributeTotal: this.attributeTotal };
  }

  /** @override */
  _totalLabel() {
    return signedTerm(this.attributeTotal + this.modifierTotal());
  }

  /** "1d20 +3[STR] +2[Cover]" @override */
  _formula() {
    const abbr = game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.attributeAbbreviations[this.attributeKey]).toUpperCase();
    return [`1d20`, `${signedTerm(this.attributeTotal)}[${abbr}]`, this.modifierTerms()].filter(Boolean).join(" ");
  }

  /** @override */
  _flavor() {
    return game.i18n.format("LORD_OF_THE_MYSTERIES.AttributeCheck.Flavor", { attribute: this.attributeName });
  }
}
