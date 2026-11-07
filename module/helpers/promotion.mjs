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

import { rolledValueHTML } from "./sanity.mjs";

/** The promotion check adds this to the d20; a repeated potion of your current Sequence adds REPEATED_BASE instead. */
export const PROMOTION_BASE = 20;
export const REPEATED_BASE = 40;

/** Sanity protection from holding a promotion ritual. */
export const RITUAL_PROTECTION = 5;

/** Total Sanity lost at which a promotion goes semi-out-of-control, and out of control. */
export const SEMI_LOSS = 3;
export const LOST_LOSS = 5;


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
    { key: "Imprint", value: inputs.imprint === "similar" ? -2 : inputs.imprint === "opposite" ? 4 : 0 },
    { key: "Undigested", value: Math.max(0, Number(inputs.undigested) || 0) },
    { key: "Helper", value: inputs.isHelped ? -(2 + Math.max(0, Number(inputs.helperSequences) || 0)) : 0 },
    { key: "Moon", value: inputs.moon === "full" ? -2 : inputs.moon === "blood" ? -4 : 0 },
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

const t = (key, data) => (data ? game.i18n.format(`LORD_OF_THE_MYSTERIES.Promotion.${key}`, data) : game.i18n.localize(`LORD_OF_THE_MYSTERIES.Promotion.${key}`));
const escape = (text) => Handlebars.escapeExpression(text ?? "");


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
 * The HTML for what a promotion stage means, and its next button.
 * @param {string} stage   promotionStage(...), or "failedPromotion" / "outOfControl" / "died".
 * @param {object} data    { name, sequence } for the text.
 * @returns {string}
 */
export function stageHTML(stage, { name = "", sequence = "" } = {}) {
  const text = t(`Stages.${stage}`, { name: escape(name), sequence: escape(sequence) });
  const button = {
    pendingLoss: { step: "rollLoss", label: t("Buttons.rollLoss") },
    pendingExtraLoss: { step: "rollExtraLoss", label: t("Buttons.rollLoss") },
    semi: { step: "semiWill", label: t("Buttons.semiWill") },
    lost: { step: "lostWill", label: t("Buttons.lostWill") },
  }[stage];
  const css = stage === "promoted" ? "success"
    : (["semi", "pendingLoss", "pendingExtraLoss"].includes(stage) ? "warning" : "failure");
  return `<div class="lotm promotion-stage ${css}"><p>${text}</p>${button
    ? `<div class="promotion-buttons"><button type="button" data-lotm-promotion="${button.step}">${button.label}</button></div>`
    : ""}</div>`;
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
 * @param {string} body        HTML above the stage.
 * @param {ChatMessage} source The card before: the new card is seen by the same people.
 * @returns {Promise<ChatMessage>}
 */
async function postStage(actor, promotion, body, source) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="lotm chat-promotion">${body}${stageHTML(promotion.stage, {
      name: actor.name, sequence: promotion.sequenceName,
    })}</div>`,
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

  button.disabled = true;
  const done = step === "rollLoss" ? await rollLoss(actor, promotion, message)
    : step === "rollExtraLoss" ? await rollExtraLoss(actor, promotion, message)
    : step === "semiWill" ? await semiWill(actor, promotion, message)
    : step === "lostWill" ? await lostWill(actor, promotion, message)
    : false;
  if (!done) {
    button.disabled = false;   // the roll window was closed
    return;
  }
  if (message.canUserModify(game.user, "update")) {
    await message.setFlag("lotm", "promotion", { ...promotion, used: [...(promotion.used ?? []), step] });
  }
}


/**
 * Semi-out-of-control: Will (DC 15). Pass: promoted. Fail: a 1/1d2 sanity check with the promotion's modifiers;
 * at 5 total loss it's out of control / death, otherwise Will again.
 * @returns {Promise<boolean>}  false when the roll window was closed.
 */
async function semiWill(actor, promotion, message) {
  const { rollStatusCheck } = await import("../effects/status-checks.mjs");
  const result = await rollStatusCheck(actor, { attribute: "wil", dc: 15, reason: t("Reason", { sequence: promotion.sequenceName }),
    // No Burning Luck on promotion checks (helpers/luck.mjs).
    outcome: { type: "promotion" } });
  if (!result) return false;

  if (result.success) {
    await finishPromotion(actor);
    await postStage(actor, { ...promotion, stage: "promoted" }, "", message);
    return true;
  }

  // The extra sanity check: d20 + the promotion's modifiers (not its +20) at or under Sanity, no Big Failure.
  // Its loss (1 on a pass, 1d2 on a fail) waits for the next card's Roll Loss button.
  const sanity = Number(actor.system.resources.rp.value) || 0;
  const check = await new Roll(`1d20 + ${Number(promotion.modifierTotal) || 0}`).evaluate();
  const passed = check.total <= sanity;
  const body = `<p>${t("ExtraCheck", {
    roll: rolledValueHTML(check), sanity,
    result: game.i18n.localize(`LORD_OF_THE_MYSTERIES.RollDialog.${passed ? "Success" : "Failure"}`),
  })}</p>`;
  await postStage(actor, { ...promotion, stage: "pendingExtraLoss", extraPassed: passed }, body, message);
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

  const body = `<p>${t("Loss", {
    roll: rolledValueHTML(lossRoll),
    ritual: t(promotion.hasRitual ? "WithRitual" : "WithoutRitual", { protection: result.protection, doubled: result.doubled }),
    loss: result.loss, before, after,
  })}</p>`;
  await postStage(actor, { ...promotion, stage, totalLoss: result.loss }, body, message);
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

  const body = `<p>${t("ExtraLoss", { loss: rolledValueHTML(lossRoll), before, after, total: totalLoss })}</p>`;
  await postStage(actor, { ...promotion, stage, totalLoss }, body, message);
  return true;
}


/**
 * Out of control / death: Will (DC 20). Pass: failed promotion (the GM decides, Expansion 5).
 * Fail: 1d2, 1 = out of control, 2 = dies.
 * @returns {Promise<boolean>}
 */
async function lostWill(actor, promotion, message) {
  const { rollStatusCheck } = await import("../effects/status-checks.mjs");
  const result = await rollStatusCheck(actor, { attribute: "wil", dc: 20, reason: t("Reason", { sequence: promotion.sequenceName }),
    // No Burning Luck on promotion checks (helpers/luck.mjs).
    outcome: { type: "promotion" } });
  if (!result) return false;

  if (result.success) {
    await postStage(actor, { ...promotion, stage: "failedPromotion" }, "", message);
    return true;
  }
  const fate = await new Roll("1d2").evaluate();
  const stage = fate.total === 1 ? "outOfControl" : "died";
  if (stage === "outOfControl") await actor.toggleStatusEffect("outOfControl", { active: true, overlay: true });
  else await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  const body = `<p>${t("Fate", { roll: rolledValueHTML(fate) })}</p>`;
  await postStage(actor, { ...promotion, stage }, body, message);
  return true;
}
