/**
 * The "how much, and what for" window the sidebar's Spend buttons open (Luck and Spirituality).
 * Its text comes from the resource's own lang section: LORD_OF_THE_MYSTERIES.<section>.Current, Amount, Reason,
 * ReasonPlaceholder, SpendTitle, Spend and InvalidAmount.
 */

/**
 * Ask how much of a resource to spend, and optionally what for.
 * @param {object} options
 * @param {string} options.section   The lang section: "Luck" or "Spirituality".
 * @param {string} options.icon      Font Awesome class for the title and button, e.g. "fa-solid fa-clover".
 * @param {number} options.value     How much the character has now (the amount can't go above it).
 * @param {number} options.max
 * @returns {Promise<{amount: number, reason: string}|null>}  null when the window was closed or the amount was
 *                                                            under 1 (with a warning).
 */
export async function promptSpend({ section, icon, value, max }) {
  const key = (name) => `LORD_OF_THE_MYSTERIES.${section}.${name}`;
  const localize = (name) => game.i18n.localize(key(name));
  const escape = (text) => Handlebars.escapeExpression(text ?? "");

  const content = `
    <div class="lotm spend-dialog">
      <p>${game.i18n.format(key("Current"), { value, max })}</p>
      <div class="form-group">
        <label>${localize("Amount")}</label>
        <input type="number" name="amount" value="1" min="1" max="${value}" step="1" autofocus>
      </div>
      <div class="form-group">
        <label>${localize("Reason")}</label>
        <input type="text" name="reason" placeholder="${escape(localize("ReasonPlaceholder"))}">
      </div>
    </div>`;

  // Closing the window gives null (rejectClose: false), so nothing is spent.
  const input = await foundry.applications.api.DialogV2.prompt({
    window: { title: key("SpendTitle"), icon },
    content,
    ok: {
      label: key("Spend"),
      icon,
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
  return input;
}
