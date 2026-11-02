import { postTurnStartCard } from "../effects/turn-start.mjs";

/**
 * The system's Combat document. When a combatant's turn starts, it posts the start-of-turn card for the statuses
 * that need something then: Bleeding, Bloodbath, Dying, Fear, Angry, Shock (effects/turn-start.mjs).
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
    await postTurnStartCard(combatant.actor, { token: combatant.token });
  }
}
