import StatusRule from "../status-rule.mjs";
import { rollStatusCheck, statusChat } from "../status-checks.mjs";

/** The Will check to resist the forced movement. */
const RESIST_DC = 15;

/**
 * Fear (rulebook: Fear). The source is the effect's system.source (whoever caused it).
 *   - Every movement action can only go away from the source. A Will check (DC 15) resists that for good
 *     (system.hasResisted), unless a new fear effect is added. Rolled from the start-of-turn card or the
 *     Effects tab's Resist button.
 *   - Checks related to the source are -4, resisted or not (a row in the roll dialogs, effects/status-rolls.mjs).
 */
export default class FearRule extends StatusRule {

  /** @override */
  turnStart(actor, effect) {
    if (effect.system?.hasResisted) {
      return { text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.FearResisted", actor, effect) };
    }
    return {
      text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.Fear", actor, effect, { dc: RESIST_DC }),
      buttons: [{ check: "resist", label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollWill", { dc: RESIST_DC }) }],
    };
  }


  /** @override */
  async onTurnCheck(check, effect, options = {}) {
    if (check !== "resist") return false;
    return this.#resist(effect, options);
  }


  /** Resist on the Effects tab too, until it's been resisted. @override */
  buttons(effect) {
    const buttons = super.buttons(effect);
    if (!effect.system?.hasResisted) {
      buttons.push({
        statusId: this.id,
        id: "resist",
        label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.Resist", { dc: RESIST_DC }),
        icon: "fa-solid fa-shield-halved",
      });
    }
    return buttons;
  }


  /** @override */
  async onButton(buttonId, effect) {
    if (buttonId === "resist") return this.#resist(effect);
    return super.onButton(buttonId, effect);
  }


  /**
   * The Will check against the forced movement. Passing it marks the effect resisted.
   * @param {ActiveEffect} effect
   * @param {object} [options]
   * @param {boolean} [options.fast]
   * @returns {Promise<boolean>}  true when a roll was made.
   */
  async #resist(effect, { fast = false } = {}) {
    const actor = effect.parent;
    const result = await rollStatusCheck(actor, { attribute: "wil", dc: RESIST_DC, reason: game.i18n.localize(this.name), fast });
    if (!result) return false;
    if (result.success) {
      await effect.update({ "system.hasResisted": true });
      await statusChat(actor, this.text("LORD_OF_THE_MYSTERIES.Status.Results.Resisted", actor, effect));
    }
    return true;
  }
}
