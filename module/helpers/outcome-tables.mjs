/**
 * Outcome tables: an action or spell with a DC can have a Roll Table for a success and one for a failure
 * (system.successTable / system.failureTable; the sheet's slots are helpers/table-slot.mjs). Listen, for example:
 * DC 30, a 1d8 table of the Creator's whispers on a success, a 1d4 table of what goes wrong on a failure.
 *
 * The roll dialog saves the tables on the check's message (flags.lotm.check.tables, apps/roll-dialog.mjs), and the
 * card gets a Roll Outcome button (helpers/check-chat.mjs). Clicking it:
 *   - works out the result against the DC now, counting any Luck burned on the roll since (helpers/luck.mjs), so
 *     players burn Luck first and then roll the outcome. A natural 20 / 1 still decides on its own.
 *   - draws from that result's table, and posts it as the character, seen by the same people as the roll.
 *     Its text can hold @Sanity[...] and @Check[...] buttons (helpers/enrichers.mjs), which roll for the character
 *     who made the check unless tokens are selected.
 *   - works once per roll (remembered on the message as flags.lotm.outcomeRolled).
 * Only the roller's owners (and the GM) can use it.
 */

import { checkSucceeds, totalWithLuck } from "./check-results.mjs";
import { luckBurnsOn } from "./luck.mjs";
import { formatHTML } from "./render.mjs";
import { langSection } from "./lang.mjs";

const outcomeText = langSection("LORD_OF_THE_MYSTERIES.Outcome");


/**
 * Whether the current user gets a Roll Outcome button on this message.
 * @param {ChatMessage} message
 * @returns {boolean}
 */
export function canRollOutcome(message) {
  const check = message?.getFlag("lotm", "check");
  if (!check?.tables || check.dc === null || check.dc === undefined || !message.isContentVisible) return false;
  return !!fromUuidSync(check.actorUuid)?.isOwner;
}


/**
 * The check's result now: its total with every Luck burn on it so far, against its DC.
 * @param {ChatMessage} message
 * @returns {{total: number, success: boolean}}
 */
export function currentResult(message) {
  const check = message.getFlag("lotm", "check");
  const burns = luckBurnsOn(message).map((other) => other.getFlag("lotm", "luckBurn").amount);
  const total = totalWithLuck(check.total, burns);
  return { total, success: checkSucceeds({ total, natural: check.natural ?? null, dc: check.dc }) };
}


/**
 * The Roll Outcome button: draw from the success or failure table and post it.
 * @param {ChatMessage} message   The check's message.
 * @returns {Promise<ChatMessage|null>}  The outcome's message, or null when nothing was drawn.
 */
export async function rollOutcome(message) {
  if (!canRollOutcome(message)) return null;
  if (message.getFlag("lotm", "outcomeRolled")) {
    ui.notifications.warn(outcomeText("AlreadyRolled"));
    return null;
  }

  const check = message.getFlag("lotm", "check");
  const { success } = currentResult(message);
  const resultLabel = game.i18n.localize(`LORD_OF_THE_MYSTERIES.RollDialog.${success ? "Success" : "Failure"}`);
  const uuid = success ? check.tables.success : check.tables.failure;
  if (!uuid) {
    ui.notifications.info(outcomeText("NoTable", { result: resultLabel }));
    return null;
  }
  const table = await fromUuid(uuid).catch(() => null);
  if (table?.documentName !== "RollTable") {
    ui.notifications.warn(outcomeText("TableGone"));
    return null;
  }

  // Mark it used first, so a double click doesn't draw twice. The author or a GM can mark it.
  if (message.canUserModify(game.user, "update")) await message.setFlag("lotm", "outcomeRolled", true);

  const draw = await table.draw({ displayChat: false });
  if (!draw?.results?.length) return null;
  const actor = fromUuidSync(check.actorUuid);
  return table.toMessage(draw.results, {
    roll: draw.roll,
    messageData: {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: formatHTML("LORD_OF_THE_MYSTERIES.Outcome.Flavor", { title: check.title ?? "", result: resultLabel, table: table.name }),
      // Seen by the same people as the roll.
      whisper: [...(message.whisper ?? [])],
      blind: !!message.blind,
      // Whose outcome it is: its @Sanity / @Check buttons roll for this character (helpers/enrichers.mjs).
      flags: { lotm: { outcome: { sourceId: message.id, actorUuid: check.actorUuid, success } } },
    },
  });
}
