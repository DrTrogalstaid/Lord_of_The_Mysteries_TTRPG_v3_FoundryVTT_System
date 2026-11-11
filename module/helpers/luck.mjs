/**
 * Luck Points (system.resources.lp): spending them, and Burning Luck on a roll.
 *
 * The table's house rule (in place of the rulebook's once-every-24-hours version):
 *   - Burning Luck adds to or subtracts from a roll after it's rolled. Any number of times, as long as there's Luck.
 *   - A player can burn their character's Luck on the character's own rolls, and on rolls aimed at the character
 *     (an attack that targeted them). The GM can burn any creature's.
 *   - It never changes a natural 20 or natural 1 (Big Success / Big Failure stay what they are).
 *   - Luck comes back each day: Long Rest refills it (sheets/player-character-sheet.mjs).
 *
 * How it works: the Burn Luck button on a check's chat card (helpers/check-chat.mjs) asks how much, which way, and
 * (for the GM, or a player who owns several of the creatures involved) whose Luck. The Luck is spent, and a new
 * message says what the roll comes to now: the DC's result, or each target's Hit / Miss. The original card isn't
 * changed, so every burn stays in the chat log. A second burn on the same roll counts the first.
 *
 * When the new total changes a pass into a fail (or back) on a status check or a sanity check, what that check did
 * is changed too: a Dying creature that died gets back up, Fear's resisted mark comes off, a sanity check whose loss
 * was already rolled rolls its other loss (one not rolled yet just waits: its Roll Loss button reads the new result).
 * Status checks: StatusRule.applyCheckResult (effects/rules/). Sanity: changeSanityResult (sanity.mjs).
 * What can't be undone (an Angry creature calmed and the effect deleted) is left to the GM, and the message says so.
 *
 * The roll's own data is saved on its message by the roll dialogs (flags.lotm.check, flags.lotm.attack:
 * apps/roll-dialog.mjs, apps/sanity-check-dialog.mjs). Each burn's message has flags.lotm.luckBurn.
 */

import { checkSucceeds, isAttackHit, sanityCheckSucceeds, totalWithLuck } from "./check-results.mjs";
import { promptSpend } from "../apps/spend-dialog.mjs";
import { renderTemplateSync } from "./render.mjs";
import { langSection } from "./lang.mjs";

const LUCK = "LORD_OF_THE_MYSTERIES.Luck";
const luckText = langSection(LUCK);


/**
 * The actor's current and maximum Luck.
 * @param {Actor} actor
 * @returns {{value: number, max: number}}
 */
export function currentLuck(actor) {
  const lp = actor?.system?.resources?.lp ?? {};
  return { value: Number(lp.value) || 0, max: Number(lp.max) || 0 };
}


/**
 * Take Luck from the actor. Not enough: a warning, and nothing is spent.
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [options]
 * @param {string} [options.reason]   What it was spent on, for the chat message.
 * @param {boolean} [options.chat]    Post "X spends 2 Luck on Y." to chat.
 * @returns {Promise<{amount: number, before: number, after: number}|null>}  null when nothing was spent.
 */
export async function spendLuck(actor, amount, { reason = "", chat = true } = {}) {
  amount = Math.floor(Number(amount) || 0);
  if (!actor || amount <= 0) return null;
  const { value } = currentLuck(actor);
  if (amount > value) {
    ui.notifications.warn(luckText("NotEnough", { name: actor.name, value, cost: amount }));
    return null;
  }
  const after = value - amount;
  await actor.update({ "system.resources.lp.value": after });
  if (chat) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: renderTemplateSync("systems/lotm/templates/chat/luck-spent.hbs", { name: actor.name, amount, reason }),
    });
  }
  return { amount, before: value, after };
}


/**
 * The sidebar's Spend button under Luck: ask how much (and, optionally, what for), then spend it. For uses the GM
 * allows that aren't a roll on a chat card.
 * @param {Actor} actor
 * @returns {Promise<object|null>}
 */
export async function openSpendLuckDialog(actor) {
  const { value, max } = currentLuck(actor);
  if (value <= 0) {
    ui.notifications.warn(luckText("NoneLeft", { name: actor.name }));
    return null;
  }
  const input = await promptSpend({ section: "Luck", icon: "fa-solid fa-clover", value, max });
  if (!input) return null;
  return spendLuck(actor, input.amount, { reason: input.reason });
}


/* -------------------------------------------- */
/*  Burning Luck on a roll                       */
/* -------------------------------------------- */

/**
 * The Luck already burned on a roll: the burn messages for it, oldest first.
 * @param {ChatMessage} message   The roll's message.
 * @returns {ChatMessage[]}
 */
export function luckBurnsOn(message) {
  return game.messages.contents
    .filter((other) => other.getFlag("lotm", "luckBurn")?.sourceId === message.id)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}


