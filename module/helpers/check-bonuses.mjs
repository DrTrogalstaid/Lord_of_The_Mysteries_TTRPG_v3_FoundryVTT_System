/**
 * Check bonuses: bonuses to rolls that don't change an attribute itself.
 *
 * Each attribute has a checkBonus (system.attributes.<key>.checkBonus, base-actor.mjs), 0 unless an Active Effect
 * adds to it. It's added to attribute checks and skill checks that use that attribute, but not to the attribute's
 * total, so nothing worked out from the total changes (Spirituality, Health, defenses...).
 *
 * Spiritual intuition has its own bonus (system.spiritualIntuitionBonus), added only to spiritual intuition checks
 * (the Inspiration check dialog's "Spiritual Intuition" box, apps/attribute-check-dialog.mjs):
 *   Spirit Vision: "+2 to spiritual intuition checks" -> a change  system.spiritualIntuitionBonus  Add  2
 *   (Not system.attributes.ins.checkBonus: that would add +2 to every Inspiration check, Occultism and spells too.
 *   Older Spirit Vision effects did that; module/macros/move-spirit-vision-bonus.js moves them over.)
 *
 * In the roll window (apps/roll-dialog.mjs) each effect's bonus is its own row, named after the effect
 * ("Spirit Vision +2"), removable for that roll like the status modifiers. Rolls straight from an action's
 * Attack Roll Macro (no skill) don't know their attribute, so they don't get it.
 */

/** The change type that adds (v14's "add"; older effects stored ADD as mode 2). */
const isAddChange = (change) => change?.type === "add" || change?.mode === 2;


/**
 * The rows a roll gets from one bonus field: one per effect that adds to it. If something else changed the field
 * too (an Override, an edit by hand), one more row makes up the rest.
 * @param {Actor} actor
 * @param {string} key        The field under system, e.g. "attributes.ins.checkBonus", "spiritualIntuitionBonus".
 * @param {string} restLabel  The name of the "rest" row.
 * @param {string} rowKey     Start of each row's key, e.g. "checkBonus:ins" -> "checkBonus:ins:<effect id>".
 * @returns {{key: string, label: string, value: number, img: string|null}[]}
 */
export function bonusRows(actor, key, restLabel, rowKey = key) {
  const total = Number(key.split(".").reduce((value, part) => value?.[part], actor?.system)) || 0;
  const path = `system.${key}`;
  const rows = [];

  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!(effect.active ?? !effect.disabled)) continue;
    const changes = effect.system?.changes ?? effect.changes ?? [];
    const value = changes
      .filter((change) => change?.key === path && isAddChange(change))
      .reduce((sum, change) => sum + (Number(change.value) || 0), 0);
    if (value) rows.push({ key: `${rowKey}:${effect.id}`, label: effect.name, value, img: effect.img ?? null });
  }

  const rest = total - rows.reduce((sum, row) => sum + row.value, 0);
  if (rest) rows.push({ key: `${rowKey}:rest`, label: restLabel, value: rest, img: null });
  return rows;
}


/**
 * The rows a roll with this attribute gets (its check bonus).
 * @param {Actor} actor
 * @param {string} attributeKey   "ins", "str"...
 * @returns {{key: string, label: string, value: number, img: string|null}[]}
 */
export function checkBonusRows(actor, attributeKey) {
  const attribute = game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.attributes?.[attributeKey] ?? attributeKey);
  return bonusRows(actor, `attributes.${attributeKey}.checkBonus`,
    game.i18n.format("LORD_OF_THE_MYSTERIES.RollDialog.CheckBonus", { attribute }), `checkBonus:${attributeKey}`);
}


/**
 * The rows a spiritual intuition check gets (system.spiritualIntuitionBonus: Spirit Vision +2, ...).
 * @param {Actor} actor
 * @returns {{key: string, label: string, value: number, img: string|null}[]}
 */
export function spiritualIntuitionRows(actor) {
  return bonusRows(actor, "spiritualIntuitionBonus",
    game.i18n.localize("LORD_OF_THE_MYSTERIES.SpiritualIntuition.Bonus"));
}
