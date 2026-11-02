import StatusRule from "../status-rule.mjs";
import { rollBleeding } from "../status-checks.mjs";

/**
 * Bleeding (rulebook: Bleeding). At the start of each turn the creature loses 1d2 Health, until it gets First Aid
 * or medical treatment (the Treated button on the Effects tab, set in status-effects.mjs).
 *   - A Beyonder with physical improvement bleeds but loses no Health (rulebook: Bloodbath, Beyonders).
 *   - Internal bleeding (system.hasInternalBleeding) only stops with extraordinary medicine or surgery; the card says so.
 * Bloodbath starts it (rules/bloodbath.mjs), and it carries on after Bloodbath ends.
 */
export default class BleedingRule extends StatusRule {

  /** @override */
  turnStart(actor, effect) {
    const internal = effect.system?.hasInternalBleeding
      ? ` ${this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.InternalBleeding", actor, effect)}`
      : "";

    if (actor.system.hasPhysicalImprovement) {
      return { text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.BleedingNoLoss", actor, effect) + internal };
    }
    return {
      text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.Bleeding", actor, effect) + internal,
      buttons: [{ check: "bleed", label: game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.Buttons.RollBleeding") }],
    };
  }


  /** Roll 1d2 and take it off Health. @override */
  async onTurnCheck(check, effect, options = {}) {
    if (check !== "bleed") return false;
    await rollBleeding(effect.parent, game.i18n.localize(this.name));
    return true;
  }
}
