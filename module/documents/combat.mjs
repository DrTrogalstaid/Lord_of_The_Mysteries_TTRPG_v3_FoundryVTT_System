import { postTurnStartCard } from "../effects/turn-start.mjs";
import { payUpkeep } from "../effects/toggle-effects.mjs";
import { statusRule } from "../effects/status-effects.mjs";

/**
 * The system's Combat document. When a combatant's turn starts:
 *   - it pays the Spirituality to keep up toggled effects that cost some each round, like Spirit Vision
 *     (payUpkeep in effects/toggle-effects.mjs). Not enough: the effect switches off.
 *   - its statuses that count down do so (StatusRule.onTurnStart: Semi-Out-of-Control's rounds), and end when
 *     they run out
 *   - it posts the start-of-turn card for the statuses that need something then: Bleeding, Bloodbath, Dying, Fear,
 *     Angry, Shock, Semi-Out-of-Control (effects/turn-start.mjs).
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
    await this.#countDownStatuses(combatant.actor);
    await postTurnStartCard(combatant.actor, { token: combatant.token });
  }


  /**
   * Each status on the actor gets its onTurnStart (most do nothing). Only the actor's own effects: an effect an
   * Item lends it doesn't count down.
   * @param {Actor} actor
   */
  async #countDownStatuses(actor) {
    for (const effect of [...actor.effects]) {
      if (!effect.active) continue;
      for (const id of effect.statuses) {
        // The effect may have been ended by an earlier status's countdown.
        if (!actor.effects.has(effect.id)) break;
        await statusRule(id)?.onTurnStart(actor, effect);
      }
    }
  }
}
