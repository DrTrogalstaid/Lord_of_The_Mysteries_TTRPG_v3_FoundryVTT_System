/**
 * Promotion: drinking the next potion (rulebook, Chapter 5: Promotion).
 *
 * When a Sequence is added to a character or NPC, the promotion dialog opens for whoever added it
 * (apps/promotion-dialog.mjs; Skip for character creation). The check:
 *   1d20 + 20 (+40 when it's a repeat of your current Sequence) + modifiers, at or under current Sanity to pass.
 *   No Big Success or Big Failure.
 * Then the Sanity loss for that Sequence (CONFIG.LORD_OF_THE_MYSTERIES.promotionSanityLoss: pass / fail),
 * doubled without a promotion ritual; a ritual gives 5 points of sanity protection instead. From Sequence 2,
 * followers give 1 protection per 1,000 (per 5,000 without a ritual).
 * What the total loss means:
 *   under 3   Promoted. 72 hours of Spiritual Overflow (-2 on the new abilities).
 *   3 or 4    Semi-out-of-control: Will (DC 15). Pass: promoted. Fail: a 1/1d2 sanity check with the same
 *             modifiers, then Will again, until it passes or the total loss reaches 5.
 *   5+        Out of control / death: Will (DC 20). Pass: a Beyonder who failed to be promoted (Expansion 5, the GM
 *             decides). Fail: 1d2, 1 = out of control, 2 = dies.
 * Each step after the check is a button on the promotion's chat card (registerPromotionChatListeners), the Sanity
 * losses included: Roll Loss rolls the loss and takes it off; nothing is taken off without a click.
 *
 * The plain math at the top has no `game` / `CONFIG` access (tests/promotion.test.mjs).
 */

import { langHTML, renderTemplateSync, safeHTML } from "./render.mjs";
import { rolledValueHTML } from "./sanity.mjs";

/** The promotion check adds this to the d20; a repeated potion of your current Sequence adds REPEATED_BASE instead. */
export const PROMOTION_BASE = 20;
export const REPEATED_BASE = 40;

/** Sanity protection from holding a promotion ritual. */
export const RITUAL_PROTECTION = 5;

/** Total Sanity lost at which a promotion goes semi-out-of-control, and out of control. */
export const SEMI_LOSS = 3;
export const LOST_LOSS = 5;


/** The characteristic's spiritual imprint (promotionModifiers' inputs.imprint). Anything else: 0. */
const IMPRINT_MODIFIERS = { similar: -2, opposite: 4 };

/** The moon during the ritual (promotionModifiers' inputs.moon). Anything else: 0. */
const MOON_MODIFIERS = { full: -2, blood: -4 };

/** A table's number for a key, or 0 when the key isn't in it. */
const tableValue = (table, key) => (Object.hasOwn(table, key) ? table[key] : 0);


/**
 * The promotion check's modifiers from the dialog's choices (rulebook ①-⑩). Negative = better (it's rolled under).
 * @param {object} inputs
 * @param {number} [inputs.digestion]          Digestion of your current potion: -1 each.
 * @param {number} [inputs.auxiliary]          Auxiliary ingredients in the potion: -1 each.
 * @param {boolean} [inputs.isRaw]             The main ingredient / characteristic taken raw: +5.
 * @param {string} [inputs.imprint]            The characteristic's spiritual imprint: "similar" -2, "opposite" +4.
 * @param {number} [inputs.undigested]         Undigested lower potions: +1 each.
 * @param {boolean} [inputs.isHelped]          A Beyonder of your Sequence or higher helps: -2 ...
 * @param {number} [inputs.helperSequences]    ... and -1 more per Sequence they're above you.
 * @param {string} [inputs.moon]               "full" -2, "blood" -4.
 * @param {boolean} [inputs.isAnimal]          A non-intelligent animal: +4.
 * @returns {{key: string, value: number}[]}   Only the ones that aren't 0. key = its language key's last part.
 */
export function promotionModifiers(inputs = {}) {
  const rows = [
    { key: "Digestion", value: -Math.max(0, Number(inputs.digestion) || 0) },
    { key: "Auxiliary", value: -Math.max(0, Number(inputs.auxiliary) || 0) },
    { key: "Raw", value: inputs.isRaw ? 5 : 0 },
    { key: "Imprint", value: tableValue(IMPRINT_MODIFIERS, inputs.imprint) },
    { key: "Undigested", value: Math.max(0, Number(inputs.undigested) || 0) },
    { key: "Helper", value: inputs.isHelped ? -(2 + Math.max(0, Number(inputs.helperSequences) || 0)) : 0 },
    { key: "Moon", value: tableValue(MOON_MODIFIERS, inputs.moon) },
    { key: "Animal", value: inputs.isAnimal ? 4 : 0 },
  ];
  return rows.filter((row) => row.value);
}


