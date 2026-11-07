/**
 * Shared steps for the statuses' own code (effects/rules/): rolling a check against a DC, rolling Bleeding, and
 * saying what happened in chat.
 *
 * The roll code is loaded when it's first needed (import() inside the functions) rather than at the top of the
 * file. The status list (status-effects.mjs) loads the rules, which load this file, and the unit tests load the
 * status list under plain Node, where Foundry's roll and window classes don't exist.
 */

import { checkSucceeds, naturalD20 } from "../helpers/check-results.mjs";

/**
 * Everyone who should see a status's chat messages: the actor's owners and the GMs.
 * For an NPC that's only the GMs.
 * @param {Actor} actor
 * @returns {string[]}  User ids, for a message's whisper list.
 */
export function ownersAndGMs(actor) {
  return game.users.filter((user) => user.isGM || actor.testUserPermission(user, "OWNER")).map((user) => user.id);
}


/**
 * Post a line about a status in chat, as the actor. Seen by its owners and the GMs, or by everyone when public
 * (a creature fainting or dying is something the whole table sees).
 * @param {Actor} actor
 * @param {string} text                  HTML (already escaped).
 * @param {object} [options]
 * @param {boolean} [options.isPublic]   Everyone sees it.
 * @returns {Promise<ChatMessage>}
 */
export function statusChat(actor, text, { isPublic = false } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p>${text}</p>`,
    whisper: isPublic ? [] : ownersAndGMs(actor),
  });
}


/**
 * Roll an attribute check against a DC (Physique 15 for Bloodbath, Will 20 to calm down, ...), with the usual
 * attribute check dialog: modifiers can be added, and the chat card says the DC and whether it passed.
 * @param {Actor} actor
 * @param {object} check
 * @param {string} check.attribute   Attribute key, e.g. "phy", "wil".
 * @param {number} check.dc
 * @param {string} [check.reason]    Shown in front of the check's title, e.g. "Bloodbath".
 * @param {boolean} [check.fast]     Shift-click: roll right away, without the dialog.
 * @param {object} [check.outcome]   What the check decides: { statusId, check, effectUuid }. Saved on the roll's
 *                                   message, so Burning Luck can change the result afterwards (helpers/luck.mjs calls
 *                                   the status's applyCheckResult).
 * @returns {Promise<{roll: Roll, success: boolean}|null>}  null when the dialog was closed without rolling.
 *   success: meets or beats the DC; a natural 20 always passes, a natural 1 always fails (helpers/check-results.mjs).
 */
export async function rollStatusCheck(actor, { attribute, dc, reason = "", fast = false, outcome = null }) {
  const { default: AttributeCheckDialog } = await import("../apps/attribute-check-dialog.mjs");
  const roll = await AttributeCheckDialog.prompt(actor, attribute, { dc, reason, fast, outcome });
  if (!roll) return null;
  return { roll, success: checkSucceeds({ total: roll.total, natural: naturalD20(roll), dc }) };
}


/**
 * Roll Health lost to Bleeding (1d2) and take it off. The roll is posted like any other roll; the Health change
 * turns Dying / Dead on when it should (effects/health-statuses.mjs). Damage reduction doesn't apply.
 * @param {Actor} actor
 * @param {string} reason   The roll's title, e.g. "Bleeding".
 * @returns {Promise<Roll>}
 */
export async function rollBleeding(actor, reason) {
  const { postRoll } = await import("../helpers/message-modes.mjs");
  const roll = Roll.create("1d2");
  await roll.evaluate();
  await postRoll(roll, { speaker: ChatMessage.getSpeaker({ actor }), flavor: Handlebars.escapeExpression(reason) });

  const hp = Number(actor.system.resources.hp.value) || 0;
  await actor.update({ "system.resources.hp.value": hp - roll.total });
  return roll;
}
