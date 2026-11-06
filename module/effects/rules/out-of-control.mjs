import StatusRule from "../status-rule.mjs";
import { statusChat } from "../status-checks.mjs";

/**
 * Out of Control (rulebook, Chapter 5: Out of control). Sanity reached 0 (helpers/sanity.mjs), or a failed promotion
 * (helpers/promotion.mjs). The character is lost: the GM takes it over as the out-of-control monster (Chapter 11).
 * It stops every action (a warning with Use Anyway), and is never taken off automatically.
 */
export default class OutOfControlRule extends StatusRule {

  /** Everyone sees it lose control. @override */
  async onApplied(effect) {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor") return;
    await statusChat(actor, this.text("LORD_OF_THE_MYSTERIES.Status.Results.LostControl", actor, effect), { isPublic: true });
  }
}