/**
 * The Sanity a promotion takes, after the ritual (or the lack of one) and followers.
 * @param {object} values
 * @param {number} values.rolled          The loss rolled from the table.
 * @param {boolean} values.hasRitual      A promotion ritual was held.
 * @param {number} [values.followers]     Followers (only from Sequence 2).
 * @param {number} values.sequence        The Sequence promoted to.
 * @returns {{loss: number, doubled: number, protection: number}}
 *   doubled     the rolled loss, doubled without a ritual
 *   protection  sanity protection (ritual + followers)
 *   loss        what's actually lost
 */
export function promotionLoss({ rolled, hasRitual, followers = 0, sequence }) {
  const base = Math.max(0, Number(rolled) || 0);
  const doubled = hasRitual ? base : base * 2;
  const perFollower = hasRitual ? 1000 : 5000;
  const fromFollowers = Number(sequence) <= 2 ? Math.floor(Math.max(0, Number(followers) || 0) / perFollower) : 0;
  const protection = (hasRitual ? RITUAL_PROTECTION : 0) + fromFollowers;
  return { loss: Math.max(0, doubled - protection), doubled, protection };
}


/**
 * Where a promotion stands after losing this much Sanity in all.
 * @param {number} totalLoss
 * @returns {"promoted"|"semi"|"lost"}
 */
export function promotionStage(totalLoss) {
  if (totalLoss >= LOST_LOSS) return "lost";
  if (totalLoss >= SEMI_LOSS) return "semi";
  return "promoted";
}


/* -------------------------------------------- */
/*  Foundry from here on                         */
/* -------------------------------------------- */

/**
 * How each promotion stage shows on its card: its colour, and the button for the next step (its data-lotm-promotion
 * is a PROMOTION_STEPS key). A stage not listed shows as a failure with no button.
 */
const STAGE_LOOKS = {
  pendingLoss: { css: "warning", button: { step: "rollLoss", label: "LORD_OF_THE_MYSTERIES.Promotion.Buttons.rollLoss" } },
  pendingExtraLoss: { css: "warning", button: { step: "rollExtraLoss", label: "LORD_OF_THE_MYSTERIES.Promotion.Buttons.rollLoss" } },
  semi: { css: "warning", button: { step: "semiWill", label: "LORD_OF_THE_MYSTERIES.Promotion.Buttons.semiWill" } },
  lost: { css: "failure", button: { step: "lostWill", label: "LORD_OF_THE_MYSTERIES.Promotion.Buttons.lostWill" } },
  promoted: { css: "success" },
  failedPromotion: { css: "failure" },
  outOfControl: { css: "failure" },
  died: { css: "failure" },
};


/**
 * Open the promotion dialog whenever a Sequence is added to an actor, for the user who added it.
 * A creation with { lotmSkipPromotion: true } in its options doesn't ask (for macros that build characters).
 * Called once from the init hook in lotm.mjs.
 */
export function registerPromotionHooks() {
  Hooks.on("createItem", (item, options, userId) => {
    if (userId !== game.user.id || options?.lotmSkipPromotion) return;
    if (item.type !== "sequence" || item.parent?.documentName !== "Actor") return;
    import("../apps/promotion-dialog.mjs").then(({ default: PromotionDialog }) => PromotionDialog.prompt(item.parent, item));
  });
  registerPromotionChatListeners();
}


/**
 * A promotion card's HTML: what was just rolled (line), what the stage means, and its next button.
 * @param {string} stage   promotionStage(...), or "failedPromotion" / "outOfControl" / "died".
 * @param {object} data
 * @param {string} data.name       The actor's name.
 * @param {string} data.sequence   The Sequence's name.
 * @param {{key: string, data?: object}} [data.line]   A lang line above the stage (a value that's already HTML, a
 *                                                     rolled number, goes in as safeHTML).
 * @returns {string}
 */
