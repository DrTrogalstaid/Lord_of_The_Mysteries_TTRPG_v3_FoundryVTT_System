import StatusRule from "../status-rule.mjs";
import { rollStatusCheck, statusChat } from "../status-checks.mjs";

/** The Will check to calm down. */
const CALM_DC = 20;

/**
 * Angry/Taunted (rulebook: Angry/Taunted). The source is the effect's system.source (who caused the anger).
 *   - The creature must attack or chase the source first, until it or the source is Dying/Dead.
 *   - Skill and attribute checks are -4 (a row in the roll dialogs, effects/status-rolls.mjs); -2 after Meditation (Half).
 *   - Calming down: a Will check (DC 20) at the start of its action (start-of-turn card or the Effects tab),
 *     or Meditation (Full). Meditation (Half) only halves the penalty (system.isPenaltyHalved).
 *   - A Psychotherapy guidance check (DC 20) by someone else, or harm to someone or something it values, also calms
 *     it at once: the GM removes the status.
 */
export default class AngryRule extends StatusRule {

  /** -4 on skill and attribute checks (set in status-effects.mjs), halved after Meditation (Half). @override */
  rollValue(effect) {
    const value = super.rollValue(effect);
    return effect.system?.isPenaltyHalved ? Math.trunc(value / 2) : value;
  }

  /** @override */
  turnStart(actor, effect) {
    return {
      text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.Angry", actor, effect, { dc: CALM_DC }),
      buttons: [{ check: "calm", label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollWill", { dc: CALM_DC }) }],
    };
  }


  /** @override */
  async onTurnCheck(check, effect, options = {}) {
    if (check !== "calm") return false;
    return this.#calmDown(effect, options);
  }


  /** Calm Down, Meditation (Full), and Meditation (Half) until the penalty is halved. @override */
  buttons(effect) {
    const buttons = super.buttons(effect);
    const button = (id, label, icon) => ({ statusId: this.id, id, label, icon });
    buttons.push(button("calm", game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.CalmDown", { dc: CALM_DC }), "fa-solid fa-face-meh"));
    buttons.push(button("meditateFull", game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.Buttons.MeditateFull"), "fa-solid fa-spa"));
    if (!effect.system?.isPenaltyHalved) {
      buttons.push(button("meditateHalf", game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.Buttons.MeditateHalf"), "fa-solid fa-spa"));
    }
    return buttons;
  }


  /** @override */
  async onButton(buttonId, effect) {
    const actor = effect.parent;
    if (buttonId === "calm") return this.#calmDown(effect);
    if (buttonId === "meditateFull") {
      return this.endStatus(effect, { chat: "LORD_OF_THE_MYSTERIES.Status.Results.MeditatedFull" });
    }
    if (buttonId === "meditateHalf") {
      await effect.update({ "system.isPenaltyHalved": true });
      return statusChat(actor, this.text("LORD_OF_THE_MYSTERIES.Status.Results.MeditatedHalf", actor, effect));
    }
    return super.onButton(buttonId, effect);
  }


  /**
   * The Will check to calm down. Passing it ends the status.
   * @param {ActiveEffect} effect
   * @param {object} [options]
   * @param {boolean} [options.fast]
   * @returns {Promise<boolean>}  true when a roll was made.
   */
  async #calmDown(effect, { fast = false } = {}) {
    const actor = effect.parent;
    const result = await rollStatusCheck(actor, {
      attribute: "wil", dc: CALM_DC, reason: game.i18n.localize(this.name), fast, outcome: this.outcomeFor("calm", effect),
    });
    if (!result) return false;
    await this.applyCheckResult("calm", effect, result.success);
    return true;
  }


  /**
   * Passing ends the status. (Luck turning a pass into a fail can't bring it back, since the effect is gone:
   * the GM puts it back on by hand, so this says it wasn't handled.)
   * @override
   */
  async applyCheckResult(check, effect, success, { isLuckChange = false } = {}) {
    if (check !== "calm") return false;
    if (!success) return !isLuckChange;
    await this.endStatus(effect, { chat: "LORD_OF_THE_MYSTERIES.Status.Results.CalmedDown" });
    return true;
  }
}
