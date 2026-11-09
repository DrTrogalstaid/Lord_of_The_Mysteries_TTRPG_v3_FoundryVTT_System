/**
 * Skill roll bonuses from Active Effects. They're ordinary Foundry changes (the effect's Changes tab), so they stack,
 * use priorities and phases, and can be Override as well as Add:
 *
 *   system.skills.<key>.bonus                Add 2   +2 to that one skill's rolls       ("system.skills.pistol.bonus")
 *   system.skillCategoryBonuses.<category>   Add 1   +1 to every skill in that related-skill category
 *                                                    ("system.skillCategoryBonuses.firearms": Pistol, Rifle, Shotgun)
 *
 * The effect sheet's LotM tab writes these for you: drop skills on "Skill Roll Bonuses", or pick categories
 * (apps/effect-config.mjs). Several skills = several changes.
 *
 * What a bonus does:
 *   - it's added to the skill's rolls: skill checks, and actions and spells that roll with the skill. In the roll window
 *     each effect is its own row ("Marksman's Focus +2"), which can be taken out for that one roll.
 *   - the sheet's number for the skill includes it.
 *   - Dodge's bonus also raises Dodge defense, and so Physical defense (data/actor/base-actor.mjs).
 *   - it never changes the skill's level, so learning, Education growth and related skills don't count it.
 *   - on its own it doesn't give a character the skill: a skill they don't have isn't added to their sheet. If they
 *     roll it anyway (an action that uses it), the bonus still counts.
 *
 * Categories: a skill in two categories (Psychology: Social and Reconnaissance) gets each effect's bonus once, the
 * bigger of the two, so one effect that covers both categories doesn't count twice. Different effects add up.
 *
 * Plain data in / data out (no game / CONFIG), so it can be unit tested under Node (tests/skill-bonuses.test.mjs).
 */

import { isEffectActive } from "./effect-grants.mjs";

/** A change key that gives one skill a bonus. Group 1 is the skill's key. */
export const SKILL_BONUS_PATTERN = /^system\.skills\.([^.]+)\.bonus$/;

/** A change key that gives a related-skill category a bonus. Group 1 is the category. */
export const CATEGORY_BONUS_PATTERN = /^system\.skillCategoryBonuses\.([^.]+)$/;

/**
 * The change key for a bonus to one skill.
 * @param {string} key  The skill's key, e.g. "pistol".
 * @returns {string}    "system.skills.pistol.bonus"
 */
export function skillBonusChangeKey(key) {
  return `system.skills.${key}.bonus`;
}

/**
 * The change key for a bonus to every skill in a category.
 * @param {string} category  A key of CONFIG.LORD_OF_THE_MYSTERIES.skillCategories, e.g. "firearms".
 * @returns {string}         "system.skillCategoryBonuses.firearms"
 */
export function categoryBonusChangeKey(category) {
  return `system.skillCategoryBonuses.${category}`;
}


/**
 * An effect's changes (v14 keeps them in system.changes; older data had them on the effect itself).
 * @param {ActiveEffect|object} effect
 * @returns {object[]}
 */
export function effectChanges(effect) {
  const changes = effect?.system?.changes ?? effect?.changes ?? [];
  return Array.isArray(changes) ? changes : [];
}


/**
 * How much a change adds: its value for Add, minus its value for Subtract, null for anything else (Override...).
 * Older effects stored Add as mode 2.
 * @param {{type?: string, mode?: number, value?: any}} change
 * @returns {number|null}
 */
export function changeAmount(change) {
  const type = change?.type ?? (change?.mode === 2 ? "add" : null);
  const value = Number(change?.value);
  if (!Number.isFinite(value)) return null;
  if (type === "add") return value;
  if (type === "subtract") return -value;
  return null;
}


/**
 * Every skill and category bonus the active effects give, by effect.
 * @param {Iterable<ActiveEffect|object>} effects   E.g. actor.allApplicableEffects().
 * @param {{isActive?: (effect) => boolean}} [options]
 * @returns {{
 *   skills: Record<string, {effectId: string, name: string, img: string|null, value: number}[]>,
 *   categories: Record<string, {effectId: string, name: string, img: string|null, value: number}[]>,
 *   targets: Set<string>
 * }}
 *   skills / categories: the Add and Subtract changes, one part per change.
 *   targets: every skill key a change points at (any type), so the actor can have a place ready for it before
 *            Foundry applies the changes.
 */
