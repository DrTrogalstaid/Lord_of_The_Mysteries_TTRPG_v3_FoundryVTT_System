/**
 * Sanity (the sheets call it Sanity, system.resources.rp): losing it, and the madness that comes with it
 * (rulebook, Chapter 5: Going out of control).
 *
 *   Sanity check      Roll d20 (plus any penalty) at or under your current Sanity to pass. A natural 20 is a Big
 *                     Failure: the most the failure loss can be. Loss written "1/1d3": 1 on a pass, 1d3 on a fail.
 *                     The dialog: apps/sanity-check-dialog.mjs (the Check button under Sanity on the sheets).
 *   3+ lost at once   Semi-Out-of-Control (effects/rules/semi-out-of-control.mjs) for 1d2 rounds, with a madness
 *                     tendency (d8).
 *   Below half max    Indeterminate Madness (effects/rules/indeterminate-madness.mjs), on and off with Sanity.
 *   0                 Out of Control. Added automatically, never removed automatically: the GM decides.
 *   Mental solidification: a check ticked "Solidified" loses 1 less (never below 0).
 *
 * The loss is rolled by the check card's Roll Loss button (rollSanityLoss below), not with the check: Luck can be
 * burned on the check first, and the button rolls the loss for the result at that moment.
 *
 * The plain math at the top has no `game` / `CONFIG` access, so it's unit tested under Node (tests/sanity.test.mjs).
 */

import { sanityCheckSucceeds, totalWithLuck } from "./check-results.mjs";

/** Losing this much Sanity at once makes a creature Semi-Out-of-Control. */
export const SEMI_OUT_OF_CONTROL_LOSS = 3;


/**
 * Which madness statuses a creature's Sanity calls for.
 * @param {object} values
 * @param {number} values.value   Current Sanity.
 * @param {number} values.max     Maximum Sanity (Will + 10).
 * @returns {{indeterminate: boolean, outOfControl: boolean}}
 *   indeterminate  below half the maximum (rounded up), but above 0
 *   outOfControl   0 or less
 */
export function wantedSanityStatuses({ value, max }) {
  const sanity = Number(value) || 0;
  const maximum = Number(max) || 0;
  if (maximum <= 0) return { indeterminate: false, outOfControl: false };
  return {
    indeterminate: sanity > 0 && sanity < Math.ceil(maximum / 2),
    outOfControl: sanity <= 0,
  };
}


/**
 * Sanity lost after mental solidification: 1 less when the creature has seen this kind of shock 3+ times, never
 * below 0.
 * @param {number} loss
 * @param {boolean} [isSolidified]
 * @returns {number}
 */
export function lossAfterSolidification(loss, isSolidified = false) {
  const value = Math.max(0, Number(loss) || 0);
  return isSolidified ? Math.max(0, value - 1) : value;
}


/**
 * A number that has already been rolled, for a chat card: the total in bold, with the dice in a tooltip
 * ("1d3: 2"). Used for Sanity losses and promotion rolls instead of Foundry's inline roll, which looks like a
 * button but only shows the dice when clicked: players clicked it expecting it to roll the loss, which had
 * already been rolled and taken off.
 * @param {{total: number, formula?: string, result?: string, dice?: object[]}} roll   An evaluated Roll.
 * @param {number} [value]   The number to show, when it isn't the roll's total (a loss after mental solidification).
 * @returns {string}  HTML.
 */
