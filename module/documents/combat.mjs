import { postTurnStartCard } from "../effects/turn-start.mjs";
import { payUpkeep } from "../effects/toggle-effects.mjs";

/**
 * The system's Combat document. When a combatant's turn starts:
 *   - it pays the Spirituality to keep up toggled effects that cost some each round, like Spirit Vision
 *     (payUpkeep in effects/toggle-effects.mjs). Not enough: the effect switches off.
 *   - it posts the start-of-turn card for the statuses that need something then: Bleeding, Bloodbath, Dying, Fear,
 *     Angry, Shock (effects/turn-start.mjs).
 * @extends {Combat}
 */
export class LordOfTheMysteriesCombat extends Combat {

  /**
   * Foundry runs this for one client only, the active GM's, so each card is posted once.
   * @override
   */
  async _onStartTurn(combatant, ...args) {
    await super._onStartTurn(combatant, ...args);
    if (!game.user.isActiveGM) return;
    if (!combatant?.actor || combatant.isDefeated) return;
    await payUpkeep(combatant.actor);
    await postTurnStartCard(combatant.actor, { token: combatant.token });
  }
}
