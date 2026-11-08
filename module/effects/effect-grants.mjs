/**
 * What an Active Effect gives the actor it's on, besides Foundry's own number changes (data/effect/effect.mjs):
 *
 *   system.actionList      Actions. They're listed on the actor's sheet while the effect is active
 *                          (_prepareSections in sheets/base-actor-sheet.mjs), "Granted by" the effect.
 *   system.skillIncreases  Skill levels: { skillUuid, value, maxLevel }. The skill is rolled `value` levels higher,
 *                          but this effect never takes it above maxLevel (blank = no limit). A skill that's already
 *                          at or above maxLevel is left alone, never lowered.
 *
 * "Active" means turned on and not suppressed (gear that's stowed, see documents/active-effect.mjs). Effects an Item
 * lends its owner count, and so do the copies of granted abilities' passive effects (effects/granted-effects.mjs).
 *
 * Skill raises are worked out with the others, in this order (base-actor.mjs raisedSkillLevel):
 *   1. the level the player picked (at least the starting level, like Dodge's Trained)
 *   2. + the Sequences' skill increases
 *   3. + the effects' skill increases, each one capped at its own maxLevel
 *   4. then related skills raise each other (helpers/skill-associations.mjs)
 * Effect raises are temporary: studying, learning by doing and Education growth all go by the level without them,
 * so a buff never gets saved as a level the character learned.
 *
 * Plain data in / data out (no game / CONFIG), so it can be unit tested under Node (tests/effect-grants.test.mjs).
 */

import { SKILL_LEVEL_ORDER, levelIndex, raiseLevel } from "../helpers/skill-associations.mjs";

/** The highest level, used when a raise has no limit. */
const TOP_LEVEL = SKILL_LEVEL_ORDER[SKILL_LEVEL_ORDER.length - 1];


/**
 * Whether an effect is doing anything right now: turned on, and not suppressed.
 * @param {ActiveEffect|object} effect
 * @returns {boolean}
 */
export function isEffectActive(effect) {
  if (!effect) return false;
  if (typeof effect.active === "boolean") return effect.active;
  return !effect.disabled && !effect.isSuppressed;
}


/**
 * Every skill raise the active effects give, by skill.
 * @param {Iterable<ActiveEffect|object>} effects   E.g. actor.allApplicableEffects().
 * @returns {Record<string, {value: number, maxLevel: string, name: string, effectId: string}[]>}
 *   skill uuid -> its raises. Rows with no skill or a value of 0 are left out.
 */
export function collectSkillRaises(effects) {
  const raises = {};
  for (const effect of effects ?? []) {
    if (!isEffectActive(effect)) continue;
    for (const row of effect.system?.skillIncreases ?? []) {
      const value = Number(row?.value) || 0;
      if (!row?.skillUuid || value <= 0) continue;
      (raises[row.skillUuid] ??= []).push({
        value,
        maxLevel: row.maxLevel ?? "",
        name: effect.name ?? "",
        effectId: effect.id ?? "",
      });
    }
  }
  return raises;
}


/**
 * A level with effect raises applied. Each raise moves the skill up `value` levels, stopping at its maxLevel, and
 * never moves it down. Raises with the lowest limit go first, so the order the effects are in doesn't matter and
 * stacked raises always give the best result:
 *   Trained, +1 (at most Proficient) and +1 (at most Mastery)  ->  Proficient, then Advanced.
 * @param {string} level   The level before effects (the player's pick, plus Sequence raises).
 * @param {{value: number, maxLevel?: string}[]} [raises]
 * @returns {string}
 */
export function applySkillRaises(level, raises = []) {
  let current = level ?? "untrained";
  const capOf = (raise) => levelIndex(raise.maxLevel || TOP_LEVEL);
  const ordered = [...(raises ?? [])].sort((a, b) => capOf(a) - capOf(b));
  for (const raise of ordered) {
    const raised = raiseLevel(current, raise.value);
    const capped = Math.min(levelIndex(raised), capOf(raise));
    if (capped > levelIndex(current)) current = SKILL_LEVEL_ORDER[capped];
  }
  return current;
}


/**
 * The action uuids an effect grants (blank entries left out).
 * @param {ActiveEffect|object} effect
 * @returns {string[]}
 */
export function grantedActionUuids(effect) {
  return (effect?.system?.actionList ?? []).filter(Boolean);
}