export function rolledValueHTML(roll, value = roll?.total) {
  const shown = Number(value) || 0;
  if (!roll?.dice?.length) return `<strong class="lotm-rolled">${shown}</strong>`;
  const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<strong class="lotm-rolled" data-tooltip="${escape(`${roll.formula}: ${roll.result}`)}">${shown}</strong>`;
}


/**
 * A sanity loss as typed in the book, "1/1d3" (pass / fail), split in two. One value ("1d3") is used for both.
 * @param {string} text
 * @returns {{success: string, failure: string}}
 */
export function parseSanityLoss(text) {
  const [success = "0", failure] = String(text ?? "").split("/").map((part) => part.trim());
  return { success: success || "0", failure: failure || success || "0" };
}


/**
 * What a Sanity check's Roll Loss button rolls: the check's result now, counting the Luck burned on it since,
 * and that result's loss. A natural 20 stays a Big Failure (Luck can't change it): the fail loss at its highest.
 * @param {{total: number, natural?: number|null, sanity: number, lossFormulas?: {success: string, failure: string}}} check
 *   The check's flags.lotm.check (apps/sanity-check-dialog.mjs).
 * @param {number[]} [burns]   The Luck burned on it, in order (negative = subtracted).
 * @returns {{total: number, success: boolean, formula: string, isBigFailure: boolean}}
 */
export function pendingSanityLoss(check, burns = []) {
  const total = totalWithLuck(check.total, burns);
  const natural = check.natural ?? null;
  const success = sanityCheckSucceeds({ total, natural, sanity: check.sanity });
  const formula = (success ? check.lossFormulas?.success : check.lossFormulas?.failure) || "0";
  return { total, success, formula, isBigFailure: natural === 20 };
}


/* -------------------------------------------- */
/*  On actors (Foundry needed from here on)      */
/* -------------------------------------------- */

/**
 * Turn Indeterminate Madness and Out of Control on or off to match the actor's Sanity now. Each is only changed
 * when it's different, so this can run after every Sanity change (data/actor/base-actor.mjs _onUpdate).
 * Out of Control is never taken off here: losing control can't be undone by regaining Sanity (the GM decides). It's
 * only put on when Sanity dropped to 0 from above it, so a new actor whose Sanity was never filled in (0) isn't lost.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {number} [options.before]   Sanity before the change (base-actor.mjs _preUpdate). Unknown: counts as above 0.
 * @returns {Promise<void>}
 */
export async function syncSanityStatuses(actor, { before } = {}) {
  const rp = actor?.system?.resources?.rp;
  if (!rp) return;
  const has = (id) => actor.statuses?.has(id) ?? false;
  const wanted = wantedSanityStatuses({ value: rp.value, max: rp.max });

  const droppedToZero = before === undefined || before > 0;
  if (wanted.outOfControl && droppedToZero && !has("outOfControl")) {
    await actor.toggleStatusEffect("outOfControl", { active: true, overlay: true });
  }
  if (wanted.indeterminate !== has("indeterminateMadness")) {
    await actor.toggleStatusEffect("indeterminateMadness", { active: wanted.indeterminate });
  }
}


/**
 * Roll a d8 madness tendency.
 * @returns {Promise<{roll: Roll, value: number, label: string}>}
 */
export async function rollMadnessTendency() {
  const roll = await new Roll("1d8").evaluate();
  const key = CONFIG.LORD_OF_THE_MYSTERIES.madnessTendencies?.[roll.total];
  return { roll, value: roll.total, label: key ? game.i18n.localize(key) : String(roll.total) };
}


/**
 * Make a creature Semi-Out-of-Control (lost 3+ Sanity at once): 1d2 rounds, a d8 madness tendency.
 * Already Semi-Out-of-Control: it lasts the longer of the two, and keeps its tendency.
 * @param {Actor} actor
 * @returns {Promise<{effect: ActiveEffect|null, rounds: number, tendency: string}>}
 */
export async function startSemiOutOfControl(actor) {
  const { statusRule } = await import("../effects/status-effects.mjs");
  const rule = statusRule("semiOutOfControl");
  const rounds = (await new Roll("1d2").evaluate()).total;

  const existing = actor.effects.find((effect) => effect.statuses.has("semiOutOfControl"));
  if (existing) {
    const roundsLeft = Math.max(rounds, Number(existing.system?.roundsLeft) || 0);
    await existing.update({ "system.roundsLeft": roundsLeft });
    return { effect: existing, rounds: roundsLeft, tendency: madnessLabel(existing.system?.madness) };
  }

  const tendency = await rollMadnessTendency();
  const data = rule.toEffectData({ roundsLeft: rounds, madness: tendency.value });
  data.name = `${data.name}: ${tendency.label}`;
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return { effect: effect ?? null, rounds, tendency: tendency.label };
}


/**
 * A madness tendency's name, from its d8 number.
 * @param {number} value
 * @returns {string}  "" for none.
 */
export function madnessLabel(value) {
  const key = CONFIG.LORD_OF_THE_MYSTERIES.madnessTendencies?.[value];
  return key ? game.i18n.localize(key) : "";
}


/**
 * Take Sanity off an actor (never below 0). Losing 3 or more at once makes it Semi-Out-of-Control.
 * The madness statuses follow the new Sanity by themselves (syncSanityStatuses, after the update).
 * @param {Actor} actor
 * @param {number} loss
 * @returns {Promise<{before: number, after: number, loss: number, semi: object|null}>}
 *   semi: what startSemiOutOfControl returned, or null.
 */
export async function applySanityLoss(actor, loss) {
  const amount = Math.max(0, Math.floor(Number(loss) || 0));
  const before = Number(actor.system.resources.rp.value) || 0;
  const after = Math.max(0, before - amount);
  if (after !== before) await actor.update({ "system.resources.rp.value": after });
  const semi = amount >= SEMI_OUT_OF_CONTROL_LOSS ? await startSemiOutOfControl(actor) : null;
  return { before, after, loss: amount, semi };
}


/**
 * Give Sanity back (never above the maximum).
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<{before: number, after: number}>}
 */
export async function restoreSanity(actor, amount) {
  const rp = actor.system.resources.rp;
  const before = Number(rp.value) || 0;
  const after = Math.min(Number(rp.max) || 0, before + Math.max(0, Number(amount) || 0));
  if (after !== before) await actor.update({ "system.resources.rp.value": after });
  return { before, after };
}


/**
 * HTML for what a sanity loss did, for a chat card: "Loses 3 Sanity: 12 → 9.", and Semi-Out-of-Control.
 * The loss has already been rolled and taken off; this only reports it.
 * @param {object} result        What applySanityLoss returned.
 * @param {Roll} [lossRoll]      The loss roll: its dice go in the number's tooltip.
 * @returns {string}
 */
export function sanityLossHTML(result, lossRoll = null) {
  const lines = [game.i18n.format("LORD_OF_THE_MYSTERIES.Sanity.Loses", {
    loss: lossRoll ? rolledValueHTML(lossRoll, result.loss) : `<strong>${Number(result.loss) || 0}</strong>`,
    before: result.before, after: result.after,
  })];
  if (result.semi) {
    lines.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Sanity.SemiStarted", {
      rounds: result.semi.rounds, tendency: Handlebars.escapeExpression(result.semi.tendency),
    }));
  }
  return lines.map((line) => `<p>${line}</p>`).join("");
}


/**
 * Burning Luck changed a sanity check from pass to fail or back (helpers/luck.mjs): roll the other loss, and give
 * back or take the difference. Semi-Out-of-Control starts if the new loss is 3+, and the one the old loss started
 * ends if the new loss is under 3.
 * @param {object} state            The check's latest state: { actorUuid, loss, lossFormulas, isSolidified, semiEffectId }.
 * @param {boolean} success         The new result.
 * @returns {Promise<{html: string, state: object}>}  What to say in chat, and the new state to save.
 */
export async function changeSanityResult(state, success) {
  const actor = await fromUuid(state.actorUuid).catch(() => null);
  if (!actor) return { html: "", state };

  const formula = (success ? state.lossFormulas?.success : state.lossFormulas?.failure) || "0";
  const lossRoll = await new Roll(formula, actor.getRollData()).evaluate();
  const newLoss = lossAfterSolidification(lossRoll.total, state.isSolidified);
  const oldLoss = Number(state.loss) || 0;

  const rp = actor.system.resources.rp;
  const before = Number(rp.value) || 0;
  const after = Math.min(Number(rp.max) || 0, Math.max(0, before + oldLoss - newLoss));
  if (after !== before) await actor.update({ "system.resources.rp.value": after });

  let semiEffectId = state.semiEffectId ?? null;
  const lines = [game.i18n.format("LORD_OF_THE_MYSTERIES.Sanity.LuckChanged", {
    loss: rolledValueHTML(lossRoll, newLoss), old: oldLoss, before, after,
  })];
  if (newLoss >= SEMI_OUT_OF_CONTROL_LOSS && oldLoss < SEMI_OUT_OF_CONTROL_LOSS) {
    const semi = await startSemiOutOfControl(actor);
    semiEffectId = semi.effect?.id ?? null;
    lines.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Sanity.SemiStarted", {
      rounds: semi.rounds, tendency: Handlebars.escapeExpression(semi.tendency),
    }));
  }
  else if (newLoss < SEMI_OUT_OF_CONTROL_LOSS && oldLoss >= SEMI_OUT_OF_CONTROL_LOSS && semiEffectId) {
    await actor.effects.get(semiEffectId)?.delete();
    semiEffectId = null;
    lines.push(game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.SemiEnded"));
  }

  return {
    html: lines.map((line) => `<p>${line}</p>`).join(""),
    state: { ...state, loss: newLoss, semiEffectId },
  };
}


/**
 * The message a Sanity check's loss was rolled in (by its Roll Loss button), or null when it hasn't been.
 * @param {ChatMessage} message   The check's message.
 * @returns {ChatMessage|null}
 */
export function sanityLossMessage(message) {
  return game.messages.contents.find((other) => other.getFlag("lotm", "sanityLoss")?.sourceId === message?.id) ?? null;
}


/**
 * Whether the current user gets a Roll Loss button on this message: a Sanity check from the roll window whose
 * loss is rolled by the button (not one from before the button, whose loss was rolled with it), seen by the user,
 * for a character they own (the GM owns them all). The button is greyed out once the loss has been rolled.
 * @param {ChatMessage} message
 * @returns {boolean}
 */
export function canRollSanityLoss(message) {
  const check = message?.getFlag("lotm", "check");
  if (check?.kind !== "sanity" || !check.isLossPending || !message.isContentVisible) return false;
  return !!fromUuidSync(check.actorUuid)?.isOwner;
}


/**
 * The Roll Loss button: roll the loss for the check's result now (with any Luck burned on it), take it off, and
 * post it as its own roll, seen by the same people as the check. Works once per check.
 * @param {ChatMessage} message   The check's message.
 * @returns {Promise<ChatMessage|null>}  The loss's message, or null when nothing was rolled.
 */
export async function rollSanityLoss(message) {
  if (!canRollSanityLoss(message)) return null;
  if (sanityLossMessage(message)) {
    ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.AlreadyRolled"));
    return null;
  }
  const check = message.getFlag("lotm", "check");
  const actor = await fromUuid(check.actorUuid).catch(() => null);
  if (!actor?.system?.resources?.rp) return null;

  const [{ luckBurnsOn }, { messageModeOf, postRoll }] = await Promise.all([
    import("./luck.mjs"), import("./message-modes.mjs"),
  ]);
  const burns = luckBurnsOn(message).map((other) => other.getFlag("lotm", "luckBurn").amount);
  const pending = pendingSanityLoss(check, burns);
  if (!Roll.validate(pending.formula)) {
    ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.InvalidLoss"));
    return null;
  }

  const lossRoll = await new Roll(pending.formula, actor.getRollData()).evaluate(pending.isBigFailure ? { maximize: true } : {});
  const loss = lossAfterSolidification(lossRoll.total, check.isSolidified);
  const applied = await applySanityLoss(actor, loss);

  const result = game.i18n.localize(`LORD_OF_THE_MYSTERIES.RollDialog.${pending.success ? "Success" : "Failure"}`);
  const notes = [
    pending.isBigFailure ? game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.BigFailureLoss") : "",
    check.isSolidified ? game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.SolidifiedNote") : "",
  ].filter(Boolean).map((note) => `<p class="hint">${note}</p>`).join("");
  const flavor = game.i18n.format("LORD_OF_THE_MYSTERIES.Sanity.LossFlavor", {
    title: Handlebars.escapeExpression(check.title ?? ""), result,
  }) + `<div class="lotm chat-sanity">${sanityLossHTML(applied, lossRoll)}${notes}</div>`;

  return postRoll(lossRoll, {
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: {
      lotm: {
        // What Burning Luck needs if the check's result flips after this (changeSanityResult above).
        sanityLoss: {
          sourceId: message.id,
          actorUuid: actor.uuid,
          success: pending.success,
          loss: applied.loss,
          lossFormulas: check.lossFormulas,
          isSolidified: !!check.isSolidified,
          semiEffectId: applied.semi?.effect?.id ?? null,
        },
      },
    },
  }, messageModeOf(message));
}


/**
 * Open the sanity check dialog for an actor (or every selected token's actor, when none is given). For the GM's
 * macros, e.g.
 *   game.lotm.sanityCheck(null, { loss: "1/1d3", reason: "Saw the Wraith" })
 * @param {Actor|null} actor
 * @param {object} [options]
 * @param {string} [options.loss]      "1/1d3" style, or use success / failure.
 * @param {string} [options.success]   Loss on a pass.
 * @param {string} [options.failure]   Loss on a fail.
 * @param {number} [options.penalty]   Added to the d20 (makes failing likelier).
 * @param {string} [options.reason]
 * @returns {Promise<(Roll|null)[]>}
 */
export async function openSanityCheck(actor, { loss, success, failure, penalty = 0, reason = "" } = {}) {
  const { default: SanityCheckDialog } = await import("../apps/sanity-check-dialog.mjs");
  const losses = loss ? parseSanityLoss(loss) : { success: success ?? "0", failure: failure ?? "1" };
  const actors = actor ? [actor] : (canvas.tokens?.controlled ?? []).map((token) => token.actor).filter(Boolean);
  if (!actors.length) {
    ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.SelectToken"));
    return [];
  }
  const rolls = [];
  for (const target of actors) {
    rolls.push(await SanityCheckDialog.prompt(target, { ...losses, penalty, reason }));
  }
  return rolls;
}