/**
 * Whose Luck the current user can burn on a roll: the roller's and the attack's targets', the ones the user owns
 * (a GM owns them all). Empty when the roll can't take Luck (no check data, a promotion check, hidden from the user).
 * @param {ChatMessage} message
 * @returns {{actor: Actor, role: "roller"|"target"}[]}
 */
export function luckBurners(message) {
  const check = message?.getFlag("lotm", "check");
  // No Luck on promotions: the promotion check itself, and the Will checks on a promotion card.
  if (!check || check.kind === "promotion" || check.outcome?.type === "promotion" || !message.isContentVisible) return [];

  const candidates = [{ uuid: check.actorUuid, role: "roller" }];
  for (const target of message.getFlag("lotm", "attack")?.targets ?? []) {
    candidates.push({ uuid: target.actorUuid, role: "target" });
  }

  const seen = new Set();
  const burners = [];
  for (const { uuid, role } of candidates) {
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    const actor = fromUuidSync(uuid);
    if (actor?.isOwner && actor.system?.resources?.lp) burners.push({ actor, role });
  }
  return burners;
}


/**
 * The Burn Luck button: ask whose Luck, how much and which way, then burn it.
 * Defaults: a roller adds to their own roll (or subtracts, on a sanity check, where lower is better);
 * a target subtracts from the roll against them.
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage|null>}  The burn's message, or null if cancelled.
 */
export async function openBurnLuckDialog(message) {
  const burners = luckBurners(message).filter(({ actor }) => currentLuck(actor).value > 0);
  if (!burners.length) {
    ui.notifications.warn(luckText("NoBurners"));
    return null;
  }
  const check = message.getFlag("lotm", "check");
  const defaultSign = (role) => ((role === "roller" && check.kind !== "sanity") ? 1 : -1);

  const content = renderTemplateSync("systems/lotm/templates/dialogs/burn-luck.hbs", {
    title: check.title ?? "",
    total: totalWithLuck(check.total, luckBurnsOn(message).map((m) => m.getFlag("lotm", "luckBurn").amount)),
    hasChoice: burners.length > 1,
    burners: burners.map(({ actor, role }) => ({
      uuid: actor.uuid, name: actor.name, luck: currentLuck(actor).value, sign: defaultSign(role),
    })),
    // The direction starts as the first creature's usual one.
    adds: defaultSign(burners[0].role) > 0,
  });

  const input = await foundry.applications.api.DialogV2.prompt({
    window: { title: "LORD_OF_THE_MYSTERIES.Luck.BurnTitle", icon: "fa-solid fa-clover" },
    content,
    ok: {
      label: "LORD_OF_THE_MYSTERIES.Luck.Burn",
      icon: "fa-solid fa-clover",
      callback: (event, button) => ({
        actorUuid: button.form.elements.actor.value,
        amount: button.form.elements.amount.valueAsNumber,
        sign: Number(button.form.elements.sign.value) < 0 ? -1 : 1,
      }),
    },
    render: (event, dialog) => {
      // Picking another creature picks its usual direction.
      const element = dialog.element ?? dialog;
      const select = element.querySelector?.("select[name=actor]");
      select?.addEventListener("change", () => {
        const option = select.selectedOptions[0];
        element.querySelector("select[name=sign]").value = option?.dataset.sign ?? "1";
      });
    },
    rejectClose: false,
  });
  if (!input) return null;

  const burner = burners.find(({ actor }) => actor.uuid === input.actorUuid)?.actor;
  if (!burner) return null;
  if (!Number.isFinite(input.amount) || input.amount < 1) {
    ui.notifications.warn(luckText("InvalidAmount"));
    return null;
  }
  return burnLuck(message, burner, input.sign * Math.floor(input.amount));
}


/**
 * Burn Luck on a roll: spend it, post what the roll comes to now, and change what the check decided if its result
 * flipped (see the top of this file).
 * @param {ChatMessage} message   The roll's message.
 * @param {Actor} burner          Whose Luck.
 * @param {number} amount         Added to the roll (negative = subtracted). Its size is the Luck spent.
 * @returns {Promise<ChatMessage|null>}
 */
