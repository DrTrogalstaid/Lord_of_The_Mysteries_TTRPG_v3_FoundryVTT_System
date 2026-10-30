/**
 * A plain check: one die (1d20 by default) plus a single number, posted to chat.
 *
 * For rolls that aren't skill checks: attribute checks from the Character tab, and anything else that
 * just needs "roll and add N" (macros, Item buttons, ...). The sheets' attribute checks use AttributeCheckDialog
 * (apps/attribute-check-dialog.mjs) instead, and skill checks go through SkillCheckDialog,
 * which adds the skill level and situational modifiers.
 *
 * Lives in module/helpers/, next to skill-check-formula.mjs.
 */

import LOTM_VTTRoll from "../dice/lotm-roll.mjs";
import { signedTerm } from "./skill-check-formula.mjs";
import { postRoll } from "./message-modes.mjs";

/**
 * Roll `die + modifier` and post it to chat as the actor.
 *
 * @param {Actor|null} actor  Who is rolling. Used for the chat speaker and @-references in `die`. May be null.
 * @param {object} [options]
 * @param {number} [options.modifier=0]  The number added to the die.
 * @param {string} [options.label=""]    Tag shown on the modifier in the roll breakdown, e.g. "STR" -> "+3[STR]".
 * @param {string} [options.flavor=""]   Chat message flavor text, e.g. "Strength check".
 * @param {string} [options.die="1d20"]  What to roll before the modifier.
 * @param {string} [options.messageMode]  Who sees it: "public", "gm", "blind" or "self" (helpers/message-modes.mjs).
 *                                        Default: what the chat sidebar is set to.
 * @returns {Promise<Roll>} The evaluated roll.
 */
export async function rollCheck(actor, { modifier = 0, label = "", flavor = "", die = "1d20", messageMode } = {}) {
  const value = Number(modifier) || 0;
  const term = label ? `${signedTerm(value)}[${label}]` : signedTerm(value);

  const roll = new LOTM_VTTRoll(`${die} ${term}`, actor?.getRollData?.() ?? {});
  await roll.evaluate();

  await postRoll(roll, {
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
  }, messageMode);

  return roll;
}
