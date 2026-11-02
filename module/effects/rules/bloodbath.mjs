import StatusRule from "../status-rule.mjs";
import { rollStatusCheck, statusChat } from "../status-checks.mjs";

/** The Physique check to stay conscious. */
const FAINT_DC = 15;

/**
 * Bloodbath (rulebook: Bloodbath). Health below half its maximum, rounded up: turned on and off automatically
 * (effects/health-statuses.mjs), or by hand.
 *   - Starting it starts Bleeding too, which carries on after Bloodbath ends.
 *   - Ordinary people, and Beyonders without physical improvement: at the start of each turn, a Physique check
 *     (DC 15), or they faint and are Helpless. Once Helpless (fainted), there's no more check to make.
 *   - Beyonders with physical improvement don't faint (they still bleed, but lose no Health: rules/bleeding.mjs).
 */
export default class BloodbathRule extends StatusRule {

  /** Starting Bloodbath starts Bleeding, unless the creature is already bleeding. @override */
  async onApplied(effect) {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || actor.statuses?.has("bleeding")) return;
    await actor.toggleStatusEffect("bleeding", { active: true });
  }


  /** @override */
  turnStart(actor, effect) {
    // Physically improved Beyonders don't faint; a creature that's already Helpless has fainted.
    if (actor.system.hasPhysicalImprovement || actor.statuses?.has("helpless")) return null;
    return {
      text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.Bloodbath", actor, effect, { dc: FAINT_DC }),
      buttons: [{ check: "physique", label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollPhysique", { dc: FAINT_DC }) }],
    };
  }


  /** Physique check; failing it makes the creature faint (Helpless). @override */
  async onTurnCheck(check, effect, { fast = false } = {}) {
    if (check !== "physique") return false;
    const actor = effect.parent;
    const result = await rollStatusCheck(actor, { attribute: "phy", dc: FAINT_DC, reason: game.i18n.localize(this.name), fast });
    if (!result) return false;

    if (!result.success) {
      await actor.toggleStatusEffect("helpless", { active: true });
      // Everyone sees it faint.
      await statusChat(actor, this.text("LORD_OF_THE_MYSTERIES.Status.Results.Fainted", actor, effect), { isPublic: true });
    }
    return true;
  }
}
