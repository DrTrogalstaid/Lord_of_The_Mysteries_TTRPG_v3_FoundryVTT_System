import StatusRule from "../status-rule.mjs";
import { rollStatusCheck, statusChat } from "../status-checks.mjs";

/** The Physique check to stay alive. */
const DEATH_DC = 15;
/** The Will check to turn the round's small actions into one attack, casting or move action. */
const ACT_DC = 15;

/** The action types a dying creature can still take (rulebook: "up to 3 free actions and 1 swift action"). */
const DYING_ACTION_TYPES = ["free", "quick"];

/**
 * Dying (rulebook: Dying/Dead). Health 0 or less: turned on and off automatically (effects/health-statuses.mjs),
 * or by hand. Dead replaces it once Health is past the death point.
 *   - Ordinary people, and Beyonders without physical improvement: at the start of each turn, a Physique check
 *     (DC 15), or they die. That round they can take up to 3 free actions and 1 quick action; a Will check (DC 15)
 *     turns those into 1 attack, casting or move action, with half movement. A Helpless creature (fainted) can't
 *     act at all, so it only gets the Physique check.
 *   - Beyonders with physical improvement act normally; the card only reminds the table that they're dying.
 *   - Using an attack, casting, move or full action while dying warns first (Use Anyway: after a passed Will check).
 */
export default class DyingRule extends StatusRule {

  /** Only free and quick actions, for creatures without physical improvement. @override */
  restriction(item, actor, effect) {
    if (actor?.system?.hasPhysicalImprovement) return null;
    const type = item?.system?.actionType ?? "";
    if (!type || DYING_ACTION_TYPES.includes(type)) return null;
    return game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Restrictions.dying", { dc: ACT_DC });
  }

  /** @override */
  turnStart(actor, effect) {
    if (actor.system.hasPhysicalImprovement) {
      return { text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.DyingImproved", actor, effect) };
    }
    // Fainted (Helpless): only the check to stay alive.
    if (actor.statuses?.has("helpless")) {
      return {
        text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.DyingHelpless", actor, effect, { dc: DEATH_DC }),
        buttons: [{ check: "physique", label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollPhysique", { dc: DEATH_DC }) }],
      };
    }
    return {
      text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.Dying", actor, effect, { dc: DEATH_DC, actDc: ACT_DC }),
      buttons: [
        { check: "physique", label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollPhysique", { dc: DEATH_DC }) },
        { check: "act", label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollWillAct", { dc: ACT_DC }) },
      ],
    };
  }


  /**
   * physique: failing it kills the creature (Dead, with the Defeated marker).
   * act: the Will check to take one attack, casting or move action this round.
   * @override
   */
  async onTurnCheck(check, effect, { fast = false } = {}) {
    const actor = effect.parent;
    const reason = game.i18n.localize(this.name);

    if (check === "physique") {
      const result = await rollStatusCheck(actor, { attribute: "phy", dc: DEATH_DC, reason, fast });
      if (!result) return false;
      if (!result.success) {
        await actor.toggleStatusEffect("dead", { active: true, overlay: true });
        // Everyone sees it die.
        await statusChat(actor, this.text("LORD_OF_THE_MYSTERIES.Status.Results.Died", actor, effect), { isPublic: true });
      }
      return true;
    }

    if (check === "act") {
      const result = await rollStatusCheck(actor, { attribute: "wil", dc: ACT_DC, reason, fast });
      if (!result) return false;
      const line = result.success ? "LORD_OF_THE_MYSTERIES.Status.Results.CanAct" : "LORD_OF_THE_MYSTERIES.Status.Results.CannotAct";
      await statusChat(actor, this.text(line, actor, effect));
      return true;
    }

    return false;
  }
}
