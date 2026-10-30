/**
 * Spending Spirituality.
 *
 * Used by:
 *   - the sidebar's Spend button on the player and NPC sheets (openSpendSpiritualityDialog)
 *   - action rolls: an action with a Spirituality Cost spends it when it's rolled
 *       with a roll      a checkbox in the roll dialog (apps/roll-dialog.mjs), on unless the actor can't afford it.
 *                        Shift-click (no dialog) spends it too.
 *       with no roll     the "Spend N" button on the action's row (useActionSpirituality)
 *
 * Spirituality never goes below 0: when there isn't enough, nothing is spent and a warning is shown.
 */

/**
 * An action's Spirituality Cost. Blank counts as 0.
 * @param {Item} action
 * @returns {number}
 */
export function spiritualityCost(action) {
  return Math.max(0, Math.floor(Number(action?.system?.spiritualityCost) || 0));
}

/**
 * The actor's current and maximum Spirituality.
 * @param {Actor} actor
 * @returns {{value: number, max: number}}
 */
export function currentSpirituality(actor) {
  const spp = actor?.system?.resources?.spp ?? {};
  return { value: Number(spp.value) || 0, max: Number(spp.max) || 0 };
}

/**
 * Take Spirituality from the actor.
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [options]
 * @param {string} [options.reason]   What it was spent on, for the warning and chat message (an action's name).
 * @param {boolean} [options.chat]    Post "X spends 3 Spirituality on Y. 10 → 7" to chat. Rolls put a note in their
 *                                    own message instead (spiritualityNote), so they pass false.
 * @returns {Promise<{amount: number, before: number, after: number}|null>}
 *   What happened, or null when nothing was spent (not enough, or nothing to spend).
 */
export async function spendSpirituality(actor, amount, { reason = "", chat = true } = {}) {
  amount = Math.floor(Number(amount) || 0);
  if (!actor || amount <= 0) return null;

  const { value } = currentSpirituality(actor);
  if (amount > value) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Spirituality.NotEnough", {
      name: actor.name, value, cost: amount,
    }));
    return null;
  }

  const after = value - amount;
  await actor.update({ "system.resources.spp.value": after });
  const result = { amount, before: value, after };

  if (chat) {
    const text = game.i18n.format("LORD_OF_THE_MYSTERIES.Spirituality.Chat", {
      name: Handlebars.escapeExpression(actor.name),
      amount,
      reason: reason
        ? game.i18n.format("LORD_OF_THE_MYSTERIES.Spirituality.ChatReason", { reason: Handlebars.escapeExpression(reason) })
        : "",
      before: value,
      after,
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="lotm chat-spirituality"><i class="fa-solid fa-sparkles"></i> ${text}</div>`,
    });
  }
  return result;
}

/**
 * The line a roll's chat message gets when it spent Spirituality: "−2 Spirituality (8 left)".
 * @param {{amount: number, after: number}|null} spent  What spendSpirituality returned.
 * @returns {string}  HTML, or "" when nothing was spent.
 */
export function spiritualityNote(spent) {
  if (!spent) return "";
  const text = game.i18n.format("LORD_OF_THE_MYSTERIES.Spirituality.RollNote", { amount: spent.amount, after: spent.after });
  return `<div class="lotm chat-spirituality"><i class="fa-solid fa-sparkles"></i> ${text}</div>`;
}

/**
 * The sidebar's Spend button: ask how much to spend (and, optionally, what for), then spend it.
 * @param {Actor} actor
 * @returns {Promise<object|null>}  What spendSpirituality returned, or null if cancelled.
 */
export async function openSpendSpiritualityDialog(actor) {
  const { value, max } = currentSpirituality(actor);
  const localize = (key) => game.i18n.localize(`LORD_OF_THE_MYSTERIES.Spirituality.${key}`);

  const content = `
    <div class="lotm spend-spirituality-dialog">
      <p class="spend-spirituality-current">
        ${game.i18n.format("LORD_OF_THE_MYSTERIES.Spirituality.Current", { value, max })}
      </p>
      <div class="form-group">
        <label>${localize("Amount")}</label>
        <input type="number" name="amount" value="1" min="1" max="${value}" step="1" autofocus>
      </div>
      <div class="form-group">
        <label>${localize("Reason")}</label>
        <input type="text" name="reason" placeholder="${localize("ReasonPlaceholder")}">
      </div>
    </div>`;

  // Closing the window gives null (rejectClose: false), so nothing is spent.
  const input = await foundry.applications.api.DialogV2.prompt({
    window: { title: "LORD_OF_THE_MYSTERIES.Spirituality.SpendTitle", icon: "fa-solid fa-sparkles" },
    content,
    ok: {
      label: "LORD_OF_THE_MYSTERIES.Spirituality.Spend",
      icon: "fa-solid fa-sparkles",
      callback: (event, button) => ({
        amount: button.form.elements.amount.valueAsNumber,
        reason: button.form.elements.reason.value.trim(),
      }),
    },
    rejectClose: false,
  });
  if (!input) return null;

  if (!Number.isFinite(input.amount) || input.amount < 1) {
    ui.notifications.warn(localize("InvalidAmount"));
    return null;
  }
  return spendSpirituality(actor, input.amount, { reason: input.reason });
}

/**
 * The "Spend N" button on an action that has a Spirituality Cost but nothing to roll
 * (no skill and no Attack Roll Macro): spend the cost and say so in chat.
 * @param {Actor} actor
 * @param {Item} action
 * @returns {Promise<object|null>}
 */
export async function useActionSpirituality(actor, action) {
  return spendSpirituality(actor, spiritualityCost(action), { reason: action.name });
}