export async function burnLuck(message, burner, amount) {
  const check = message.getFlag("lotm", "check");
  if (!check || !amount) return null;
  const spent = await spendLuck(burner, Math.abs(amount), { chat: false });
  if (!spent) return null;

  const previous = luckBurnsOn(message);
  const before = totalWithLuck(check.total, previous.map((other) => other.getFlag("lotm", "luckBurn").amount));
  const after = before + amount;
  const natural = check.natural ?? null;

  // The card's lines (templates/chat/luck-burn.hbs).
  const lines = [{ key: `${LUCK}.Total`, data: { before, after } }];
  if (natural === 20 || natural === 1) lines.push({ key: `${LUCK}.${natural === 20 ? "StillBigSuccess" : "StillBigFailure"}` });

  // Pass or fail: a sanity check (at or under Sanity), or a DC.
  let flipped = null;
  if (check.kind === "sanity") {
    const was = sanityCheckSucceeds({ total: before, natural, sanity: check.sanity });
    const now = sanityCheckSucceeds({ total: after, natural, sanity: check.sanity });
    lines.push(resultLine("LORD_OF_THE_MYSTERIES.Sanity.Against", { sanity: check.sanity }, now, was));
    if (now !== was) flipped = now;
  }
  else if (check.dc !== null && check.dc !== undefined) {
    const was = checkSucceeds({ total: before, natural, dc: check.dc });
    const now = checkSucceeds({ total: after, natural, dc: check.dc });
    lines.push(resultLine("LORD_OF_THE_MYSTERIES.RollDialog.DC", { dc: check.dc }, now, was));
    if (now !== was) flipped = now;
  }

  // Hit or miss, target by target. The defense numbers only show for the GM (helpers/check-chat.mjs).
  for (const target of message.getFlag("lotm", "attack")?.targets ?? []) {
    if (target.defense === null || target.defense === undefined) continue;
    const was = isAttackHit({ total: before, natural, defense: target.defense });
    const now = isAttackHit({ total: after, natural, defense: target.defense });
    const word = (hit) => game.i18n.localize(`LORD_OF_THE_MYSTERIES.Attack.${hit ? "Hit" : "Miss"}`);
    lines.push({ target: { name: target.name, hit: now, word: word(now), was: now === was ? "" : word(was), defense: target.defense } });
  }

  // A sanity check whose result flipped. Its loss not rolled yet: nothing to change, the Roll Loss button rolls the
  // loss for the new result. Already rolled: roll the other loss now and give back or take the difference.
  const luckBurn = { sourceId: message.id, actorUuid: burner.uuid, amount, total: after };
  if (flipped !== null && check.outcome?.type === "sanity") {
    const { changeSanityResult, sanityLossMessage } = await import("./sanity.mjs");
    // The latest loss: from an earlier burn that changed it, else the Roll Loss message, else (a check from before
    // the button) the check itself.
    const latest = [...previous].reverse().find((other) => other.getFlag("lotm", "luckBurn")?.sanityState)
      ?.getFlag("lotm", "luckBurn").sanityState;
    const rolled = sanityLossMessage(message)?.getFlag("lotm", "sanityLoss");
    const legacy = check.isLossPending ? null : {
      actorUuid: check.actorUuid, loss: check.loss, lossFormulas: check.lossFormulas,
      isSolidified: check.isSolidified, semiEffectId: check.semiEffectId,
    };
    const state = latest ?? rolled ?? legacy;
    if (state) {
      const changed = await changeSanityResult(state, flipped);
      lines.push({ html: changed.html });
      luckBurn.sanityState = changed.state;
    }
    else lines.push({ key: "LORD_OF_THE_MYSTERIES.Sanity.LossNotRolled" });
  }

  const roller = fromUuidSync(check.actorUuid);
  const burnMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: burner }),
    content: renderTemplateSync("systems/lotm/templates/chat/luck-burn.hbs", {
      name: burner.name,
      amount: Math.abs(amount),
      change: amount > 0 ? `+${amount}` : `${amount}`,
      roller: roller?.name ?? "",
      title: check.title ?? "",
      lines,
    }),
    // Seen by the same people as the roll it changes.
    whisper: [...(message.whisper ?? [])],
    blind: !!message.blind,
    flags: { lotm: { luckBurn } },
  });

  // A status check whose result flipped: the status changes what it did (after the message, so chat reads in order).
  if (flipped !== null && check.outcome?.statusId) {
    const { statusRule } = await import("../effects/status-effects.mjs");
    const effect = await fromUuid(check.outcome.effectUuid).catch(() => null);
    const handled = effect
      ? await statusRule(check.outcome.statusId)?.applyCheckResult(check.outcome.check, effect, flipped, { isLuckChange: true })
      : false;
    if (!handled) await postGMNote(burner, message);
  }
  return burnMessage;
}


/**
 * A burn card line for a check's result: "DC 15: Success (was Failure)".
 * @param {string} labelKey      Lang key of what it's against ("DC {dc}").
 * @param {object} labelData
 * @param {boolean} now          It succeeds now.
 * @param {boolean} was          It succeeded before the burn.
 * @returns {{result: object}}   A line for templates/chat/luck-burn.hbs.
 */
function resultLine(labelKey, labelData, now, was) {
  const word = (success) => game.i18n.localize(`LORD_OF_THE_MYSTERIES.RollDialog.${success ? "Success" : "Failure"}`);
  return { result: { labelKey, labelData, now, word: word(now), was: now === was ? "" : word(was) } };
}


/**
 * The result changed, but what the old result did can't be undone automatically: say so to the GM and the burner.
 * @param {Actor} burner
 * @param {ChatMessage} message
 */
async function postGMNote(burner, message) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: burner }),
    content: renderTemplateSync("systems/lotm/templates/chat/luck-note.hbs"),
    whisper: game.users.filter((user) => user.isGM || user.id === game.user.id).map((user) => user.id),
  });
}
