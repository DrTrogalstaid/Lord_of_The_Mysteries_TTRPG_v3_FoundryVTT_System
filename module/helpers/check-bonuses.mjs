/**
 * Check bonuses: bonuses to rolls with an attribute that don't change the attribute itself.
 *
 * Each attribute has a checkBonus (system.attributes.<key>.checkBonus, base-actor.mjs), 0 unless an Active Effect
 * adds to it. It's added to attribute checks and skill checks that use that attribute, but not to the attribute's
 * total, so nothing worked out from the total changes (Spirituality, Health, defenses...).
 *
 *   Spirit Vision: "+2 to spiritual intuition checks" -> a change  system.attributes.ins.checkBonus  Add  2
 *   (A change to system.attributes.ins.beyonder_bonus would raise Inspiration itself, and Spirituality with it.)
 *
 * In the roll window (apps/roll-dialog.mjs) each effect's bonus is its own row, named after the effect
 * ("Spirit Vision +2"), removable for that roll like the status modifiers. Rolls straight from an action's
 * Attack Roll Macro (no skill) don't know their attribute, so they don't get it.
 */

/** The change type that adds (v14's "add"; older effects stored ADD as mode 2). */
const isAddChange = (change) => change?.type === "add" || change?.mode === 2;


/**
 * The rows a roll with this attribute gets: one per effect that adds to its check bonus. If something else changed
 * the bonus too (an Override, an edit by hand), one more row makes up the rest.
 * @param {Actor} actor
 * @param {string} attributeKey   "ins", "str"...
 * @returns {{key: string, label: string, value: number, img: string|null}[]}
 */
export function checkBonusRows(actor, attributeKey) {
  const total = Number(actor?.system?.attributes?.[attributeKey]?.checkBonus) || 0;
  const path = `system.attributes.${attributeKey}.checkBonus`;
  const rows = [];

  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!(effect.active ?? !effect.disabled)) continue;
    const changes = effect.system?.changes ?? effect.changes ?? [];
    const value = changes
      .filter((change) => change?.key === path && isAddChange(change))
      .reduce((sum, change) => sum + (Number(change.value) || 0), 0);
    if (value) rows.push({ key: `checkBonus:${attributeKey}:${effect.id}`, label: effect.name, value, img: effect.img ?? null });
  }

  const rest = total - rows.reduce((sum, row) => sum + row.value, 0);
  if (rest) {
    const attribute = game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.attributes?.[attributeKey] ?? attributeKey);
    rows.push({
      key: `checkBonus:${attributeKey}:rest`,
      label: game.i18n.format("LORD_OF_THE_MYSTERIES.RollDialog.CheckBonus", { attribute }),
      value: rest,
      img: null,
    });
  }
  return rows;
}
