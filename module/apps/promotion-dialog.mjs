import LotmRollDialog, { ROLL_DIALOG_PARTIALS } from "./roll-dialog.mjs";
import { signedTerm } from "../helpers/skill-check-formula.mjs";
import { sanityCheckSucceeds } from "../helpers/check-results.mjs";
import { PROMOTION_BASE, REPEATED_BASE, promotionCardHTML, promotionModifiers } from "../helpers/promotion.mjs";
import { formatHTML } from "../helpers/render.mjs";

/**
 * PromotionDialog
 * ---------------
 * Opens when a Sequence is added to a character or NPC (helpers/promotion.mjs registerPromotionHooks), for the user
 * who added it. Skip closes it without a check (character creation, building an NPC).
 *
 * The check is 1d20 + 20 + modifiers, at or under current Sanity to pass, with no Big Success or Big Failure.
 * The dialog fills in what it can from the actor:
 *   - Digestion: the most advanced Sequence it already had (-1 per point)
 *   - Undigested lower potions: its other Sequences under 20 digestion (+1 each)
 *   - Repeated potion: the new Sequence has the same number as the current one (+40 instead of +20)
 * and asks for the rest (auxiliary ingredients, raw characteristic, imprint, helper, moon, animal, ritual,
 * followers). Extra modifiers can be added in the list as usual (positive = worse). Statuses don't add theirs.
 *
 * After rolling, the card says pass or fail and has a Roll Loss button: nothing is lost until it's clicked. It rolls
 * the Sanity loss for the Sequence (doubled without a ritual, less the ritual's 5 protection and followers), takes it
 * off, and posts where the promotion stands, with a button for the next step (helpers/promotion.mjs). A clean
 * promotion adds Spiritual Overflow.
 */