export function promotionCardHTML(stage, { name = "", sequence = "", line = null } = {}) {
  const look = Object.hasOwn(STAGE_LOOKS, stage) ? STAGE_LOOKS[stage] : { css: "failure" };
  return renderTemplateSync("systems/lotm/templates/chat/promotion.hbs", {
    ...look, line, name, sequence, stageKey: `LORD_OF_THE_MYSTERIES.Promotion.Stages.${stage}`,
  });
}


/**
 * A successful promotion: Spiritual Overflow for 72 hours (-2 on the new abilities' checks).
 * @param {Actor} actor
 */
export async function finishPromotion(actor) {
  if (!actor.statuses?.has("spiritualOverflow")) await actor.toggleStatusEffect("spiritualOverflow", { active: true });
}


/**
 * Post a promotion card for the next step (a stage and its button), with the promotion's data carried along.
 * @param {Actor} actor
 * @param {object} promotion   flags.lotm.promotion of the card before, with the new stage and total loss.
 * @param {{key: string, data?: object}|null} line   What was rolled, above the stage (see promotionCardHTML).
 * @param {ChatMessage} source The card before: the new card is seen by the same people.
 * @returns {Promise<ChatMessage>}
 */
async function postStage(actor, promotion, line, source) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: promotionCardHTML(promotion.stage, { name: actor.name, sequence: promotion.sequenceName, line }),
    whisper: [...(source?.whisper ?? [])],
    blind: !!source?.blind,
    flags: { lotm: { promotion: { ...promotion, used: [] } } },
  });
}


/**
 * Make the promotion cards' buttons work. Each works once (remembered in the card's flags.lotm.promotion.used).
 * Only the actor's owners and the GM can use them.
 */
function registerPromotionChatListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const promotion = message.getFlag("lotm", "promotion");
    if (!promotion) return;
    for (const button of html.querySelectorAll("button[data-lotm-promotion]")) {
      if ((promotion.used ?? []).includes(button.dataset.lotmPromotion)) button.disabled = true;
      button.addEventListener("click", (event) => onPromotionButton(event, message, button));
    }
  });
}


/**
 * What each button on a promotion card does (its data-lotm-promotion). Each takes (actor, promotion, message) and
 * resolves false when its roll window was closed.
 */
const PROMOTION_STEPS = {
  rollLoss,
  rollExtraLoss,
  semiWill,
  lostWill,
};


/**
 * A button on a promotion card.
 * @param {MouseEvent} event
 * @param {ChatMessage} message
 * @param {HTMLButtonElement} button
 */
async function onPromotionButton(event, message, button) {
  event.preventDefault();
  const promotion = message.getFlag("lotm", "promotion");
  const step = button.dataset.lotmPromotion;
  const actor = await fromUuid(promotion?.actorUuid).catch(() => null);
  if (!actor) return ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.Gone"));
  if (!actor.isOwner) return ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.TurnStart.NotOwner"));
  if ((promotion.used ?? []).includes(step)) return;

  const run = Object.hasOwn(PROMOTION_STEPS, step) ? PROMOTION_STEPS[step] : null;
  if (!run) return;

  button.disabled = true;
  const done = await run(actor, promotion, message);
  if (!done) {
    button.disabled = false;   // the roll window was closed
    return;
  }
  if (message.canUserModify(game.user, "update")) {
    await message.setFlag("lotm", "promotion", { ...promotion, used: [...(promotion.used ?? []), step] });
  }
}


/** The Will checks' reason: "Promotion to Sequence 8: Clown". Plain text. */
function promotionReason(promotion) {
  return game.i18n.format("LORD_OF_THE_MYSTERIES.Promotion.Reason", { sequence: promotion.sequenceName });
}


/**
 * Semi-out-of-control: Will (DC 15). Pass: promoted. Fail: a 1/1d2 sanity check with the promotion's modifiers;
 * at 5 total loss it's out of control / death, otherwise Will again.
 * @returns {Promise<boolean>}  false when the roll window was closed.
 */
