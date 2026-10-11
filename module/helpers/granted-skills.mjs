/**
 * Skills granted by abilities.
 *
 * An ability with `system.grantsSkills` set offers a dropdown of skills (its
 * `system.skillOptions`, compendium skill UUIDs the GM drops onto the ability)
 * and also accepts custom skills. Whatever the character adds is stored on
 * their own copy of the ability in `system.grantedSkills` -- level and analysis
 * count included -- so the progress travels with the ability if it's stolen.
 * Each such ability gets its own skill tab on the character sheet.
 *
 * An ability can also set `system.analyzeSkills`: then the character's regular
 * skills get an Analyze button. Analyzing a non-Education skill adds an Education
 * copy of it to this ability's list (Extraordinary Knowledge: "Education +
 * Knowledge replaces attribute + skill"). Education skills already roll with
 * Education and can be trained directly, so their analyses are counted on the
 * skill itself instead (see PlayerCharacterSheet._onAnalyzeSkill).
 *
 * Plain data in / data out (no `game`/`CONFIG` access) so it can be unit
 * tested under Node.
 */

import { calculateSkillModifier } from "./skill-modifiers.mjs";

/**
 * Build the contents of one skill-granting ability's tab: its granted skills
 * (each rolled with its own attribute) and the dropdown options not yet taken.
 * @param {{id: string, name: string, grantedSkills: object[], options: {uuid, name, attribute}[]}} ability
 * @param {Record<string, number>} attributeTotals  Attribute key -> total
 * @returns {{abilityId: string, abilityName: string, skills: object[], options: object[]}}
 */
export function buildGrantedSkillTab(ability, attributeTotals) {
  const granted = ability.grantedSkills ?? [];
  const takenUuids = new Set(granted.map((s) => s.uuid).filter(Boolean));
  return {
    abilityId: ability.id,
    abilityName: ability.name,
    skills: granted
      .map((s) => ({ ...s, modifier: calculateSkillModifier(s.level, attributeTotals[s.attribute] ?? 0) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    options: (ability.options ?? [])
      .filter((o) => !takenUuids.has(o.uuid))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

/**
 * Record one analysis of a regular skill on an analyze-skills ability: bumps
 * the counter on its existing copy, or adds an Education copy with 1 analysis.
 * @param {object[]} granted  The ability's current system.grantedSkills
 * @param {{uuid: string, name: string}} skill  The regular skill that was analyzed
 * @param {string} id         Id for a new entry (foundry.utils.randomID() in Foundry)
 * @returns {object[]} The new list
 */
export function recordSkillAnalysis(granted, skill, id) {
  const list = granted ?? [];
  const existing = list.find((s) => s.uuid && s.uuid === skill.uuid);
  if (existing) return updateGrantedSkill(list, existing.id, { analysis: existing.analysis + 1 });
  const added = addGrantedSkill(list, { uuid: skill.uuid, name: skill.name, attribute: "edu" }, id);
  // A same-named Education entry already exists (e.g. a custom one): count it there.
  if (!added) {
    const sameName = list.find((s) => s.attribute === "edu" && s.name.toLowerCase() === skill.name.trim().toLowerCase());
    return sameName ? updateGrantedSkill(list, sameName.id, { analysis: sameName.analysis + 1 }) : list;
  }
  return updateGrantedSkill(added, id, { analysis: 1 });
}

/**
 * Add a skill to an ability's granted list.
 * @param {object[]} granted  The ability's current system.grantedSkills
 * @param {{uuid?: string, name: string, attribute: string}} skill
 * @param {string} id         New entry id (foundry.utils.randomID() in Foundry)
 * @returns {object[]|null}   The new list, or null if it's a duplicate (same
 *                            compendium skill, or same name + attribute) or has no name.
 */
export function addGrantedSkill(granted, skill, id) {
  const name = skill.name?.trim();
  if (!name) return null;
  const list = granted ?? [];
  const duplicate = list.some((s) =>
    (skill.uuid && s.uuid === skill.uuid)
    || (s.attribute === skill.attribute && s.name.toLowerCase() === name.toLowerCase())
  );
  if (duplicate) return null;
  return [...list, { id, uuid: skill.uuid ?? "", name, attribute: skill.attribute, level: "untrained", analysis: 0 }];
}

/**
 * Change one granted skill's fields (e.g. level or analysis).
 * @returns {object[]} The new list; unchanged entries are kept as-is.
 */
export function updateGrantedSkill(granted, id, changes) {
  return (granted ?? []).map((s) => (s.id === id ? { ...s, ...changes } : s));
}
