import LotmRollDialog, { ROLL_DIALOG_PARTIALS } from "./roll-dialog.mjs";
import { signedTerm } from "../helpers/skill-check-formula.mjs";
import { naturalD20, sanityCheckSucceeds } from "../helpers/check-results.mjs";
import { formatHTML } from "../helpers/render.mjs";

/**
 * SanityCheckDialog
 * -----------------
 * A sanity check (rulebook, Chapter 5: Going out of control): roll d20 at or under your current Sanity to pass.
 *   - Loss on a pass and on a fail ("1/1d3" in the book: 1 on a pass, 1d3 on a fail). Formulas, so "0", "1d3", "2d10".
 *   - Modifiers are added to the d20, so a positive one makes failing likelier ("Sanity check +2 disadvantageous").
 *     The roller's statuses don't add theirs (Angry's -4 would help here).
 *   - A natural 20 is a Big Failure: the fail loss at its highest. There's no Big Success.
 *   - Solidified (mental solidification): 1 less Sanity lost, never below 0.
 * The card only says pass or fail. The loss is rolled by its Roll Loss button (rollSanityLoss in helpers/sanity.mjs),
 * like an attack's Roll Damage, so Luck can be burned first: the button rolls the loss for the result at that moment.
 * Rolling it takes it off: 3+ at once starts Semi-Out-of-Control; Indeterminate Madness and Out of Control follow the
 * new Sanity. Luck burned after the loss was rolled still works (helpers/luck.mjs): a flipped result rolls the other
 * loss and gives back or takes the difference.
 *
 * Opened by the Check button under Sanity on the player and NPC sheets, Semi-Out-of-Control's failed Will check,
 * and macros: game.lotm.sanityCheck(actor, { loss: "1/1d3", reason: "Saw the Wraith" }).
 */
export default class SanityCheckDialog extends LotmRollDialog {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sanity-check-dialog"],
    window: { icon: "fa-solid fa-brain" },
  };

  /** @override */
  static PARTS = {
    form: { template: "systems/lotm/templates/apps/sanity-check-dialog.hbs", templates: ROLL_DIALOG_PARTIALS }
  };

  /**
   * @param {Actor} actor
   * @param {object} [options]
   * @param {string} [options.success]       Loss on a pass (formula).
   * @param {string} [options.failure]       Loss on a fail (formula).
   * @param {number} [options.penalty]       A modifier on the d20 to start with (positive = likelier to fail).
   * @param {string} [options.reason]        What caused it, e.g. "Saw the Wraith".
   * @param {boolean} [options.isSolidified] Mental solidification: 1 less lost.
   */
  constructor(actor, { success = "0", failure = "1", penalty = 0, reason = "", isSolidified = false, ...options } = {}) {
    super(actor, {
      modifiers: penalty ? [{ label: game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.Penalty"), value: Number(penalty) || 0 }] : [],
      ...options,
    });
    this.lossSuccess = String(success ?? "0");
    this.lossFailure = String(failure ?? "1");
    this.reason = reason ?? "";
    this.isSolidified = !!isSolidified;
  }

  /**
   * Open the dialog (or, with `fast`, roll right away).
   * @param {Actor} actor
   * @param {object} [options]   See the constructor, plus `fast`.
   * @returns {Promise<Roll|null>}
   */
  static async prompt(actor, { fast = false, ...options } = {}) {
    if (!actor?.system?.resources?.rp) return null;
    return this.show(new this(actor, options), { fast });
  }

  /** @override */
  get usesStatusExtras() {
    return false;
  }

  /** @override */
  get rollKind() {
    return "sanity";
  }

  /** Rolled against Sanity, not a DC. @override */
  get isDcEditable() {
    return false;
  }

  /** @override */
  get title() {
    return game.i18n.format("LORD_OF_THE_MYSTERIES.Sanity.Title", { name: this.actor.name });
  }

  /** Current Sanity. */
  get sanity() {
    return Number(this.actor.system.resources?.rp?.value) || 0;
  }

  /** Both losses are rollable formulas. */
  get lossesAreValid() {
    return [this.lossSuccess, this.lossFailure].every((formula) => Roll.validate(formula || "0"));
  }

  /** @override */
  _prepareBodyContext() {
    return {
      sanity: this.sanity,
      sanityMax: Number(this.actor.system.resources?.rp?.max) || 0,
      lossSuccess: this.lossSuccess,
      lossFailure: this.lossFailure,
      reason: this.reason,
      isSolidified: this.isSolidified,
      lossesAreValid: this.lossesAreValid,
    };
  }

  /** "+2" when there are modifiers. @override */
  _totalLabel() {
    const total = this.modifierTotal();
    return total ? signedTerm(total) : "";
  }

  /** "1d20 +2[Penalty]" @override */
  _formula() {
    return ["1d20", this.modifierTerms()].filter(Boolean).join(" ");
  }

  /** "Saw the Wraith: Sanity Check (1/1d3)" @override */
  _flavor() {
    return LotmRollDialog.withReason(this.reason, formatHTML("LORD_OF_THE_MYSTERIES.Sanity.Flavor", {
      success: this.lossSuccess || "0", failure: this.lossFailure || "0",
    }));
  }

  /**
   * Pass or fail against current Sanity. Nothing is lost yet: the card's Roll Loss button does that.
   * @override
   */
  async _resultFor(roll) {
    const natural = naturalD20(roll);
    const sanity = this.sanity;
    const success = sanityCheckSucceeds({ total: roll.total, natural, sanity });

    const html = LotmRollDialog.resultHTML({
      result: { key: "LORD_OF_THE_MYSTERIES.Sanity.Result", data: { sanity }, success },
      // A natural 20 on a sanity check is a Big Failure: the most Sanity is lost.
      natural: natural === 20 ? { css: "big-failure", icon: "fa-skull", label: "LORD_OF_THE_MYSTERIES.Sanity.BigFailure" } : null,
    });

    const check = {
      actorUuid: this.actor.uuid,
      title: LotmRollDialog.plainText(this._flavor()),
      total: roll.total,
      natural,
      kind: "sanity",
      sanity,
      success,
      lossFormulas: { success: this.lossSuccess || "0", failure: this.lossFailure || "0" },
      isSolidified: this.isSolidified,
      // The loss is rolled by the card's Roll Loss button. (Checks from before the button had it rolled already,
      // with check.loss saved instead.)
      isLossPending: true,
      outcome: { type: "sanity" },
    };
    return { html, flags: { lotm: { check } } };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const submit = this.element.querySelector("button[type=submit]");
    const warning = this.element.querySelector(".sanity-loss-invalid");
    const refresh = () => {
      if (submit) submit.disabled = !this.lossesAreValid;
      warning?.classList.toggle("hidden", this.lossesAreValid);
    };

    // These fields aren't saved anywhere; remember them so a redraw (adding a modifier) keeps them.
    const bind = (name, apply) => this.element.querySelector(`[name=${name}]`)?.addEventListener("input", (ev) => {
      apply(ev.target);
      refresh();
    });
    bind("lossSuccess", (input) => { this.lossSuccess = input.value.trim(); });
    bind("lossFailure", (input) => { this.lossFailure = input.value.trim(); });
    bind("reason", (input) => { this.reason = input.value; });
    this.element.querySelector("[name=isSolidified]")?.addEventListener("change", (ev) => {
      this.isSolidified = ev.target.checked;
    });
    refresh();
  }
}
