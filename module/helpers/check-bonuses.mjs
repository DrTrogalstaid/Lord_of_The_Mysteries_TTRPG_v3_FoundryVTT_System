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
 *
 * Skill bonuses (effects/skill-bonuses.mjs) work the same way: system.skills.<key>.bonus and
 * system.skillCategoryBonuses.<category>, one row per effect in skill checks and in actions and spells that roll with
 * the skill (skillBonusRowsFor below). The actor's data preparation works the rows out (data/actor/base-actor.mjs).
 */

import { changeAmount, effectChanges } from "../effects/skill-bonuses.mjs";


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
    // Add and Subtract changes to the field: a penalty (Subtract 2) is a -2 row named after its effect too.
    const value = effectChanges(effect)
      .filter((change) => change?.key === path)
      .reduce((sum, change) => sum + (changeAmount(change) ?? 0), 0);
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


/**
 * The rows a roll with this skill gets from Active Effects: one per effect that adds to the skill
 * ("Marksman's Focus"), one per effect that adds to its related-skill categories ("Drill (Firearms)"), and one for
 * anything else that changed them ("Pistol bonus"). See effects/skill-bonuses.mjs.
 * @param {Actor} actor
 * @param {string} key   The skill's key.
 * @returns {{key: string, label: string, value: number, img: string|null}[]}
 */
export function skillBonusRowsFor(actor, key) {
  const record = key ? actor?.system?.skillFor?.(key) : null;
  if (!record) return [];
  const categories = CONFIG.LORD_OF_THE_MYSTERIES.skillCategories ?? {};
  const categoryLabel = (category) => game.i18n.localize(categories[category] ?? category ?? "");
  const skillName = record.name || key;

  return (record.bonusRows ?? []).filter((row) => row.value).map((row) => {
    let label;
    if (row.kind === "skill") {
      label = row.rest ? game.i18n.format("LORD_OF_THE_MYSTERIES.RollDialog.SkillBonus", { skill: skillName }) : row.name;
    } else {
      label = row.rest
        ? game.i18n.format("LORD_OF_THE_MYSTERIES.RollDialog.CategoryBonus", { category: categoryLabel(row.category) })
        : `${row.name} (${categoryLabel(row.category)})`;
    }
    return { key: `skillBonus:${key}:${row.id}`, label, value: row.value, img: row.img ?? null };
  });
}