async function semiWill(actor, promotion, message) {
  const { rollStatusCheck } = await import("../effects/status-checks.mjs");
  const result = await rollStatusCheck(actor, { attribute: "wil", dc: 15, reason: promotionReason(promotion),
    // No Burning Luck on promotion checks (helpers/luck.mjs).
    outcome: { type: "promotion" } });
  if (!result) return false;

  if (result.success) {
    await finishPromotion(actor);
    await postStage(actor, { ...promotion, stage: "promoted" }, null, message);
    return true;
  }

  // The extra sanity check: d20 + the promotion's modifiers (not its +20) at or under Sanity, no Big Failure.
  // Its loss (1 on a pass, 1d2 on a fail) waits for the next card's Roll Loss button.
  const sanity = Number(actor.system.resources.rp.value) || 0;
  const check = await new Roll(`1d20 + ${Number(promotion.modifierTotal) || 0}`).evaluate();
  const passed = check.total <= sanity;
  const line = { key: "LORD_OF_THE_MYSTERIES.Promotion.ExtraCheck", data: {
    roll: safeHTML(rolledValueHTML(check)), sanity,
    result: langHTML(`LORD_OF_THE_MYSTERIES.RollDialog.${passed ? "Success" : "Failure"}`),
  } };
  await postStage(actor, { ...promotion, stage: "pendingExtraLoss", extraPassed: passed }, line, message);
  return true;
}


/**
 * Roll Loss under the promotion check: the Sequence's loss for the check's result, doubled without a ritual, less
 * the ritual's protection and followers. Taken off, then the card for where the promotion stands.
 * @returns {Promise<boolean>}
 */
async function rollLoss(actor, promotion, message) {
  const formula = promotion.lossFormula || "0";
  const lossRoll = await new Roll(Roll.validate(formula) ? formula : "0").evaluate();
  const result = promotionLoss({
    rolled: lossRoll.total, hasRitual: promotion.hasRitual, followers: promotion.followers, sequence: promotion.sequence,
  });
  const before = Number(actor.system.resources.rp.value) || 0;
  const after = Math.max(0, before - result.loss);
  if (after !== before) await actor.update({ "system.resources.rp.value": after });
  const stage = promotionStage(result.loss);
  if (stage === "promoted") await finishPromotion(actor);

  const line = { key: "LORD_OF_THE_MYSTERIES.Promotion.Loss", data: {
    roll: safeHTML(rolledValueHTML(lossRoll)),
    ritual: langHTML(`LORD_OF_THE_MYSTERIES.Promotion.${promotion.hasRitual ? "WithRitual" : "WithoutRitual"}`, {
      protection: result.protection, doubled: result.doubled,
    }),
    loss: result.loss, before, after,
  } };
  await postStage(actor, { ...promotion, stage, totalLoss: result.loss }, line, message);
  return true;
}


/**
 * Roll Loss after the semi-out-of-control sanity check: 1 on a pass, 1d2 on a fail. Taken off, then Will again, or
 * out of control / death once the promotion has cost 5 in all.
 * @returns {Promise<boolean>}
 */
async function rollExtraLoss(actor, promotion, message) {
  const lossRoll = await new Roll(promotion.extraPassed ? "1" : "1d2").evaluate();
  const before = Number(actor.system.resources.rp.value) || 0;
  const after = Math.max(0, before - lossRoll.total);
  if (after !== before) await actor.update({ "system.resources.rp.value": after });
  const totalLoss = (Number(promotion.totalLoss) || 0) + lossRoll.total;
  const stage = totalLoss >= LOST_LOSS ? "lost" : "semi";

  const line = { key: "LORD_OF_THE_MYSTERIES.Promotion.ExtraLoss",
    data: { loss: safeHTML(rolledValueHTML(lossRoll)), before, after, total: totalLoss } };
  await postStage(actor, { ...promotion, stage, totalLoss }, line, message);
  return true;
}


/**
 * Out of control / death: Will (DC 20). Pass: failed promotion (the GM decides, Expansion 5).
 * Fail: 1d2, 1 = out of control, 2 = dies.
 * @returns {Promise<boolean>}
 */
async function lostWill(actor, promotion, message) {
  const { rollStatusCheck } = await import("../effects/status-checks.mjs");
  const result = await rollStatusCheck(actor, { attribute: "wil", dc: 20, reason: promotionReason(promotion),
    // No Burning Luck on promotion checks (helpers/luck.mjs).
    outcome: { type: "promotion" } });
  if (!result) return false;

  if (result.success) {
    await postStage(actor, { ...promotion, stage: "failedPromotion" }, null, message);
    return true;
  }
  const fate = await new Roll("1d2").evaluate();
  const stage = fate.total === 1 ? "outOfControl" : "died";
  if (stage === "outOfControl") await actor.toggleStatusEffect("outOfControl", { active: true, overlay: true });
  else await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  await postStage(actor, { ...promotion, stage }, { key: "LORD_OF_THE_MYSTERIES.Promotion.Fate", data: { roll: safeHTML(rolledValueHTML(fate)) } }, message);
  return true;
}
