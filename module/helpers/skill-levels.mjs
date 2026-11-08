/**
 * The level a character rolls a skill at, with related-skill improvement applied
 * (see skill-associations.mjs) and starting levels like Dodge's Trained (CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels),
 * plus the raises from the character's Sequences and active effects (raisedSkillLevel in data/actor/base-actor.mjs).
 * Used by action rolls (helpers/action-roll.mjs).
 *
 * The character sheet works the same thing out on its own while it builds the skill list,
 * because it already has every skill loaded at that point.
 */

import { atLeastLevel, computeAssociatedLevels, raiseLevel, skillCategoriesOf } from "./skill-associations.mjs";

/**
 * Each skill's name and categories, by uuid, so a sheet with many actions doesn't look up the same
 * skill Items over and over. Holds promises, so two lookups at the same moment share one fromUuid.
 * Emptied whenever any skill Item changes, so edited categories are picked up straight away.
 * @type {Map<string, Promise<{name: string, categories: object[]}|null>>}
 */
const skillInfoCache = new Map();

for (const hook of ["updateItem", "deleteItem", "createItem"]) {
  Hooks.on(hook, (item) => {
    if (item.type === "skill") skillInfoCache.clear();
  });
}

/**
 * A skill Item's name and categories.
 * @param {string} uuid
 * @returns {Promise<{name: string, categories: object[]}|null>}  null if the skill no longer exists.
 */
function skillInfo(uuid) {
  if (!skillInfoCache.has(uuid)) {
    const lookup = fromUuid(uuid)
      .then((doc) => (doc ? { name: doc.name, categories: skillCategoriesOf(doc.system) } : null))
      .catch(() => null);
    skillInfoCache.set(uuid, lookup);
  }
  return skillInfoCache.get(uuid);
}

/**
 * Every skill the actor has a level recorded for, with its categories read from the skill Item.
 * @param {Actor} actor
 * @param {string} [extraUuid]  Also include this skill at "untrained" if the actor has no level recorded for it,
 *                              so an untouched skill can still be raised by its category.
 * @returns {Promise<{uuid: string, name: string, level: string, categories: object[]}[]>}
 */
async function actorSkillEntries(actor, extraUuid) {
  // actor.system.skills is { str: [{ skill, level, analysis }], agi: [...], ... }. Put them all in one list.
  const stored = Object.values(actor.system.skills ?? {})
    .filter((list) => Array.isArray(list))
    .flat()
    .filter((entry) => entry?.skill);

  if (extraUuid && !stored.some((entry) => entry.skill === extraUuid)) {
    stored.push({ skill: extraUuid, level: "untrained" });
  }
  // A skill only an active effect raises (no level saved yet) can still raise its related skills.
  for (const uuid of Object.keys(actor.system.effectSkillRaises ?? {})) {
    if (!stored.some((entry) => entry.skill === uuid)) stored.push({ skill: uuid, level: "untrained" });
  }

  const minimums = CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels ?? {};
  const sequenceSteps = actor.system.sequenceSkillSteps ?? {};   // Sequence skill increases (base-actor.mjs)
  // The player's pick, at least the starting level (Dodge), then raised by the character's Sequences and effects.
  const raised = (entry) => (typeof actor.system.raisedSkillLevel === "function"
    ? actor.system.raisedSkillLevel(entry.skill, entry.level)
    : raiseLevel(atLeastLevel(entry.level, minimums[entry.skill]), sequenceSteps[entry.skill] ?? 0));
  const entries = await Promise.all(stored.map(async (entry) => {
    const info = await skillInfo(entry.skill);
    if (!info) return null;
    return {
      uuid: entry.skill,
      name: info.name,
      level: raised(entry),
      categories: info.categories,
    };
  }));
  return entries.filter(Boolean);
}

/**
 * The level the actor rolls a skill at: their own level, or higher if a related skill raises it.
 * @param {Actor} actor
 * @param {string} skillUuid
 * @returns {Promise<string>}  A key of CONFIG.LORD_OF_THE_MYSTERIES.skillLevels
 */
export async function effectiveSkillLevel(actor, skillUuid) {
  if (!actor || !skillUuid) return "untrained";
  const entries = await actorSkillEntries(actor, skillUuid);
  const result = computeAssociatedLevels(entries).get(skillUuid);
  return result?.level ?? "untrained";
}
