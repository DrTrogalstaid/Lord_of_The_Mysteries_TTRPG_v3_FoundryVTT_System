import LotmRollDialog, { ROLL_DIALOG_PARTIALS } from "./roll-dialog.mjs";
import { signedTerm } from "../helpers/skill-check-formula.mjs";
import { spiritualIntuitionRows } from "../helpers/check-bonuses.mjs";
import { formatHTML } from "../helpers/render.mjs";

/**
 * AttributeCheckDialog
 * --------------------
 * Popup for an attribute check (clicking an attribute's total on a sheet): 1d20 plus the attribute's total,
 * plus any modifiers. Built on LotmRollDialog (roll-dialog.mjs), which gives it the modifiers list, the
 * who-sees-it buttons and the Roll button. This class only adds which attribute it is.
 *
 * Inspiration checks have a "Spiritual Intuition" box (rulebook, Special Actions: a passive Inspiration check,
 * DC 25). Ticked, the check gets DC 25, its title says Spiritual Intuition, and the actor's spiritual intuition
 * bonuses (system.spiritualIntuitionBonus: Spirit Vision +2) are added as rows. The GM can also open it ticked:
 *   game.lotm.spiritualIntuition(actor)
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
   * @param {string} [options.reason]  Why it's rolled, shown in front of the chat card's title, e.g. "Bloodbath".
   * @param {number} [options.dc]      A DC to beat (see LotmRollDialog).
   * @param {boolean} [options.isSpiritualIntuition]  Start with the Spiritual Intuition box ticked (Inspiration only).
   */
  constructor(actor, attributeKey, { reason = "", isSpiritualIntuition = false, ...options } = {}) {
    super(actor, options);
    this.attributeKey = attributeKey;
    this.reason = reason;
    // The DC the check was opened with, so unticking Spiritual Intuition goes back to it.
    this.baseDc = this.dc;
    this.isSpiritualIntuition = false;
    if (isSpiritualIntuition) this.setSpiritualIntuition(true);
  }

  /**
   * Open the dialog (or, with `fast`, roll right away).
   * @param {Actor} actor
   * @param {string} attributeKey
   * @param {object} [options]
   * @param {boolean} [options.fast]   Shift-click: roll right away with no modifiers.
   * @param {number} [options.dc]      A DC to beat: the chat card says whether it passed (status checks).
   * @param {string} [options.reason]  Why it's rolled, e.g. "Bloodbath": "Bloodbath: Physique Check".
   * @param {object} [options.outcome] What a status check decides (see LotmRollDialog), for Burning Luck.
   * @param {boolean} [options.isSpiritualIntuition]  A spiritual intuition check (Inspiration, DC 25).
   * @returns {Promise<Roll|null>}
   */
  static async prompt(actor, attributeKey, { fast = false, dc = null, reason = "", outcome = null, isSpiritualIntuition = false } = {}) {
    if (!actor?.system.attributes?.[attributeKey]) return null;
    return this.show(new this(actor, attributeKey, { dc, reason, outcome, isSpiritualIntuition }), { fast });
  }

  /** "Strength" */
  get attributeName() {
    return game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.attributes[this.attributeKey]);
  }

  /** The attribute's total. */
  get attributeTotal() {
    return this.actor.system.attributes[this.attributeKey]?.total ?? 0;
  }

  /** Only Inspiration checks can be spiritual intuition checks. */
  get canBeSpiritualIntuition() {
    return this.attributeKey === "ins";
  }

  /**
   * Tick or untick Spiritual Intuition: the DC, and the spiritual intuition bonus rows (Spirit Vision +2).
   * @param {boolean} isOn
   */
  setSpiritualIntuition(isOn) {
    this.isSpiritualIntuition = !!isOn && this.canBeSpiritualIntuition;
    this.modifiers = this.modifiers.filter((m) => !m.spiritualIntuition);
    if (this.isSpiritualIntuition) {
      this.dc = CONFIG.LORD_OF_THE_MYSTERIES.spiritualIntuitionDC ?? 25;
      for (const row of spiritualIntuitionRows(this.actor)) {
        const label = row.label.replace(/[[\]]/g, "");   // it goes into the formula as "+2[Spirit Vision]"
        this.modifiers.push({ id: foundry.utils.randomID(), label, value: row.value, img: row.img, spiritualIntuition: true });
      }
    } else {
      this.dc = this.baseDc;
    }
  }

  /** @override */
  get title() {
    if (this.isSpiritualIntuition) return game.i18n.localize("LORD_OF_THE_MYSTERIES.SpiritualIntuition.Title");
    return game.i18n.format("LORD_OF_THE_MYSTERIES.AttributeCheck.Title", { attribute: this.attributeName });
  }

  /** @override */
  _prepareBodyContext() {
    return {
      attributeName: this.attributeName,
      attributeTotal: this.attributeTotal,
      canBeSpiritualIntuition: this.canBeSpiritualIntuition,
      isSpiritualIntuition: this.isSpiritualIntuition,
      spiritualIntuitionDC: CONFIG.LORD_OF_THE_MYSTERIES.spiritualIntuitionDC ?? 25,
    };
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

  /** "Physique Check", "Bloodbath: Physique Check", or "Spiritual Intuition (Inspiration)". @override */
  _flavor() {
    const key = this.isSpiritualIntuition ? "LORD_OF_THE_MYSTERIES.SpiritualIntuition.Flavor" : "LORD_OF_THE_MYSTERIES.AttributeCheck.Flavor";
    return LotmRollDialog.withReason(this.reason, formatHTML(key, { attribute: this.attributeName }));
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("input[name=isSpiritualIntuition]")?.addEventListener("change", (ev) => {
      this.setSpiritualIntuition(ev.target.checked);
      // The window's title changes too ("Spiritual Intuition" / "Inspiration Check").
      if (this.window?.title) this.window.title.textContent = this.title;
      this.render();
    });
  }
}
