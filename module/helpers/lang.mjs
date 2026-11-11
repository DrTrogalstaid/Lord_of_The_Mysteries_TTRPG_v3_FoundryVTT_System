/**
 * Text from one section of lang/en.json, without writing the section's key out each time:
 *
 *   const luckText = langSection("LORD_OF_THE_MYSTERIES.Luck");
 *   luckText("Burn")                     game.i18n.localize("LORD_OF_THE_MYSTERIES.Luck.Burn")
 *   luckText("Spent", { name, amount })  game.i18n.format("LORD_OF_THE_MYSTERIES.Luck.Spent", { name, amount })
 *
 * Plain text, for notifications, window titles and labels: the values aren't escaped. Chat cards and dialogs use
 * templates, or formatHTML (helpers/render.mjs), which escape them.
 */

/**
 * @param {string} section   A lang key prefix, e.g. "LORD_OF_THE_MYSTERIES.Luck".
 * @returns {(key: string, data?: object) => string}
 */
export function langSection(section) {
  return (key, data) => (data ? game.i18n.format(`${section}.${key}`, data) : game.i18n.localize(`${section}.${key}`));
}