export function collectSkillBonuses(effects, { isActive = isEffectActive } = {}) {
  const skills = {};
  const categories = {};
  const targets = new Set();

  for (const effect of effects ?? []) {
    if (!isActive(effect)) continue;
    for (const change of effectChanges(effect)) {
      const key = String(change?.key ?? "");
      const skillMatch = key.match(SKILL_BONUS_PATTERN);
      const categoryMatch = skillMatch ? null : key.match(CATEGORY_BONUS_PATTERN);
      if (!skillMatch && !categoryMatch) continue;
      if (skillMatch) targets.add(skillMatch[1]);

      const value = changeAmount(change);
      if (!value) continue;
      const part = { effectId: effect.id ?? "", name: effect.name ?? "", img: effect.img ?? null, value };
      if (skillMatch) (skills[skillMatch[1]] ??= []).push(part);
      else (categories[categoryMatch[1]] ??= []).push(part);
    }
  }
  return { skills, categories, targets };
}


/**
 * Parts added up per effect: { effectId -> { effectId, name, img, value } }.
 * @param {{effectId: string, name: string, img: string|null, value: number}[]} parts
 * @returns {Map<string, object>}
 */
function sumByEffect(parts) {
  const byEffect = new Map();
  for (const part of parts ?? []) {
    const row = byEffect.get(part.effectId);
    if (row) row.value += part.value;
    else byEffect.set(part.effectId, { ...part });
  }
  return byEffect;
}


/**
 * The bonus rows one skill's rolls get:
 *   - one per effect with a bonus to this skill                         kind "skill"
 *   - one per effect with a bonus to this skill's categories (the biggest one, when the effect covers more than one
 *     of them)                                                         kind "category", with that category
 *   - a "rest" row for whatever the totals have that those rows don't (an Override change, or a value saved by hand)
 * Rows with 0 are left out. The rows add up to the skill's whole bonus (see skillBonusTotal).
 *
 * @param {object} params
 * @param {string} params.key                      The skill's key.
 * @param {string[]} [params.categories]           The skill's related-skill categories.
 * @param {ReturnType<typeof collectSkillBonuses>} params.collected
 * @param {number} [params.skillTotal]             system.skills.<key>.bonus after effects were applied.
 * @param {Record<string, number>} [params.categoryTotals]   system.skillCategoryBonuses after effects were applied.
 * @returns {{id: string, effectId: string|null, name: string, img: string|null, value: number,
 *            kind: "skill"|"category", category: string|null, rest: boolean}[]}
 */
export function skillBonusRows({ key, categories = [], collected, skillTotal = 0, categoryTotals = {} }) {
  const rows = [];

  // 1. Bonuses to this skill.
  const own = sumByEffect(collected?.skills?.[key]);
  let ownSum = 0;
  for (const part of own.values()) {
    ownSum += part.value;
    if (part.value) rows.push({ id: `skill:${part.effectId}`, ...part, kind: "skill", category: null, rest: false });
  }
  const skillRest = (Number(skillTotal) || 0) - ownSum;
  if (skillRest) {
    rows.push({ id: "skill:rest", effectId: null, name: "", img: null, value: skillRest, kind: "skill", category: null, rest: true });
  }

  // 2. Bonuses to its categories: each effect counts once, with its biggest one.
  const best = new Map();   // effectId -> row
  let bestRest = null;      // { value, category }
  for (const category of new Set(categories ?? [])) {
    const parts = sumByEffect(collected?.categories?.[category]);
    let sum = 0;
    for (const part of parts.values()) {
      sum += part.value;
      const current = best.get(part.effectId);
      if (!current || part.value > current.value) best.set(part.effectId, { ...part, category });
    }
    const rest = (Number(categoryTotals?.[category]) || 0) - sum;
    if (rest && (!bestRest || rest > bestRest.value)) bestRest = { value: rest, category };
  }
  for (const part of best.values()) {
    if (part.value) rows.push({ id: `category:${part.effectId}`, ...part, kind: "category", rest: false });
  }
  if (bestRest) {
    rows.push({ id: "category:rest", effectId: null, name: "", img: null, value: bestRest.value, kind: "category", category: bestRest.category, rest: true });
  }

  return rows;
}


/**
 * The rows added together.
 * @param {{value: number}[]} rows
 * @returns {number}
 */
export function skillBonusTotal(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (Number(row.value) || 0), 0);
}