export default class PromotionDialog extends LotmRollDialog {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["promotion-dialog"],
    window: { icon: "fa-solid fa-flask" },
    position: { width: 460 },
    actions: {
      skipPromotion: PromotionDialog.#onSkip,
    },
  };

  /** @override */
  static PARTS = {
    form: { template: "systems/lotm/templates/apps/promotion-dialog.hbs", templates: ROLL_DIALOG_PARTIALS }
  };

  /**
   * @param {Actor} actor
   * @param {Item} sequence   The Sequence just added.
   * @param {object} [options]
   */
  constructor(actor, sequence, options = {}) {
    super(actor, options);
    this.sequence = sequence;

    // What the actor already had: its most advanced other Sequence is the potion it's digesting now.
    const others = actor.items.filter((item) => item.type === "sequence" && item.id !== sequence.id);
    const current = others.reduce((best, item) =>
      (!best || item.system.sequence_number < best.system.sequence_number ? item : best), null);
    const undigested = others.filter((item) => item !== current && (item.system.digestionAmount ?? 1) < 20).length;

    /** The dialog's choices. Kept here (not in the form) so redrawing keeps them. */
    this.inputs = {
      digestion: current?.system.digestionAmount ?? 0,
      auxiliary: 0,
      isRaw: false,
      imprint: "none",
      undigested,
      isRepeated: !!current && current.system.sequence_number === sequence.system.sequence_number,
      isHelped: false,
      helperSequences: 0,
      moon: "none",
      isAnimal: false,
      hasRitual: true,
      followers: 0,
    };
  }

  /**
   * Open the promotion dialog for a Sequence just added to an actor.
   * @param {Actor} actor
   * @param {Item} sequence
   * @returns {Promise<Roll|null>}  null when skipped.
   */
  static async prompt(actor, sequence) {
    if (!actor?.system?.resources?.rp || sequence?.type !== "sequence") return null;
    return this.show(new this(actor, sequence));
  }

  /** @override */
  get usesStatusExtras() {
    return false;
  }

  /** @override */
  get rollKind() {
    return "promotion";
  }

  /** Rolled against Sanity, not a DC. @override */
  get isDcEditable() {
    return false;
  }

  /** The Sequence's number (9 ... 0). */
  get sequenceNumber() {
    return Number(this.sequence.system.sequence_number);
  }

  /** "Sequence 8: Clown" */
  get sequenceName() {
    return game.i18n.format("LORD_OF_THE_MYSTERIES.Promotion.SequenceName", {
      number: this.sequenceNumber, name: this.sequence.name,
    });
  }

  /** @override */
  get title() {
    return game.i18n.format("LORD_OF_THE_MYSTERIES.Promotion.Title", { name: this.actor.name });
  }

  /** Current Sanity. */
  get sanity() {
    return Number(this.actor.system.resources?.rp?.value) || 0;
  }

  /** +20, or +40 for a repeated potion. */
  get base() {
    return this.inputs.isRepeated ? REPEATED_BASE : PROMOTION_BASE;
  }

  /** The modifiers from the choices, with their labels. */
  get choiceModifiers() {
    return promotionModifiers(this.inputs).map((row) => ({
      ...row, label: game.i18n.localize(`LORD_OF_THE_MYSTERIES.Promotion.Modifiers.${row.key}`),
    }));
  }

  /** The choices' modifiers and the list's, added up (not the +20). */
  get allModifiersTotal() {
    return this.choiceModifiers.reduce((sum, row) => sum + row.value, 0) + this.modifierTotal();
  }

  /** @override */
  _prepareBodyContext() {
    const loss = CONFIG.LORD_OF_THE_MYSTERIES.promotionSanityLoss?.[this.sequenceNumber] ?? { success: "0", failure: "0" };
    return {
      sequenceName: this.sequenceName,
      sequenceImg: this.sequence.img,
      sanity: this.sanity,
      lossSuccess: loss.success,
      lossFailure: loss.failure,
      base: this.base,
      inputs: this.inputs,
      choiceModifiers: this.choiceModifiers,
      hasFollowers: this.sequenceNumber <= 2,
      imprintOptions: {
        none: "LORD_OF_THE_MYSTERIES.Promotion.Imprint.none",
        similar: "LORD_OF_THE_MYSTERIES.Promotion.Imprint.similar",
        opposite: "LORD_OF_THE_MYSTERIES.Promotion.Imprint.opposite",
      },
      moonOptions: {
        none: "LORD_OF_THE_MYSTERIES.Promotion.Moon.none",
        full: "LORD_OF_THE_MYSTERIES.Promotion.Moon.full",
        blood: "LORD_OF_THE_MYSTERIES.Promotion.Moon.blood",
      },
    };
  }

  /** "+20 -12 = +8" style: the base plus every modifier. @override */
  _totalLabel() {
    return signedTerm(this.base + this.allModifiersTotal);
  }

  /** "1d20 +20[Promotion] -12[Digestion] ..." @override */
  _formula() {
    const baseLabel = game.i18n.localize("LORD_OF_THE_MYSTERIES.Promotion.Modifiers.Base");
    const choices = this.choiceModifiers.map((row) => `${signedTerm(row.value)}[${row.label}]`).join(" ");
    return ["1d20", `${signedTerm(this.base)}[${baseLabel}]`, choices, this.modifierTerms()].filter(Boolean).join(" ");
  }

  /** "Promotion: Sequence 8: Clown" @override */
  _flavor() {
    return formatHTML("LORD_OF_THE_MYSTERIES.Promotion.Flavor", { sequence: this.sequenceName });
  }

  /**
   * Pass or fail against Sanity. Nothing is lost yet: the card's Roll Loss button rolls the loss and takes it off
   * (rollLoss in helpers/promotion.mjs).
   * @override
   */
  async _resultFor(roll) {
    const sanity = this.sanity;
    const success = sanityCheckSucceeds({ total: roll.total, sanity, isPromotion: true });
    const table = CONFIG.LORD_OF_THE_MYSTERIES.promotionSanityLoss?.[this.sequenceNumber] ?? { success: "0", failure: "0" };

    const html = LotmRollDialog.resultHTML({ result: { key: "LORD_OF_THE_MYSTERIES.Sanity.Result", data: { sanity }, success } })
      + promotionCardHTML("pendingLoss", { name: this.actor.name, sequence: this.sequenceName });

    return {
      html,
      flags: {
        lotm: {
          // kind "promotion": Burning Luck isn't offered on promotion checks.
          check: { actorUuid: this.actor.uuid, title: LotmRollDialog.plainText(this._flavor()), total: roll.total, natural: null, kind: "promotion", sanity, success },
          promotion: {
            actorUuid: this.actor.uuid,
            sequenceUuid: this.sequence.uuid,
            sequenceName: this.sequenceName,
            sequence: this.sequenceNumber,
            stage: "pendingLoss",
            success,
            // What the Roll Loss button rolls: the Sequence's loss for this result, then the ritual and followers.
            lossFormula: (success ? table.success : table.failure) || "0",
            hasRitual: !!this.inputs.hasRitual,
            followers: this.inputs.followers ?? 0,
            totalLoss: 0,
            // The promotion's modifiers without the +20, for the semi-out-of-control sanity check.
            modifierTotal: this.allModifiersTotal,
            used: [],
          },
        },
      },
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Every choice saves into this.inputs and redraws, so the modifiers and the Roll button's total stay right.
    for (const input of this.element.querySelectorAll("[data-promotion-input]")) {
      input.addEventListener("change", (ev) => {
        const field = ev.target;
        const key = field.dataset.promotionInput;
        if (field.type === "checkbox") this.inputs[key] = field.checked;
        else if (field.type === "number") this.inputs[key] = Math.max(0, Math.floor(Number(field.value) || 0));
        else this.inputs[key] = field.value;
        this.render();
      });
    }
  }

  /** Skip: close without a check. */
  static #onSkip(event, target) {
    this.close();
  }
}
