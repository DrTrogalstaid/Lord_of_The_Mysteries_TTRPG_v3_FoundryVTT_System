/**
 * An actor's skills, worked out in one place.
 *
 * Every actor has one record per skill in system.skills, keyed by the skill's key (helpers/skill-keys.mjs):
 *   system.skills.pistol = { uuid, level, analysis, bonus, study }
 * Only what's saved is in the actor's data. Each time the actor is prepared, data/actor/base-actor.mjs builds the full
 * list with buildSkillRecords below, works out the levels with computeSkillLevels, then the totals. Sheets, rolls,
 * Dodge defense and Education growth all read the result, so a skill's number is worked out once.
 *
 * Which skills an actor has (buildSkillRecords):
 *   - saved        the actor's own record: dropped on the sheet, level changed, studied or analyzed
 *   - legacy       saved in the old format (lists per attribute, before skill keys). Kept in system.legacySkills until
 *                  the world's skill data is migrated (helpers/skill-data.mjs), and read the same as saved ones.
 *   - standard     every player character has these (the skill's "Standard skill" box). NPCs don't.
 *   - granted      an owned Sequence raises or trains it (skill_increase, trainingBonus), unless hidden on an NPC
 *   - raised       an active effect raises its level (Skill Increases)
 *   - bonus target an active effect's change points at it (system.skills.<key>.bonus). Not listed on the sheets: a
 *                  bonus alone doesn't give the skill, but it's there for rolls that use the skill anyway.
 *
 * Plain data in / data out (no game / CONFIG), so it can be unit tested under Node (tests/skill-records.test.mjs).
 */

import { atLeastLevel, computeAssociatedLevels, levelIndex, raiseLevel } from "./skill-associations.mjs";
import { applySkillRaises } from "../effects/effect-grants.mjs";
import { isSkillUuid, legacySkillKey } from "./skill-keys.mjs";

/** A skill's saved fields when nothing is saved yet. */
export const EMPTY_SKILL_RECORD = Object.freeze({ uuid: "", level: "untrained", analysis: 0, bonus: 0 });


/**
 * Old-format entries (system.legacySkills) merged by skill key. The same skill saved twice (the compendium's Pistol
 * and a world copy, on different lists) becomes one: the higher level, the higher analysis count.
 * @param {{skill: string, level?: string, analysis?: number, study?: object}[]} legacy
 * @param {(uuid: string) => string} keyOf   A skill UUID -> its key, or "" when the skill can't be found.
 * @returns {Map<string, {uuid: string, level: string, analysis: number, study?: object, isMissing: boolean, count: number}>}
 */
export function mergeLegacySkills(legacy, keyOf) {
  const merged = new Map();
  for (const entry of legacy ?? []) {
    if (!entry?.skill) continue;
    const found = keyOf(entry.skill);
    const key = found || legacySkillKey(entry.skill);
    const level = entry.level ?? "untrained";
    const analysis = Number(entry.analysis) || 0;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { uuid: entry.skill, level, analysis, study: entry.study, isMissing: !found, count: 1 });
      continue;
    }
    if (levelIndex(level) > levelIndex(current.level)) {
      current.level = level;
      current.study = entry.study ?? current.study;
    }
    current.analysis = Math.max(current.analysis, analysis);
    current.count += 1;
  }
  return merged;
}


/**
 * Every skill the actor has, before levels and totals: which ones, and why.
 *
 * @param {object} sources
 * @param {Record<string, object>} [sources.saved]       system.skills as saved: key -> { uuid, level, analysis, study }
 * @param {object[]} [sources.legacy]                    system.legacySkills (old format, not migrated yet)
 * @param {string[]} [sources.standard]                  Keys of the standard skills (player characters only).
 * @param {Map<string, string[]>} [sources.granted]      Key -> names of the Sequences that raise or train it.
 * @param {Map<string, string[]>} [sources.raised]       Key -> names of the active effects that raise its level.
 * @param {Iterable<string>} [sources.bonusTargets]      Keys an active effect's bonus change points at.
 * @param {(uuid: string) => string} sources.keyOf       A skill UUID -> its key ("" when it can't be found).
 * @returns {Record<string, object>}  Key -> record:
 *   { key, uuid, level, analysis, study, bonus: 0,
 *     isSaved, isLegacy, isMissingItem, isStandard, grantedBy: string[], raisedBy: string[], isBonusTarget }
 *   level is the saved level ("untrained" when there's none). isMissingItem: saved under a UUID that can't be found.
 */
export function buildSkillRecords({ saved = {}, legacy = [], standard = [], granted = new Map(), raised = new Map(), bonusTargets = [], keyOf }) {
  const records = {};
  const make = (key, data = {}) => {
    records[key] ??= {
      key,
      uuid: "",
      level: "untrained",
      analysis: 0,
      study: undefined,
      bonus: 0,
      isSaved: false,
      isLegacy: false,
      isMissingItem: false,
      isStandard: false,
      grantedBy: [],
      raisedBy: [],
      isBonusTarget: false,
    };
    return Object.assign(records[key], data);
  };

  for (const [key, record] of Object.entries(saved ?? {})) {
    if (!record) continue;
    make(key, {
      uuid: record.uuid ?? "",
      level: record.level ?? "untrained",
      analysis: Number(record.analysis) || 0,
      study: record.study,
      isSaved: true,
    });
  }

  // Old-format entries fill in skills that have no new record yet. A new record always wins: it was written after
  // (helpers/skill-data.mjs copies the old entry's values into it when it's made).
  for (const [key, entry] of mergeLegacySkills(legacy, keyOf)) {
    if (records[key]?.isSaved) continue;
    make(key, {
      uuid: entry.uuid,
      level: entry.level,
      analysis: entry.analysis,
      study: entry.study,
      isSaved: true,
      isLegacy: true,
      isMissingItem: entry.isMissing,
    });
  }

  for (const key of standard ?? []) make(key, { isStandard: true });
  for (const [key, names] of granted ?? []) make(key).grantedBy.push(...names);
  for (const [key, names] of raised ?? []) make(key).raisedBy.push(...names);
  for (const key of bonusTargets ?? []) make(key, { isBonusTarget: true });

  return records;
}


/**
 * The levels of every skill:
 *   ownLevel        the player's pick, at least the skill's starting level (Dodge: Trained). What the dropdown shows.
 *   learnLevel      + the Sequences' raises, then related skills. What studying and learning by doing go on from:
 *                   active effects aren't in it, so a temporary buff is never saved as a learned level.
 *   effectiveLevel  + the Sequences' raises, + the active effects' raises (each up to its "at most"), then related
 *                   skills. The level the skill is rolled at.
 * plus why it's higher than ownLevel, for the sheets' hover text:
 *   sequenceSteps     levels the Sequences add
 *   effectRaises      the effects' raises ([{ value, maxLevel, name, effectId }])
 *   boostedByEffects  true when the effects changed the level
 *   associated        { raised, sources: [{ uuid (= key), name, level, category }] } from computeAssociatedLevels
 *
 * @param {Record<string, object>} records   From buildSkillRecords (or any { key: { level } } object).
 * @param {object} context
 * @param {(key: string) => {name?: string, categories?: object[]}|null} context.infoOf   The skill's name and categories.
 * @param {Record<string, string>} [context.minimums]       Key -> starting level (CONFIG defaultSkillLevels).
 * @param {Record<string, number>} [context.sequenceSteps]  Key -> levels the actor's Sequences add.
 * @param {Record<string, object[]>} [context.effectRaises] Key -> the active effects' raises.
 * @returns {Map<string, object>}  Key -> the fields above. The records aren't changed.
 */
export function computeSkillLevels(records, { infoOf, minimums = {}, sequenceSteps = {}, effectRaises = {} }) {
  const keys = Object.keys(records ?? {});
  const base = keys.map((key) => {
    const info = infoOf?.(key) ?? null;
    const own = atLeastLevel(records[key]?.level ?? "untrained", minimums[key]);
    const steps = sequenceSteps[key] ?? 0;
    const learned = raiseLevel(own, steps);
    const raises = effectRaises[key] ?? [];
    const boosted = applySkillRaises(learned, raises);
    return { key, name: info?.name ?? key, categories: info?.categories ?? [], own, steps, learned, raises, boosted };
  });

  // Related skills raise each other from the levels above: once without the effects (what's learned), once with them.
  const learnedResults = computeAssociatedLevels(base.map((row) => ({ uuid: row.key, name: row.name, level: row.learned, categories: row.categories })));
  const boostedResults = computeAssociatedLevels(base.map((row) => ({ uuid: row.key, name: row.name, level: row.boosted, categories: row.categories })));

  const result = new Map();
  for (const row of base) {
    const associated = boostedResults.get(row.key) ?? { level: row.boosted, raised: false, sources: [] };
    result.set(row.key, {
      ownLevel: row.own,
      learnLevel: learnedResults.get(row.key)?.level ?? row.learned,
      effectiveLevel: associated.level,
      sequenceSteps: row.steps,
      effectRaises: row.raises,
      boostedByEffects: row.boosted !== row.learned,
      associated,
    });
  }
  return result;
}


/**
 * A skill's roll total before anything is added in the roll window:
 *   attribute total + level bonus + the skill Item's own modifier + the effects' bonuses.
 * @param {{attributeTotal?: number, levelBonus?: number, flatModifier?: number, bonus?: number}} parts
 * @returns {number}
 */
export function skillTotal({ attributeTotal = 0, levelBonus = 0, flatModifier = 0, bonus = 0 }) {
  return (Number(attributeTotal) || 0) + (Number(levelBonus) || 0) + (Number(flatModifier) || 0) + (Number(bonus) || 0);
}


/* -------------------------------------------- */
/*  Migration                                    */
/* -------------------------------------------- */

/**
 * Move an actor's old-format skill data to skill keys. Nothing is thrown away:
 *   - every old entry (system.legacySkills) gets a record under its skill's key, with its level, analysis count and
 *     study fields. A skill whose Item can't be found any more is kept under "missing_<id>" with its old UUID.
 *   - the same skill saved twice (on two lists) becomes one record: the higher level, the higher analysis count.
 *   - a new-format record that already exists is kept as it is (it was saved later, from the old entry's values).
 *   - learning entries (system.learning) point at the skill's key instead of its UUID. Two entries for the same skill
 *     are merged: their gained levels kept, the bigger meters kept.
 * Then it checks its own work (problems): every old entry's level and analyses must be in the result.
 *
 * @param {{skills?: Record<string, object>, legacySkills?: object[], learning?: object[]}} data   The actor's saved
 *   system.skills, system.legacySkills and system.learning.
 * @param {(uuid: string) => string} keyOf   A skill UUID -> its key, or "" when the skill can't be found.
 * @returns {{
 *   skills: Record<string, object>, learning: object[], changed: boolean,
 *   report: {moved: number, merged: number, kept: number, missing: string[], learningMoved: number, learningMerged: number},
 *   problems: string[]
 * }}
 */
export function migrateSkillData({ skills = {}, legacySkills = [], learning = [] }, keyOf) {
  const out = {};
  for (const [key, record] of Object.entries(skills ?? {})) out[key] = { ...record };
  const report = { moved: 0, merged: 0, kept: 0, missing: [], learningMoved: 0, learningMerged: 0 };

  // 1. Old skill entries.
  const merged = mergeLegacySkills(legacySkills, keyOf);
  for (const [key, entry] of merged) {
    if (entry.count > 1) report.merged += entry.count - 1;
    if (entry.isMissing) report.missing.push(entry.uuid);
    if (out[key]) {
      report.kept += 1;
      continue;
    }
    out[key] = {
      uuid: entry.uuid,
      level: entry.level,
      analysis: entry.analysis,
      bonus: 0,
      ...(entry.study ? { study: entry.study } : {}),
    };
    report.moved += 1;
  }

  // 2. Learning entries: UUID -> key.
  const learningByKey = new Map();
  const learningOut = [];
  for (const entry of learning ?? []) {
    if (!entry?.skill) continue;
    let key = entry.skill;
    if (isSkillUuid(entry.skill)) {
      key = keyOf(entry.skill) || legacySkillKey(entry.skill);
      report.learningMoved += 1;
    }
    const existing = learningByKey.get(key);
    if (!existing) {
      const copy = { ...entry, skill: key, gained: [...(entry.gained ?? [])] };
      learningByKey.set(key, copy);
      learningOut.push(copy);
      continue;
    }
    // The same skill twice: keep every gained level, and the bigger of each meter (with the level it started from).
    report.learningMerged += 1;
    existing.gained.push(...(entry.gained ?? []));
    if ((Number(entry.study) || 0) > (Number(existing.study) || 0)) {
      existing.study = entry.study;
      existing.studyFrom = entry.studyFrom;
    }
    if ((Number(entry.successes) || 0) > (Number(existing.successes) || 0)) {
      existing.successes = entry.successes;
      existing.successesFrom = entry.successesFrom;
    }
  }

  // 3. Check: every old entry's level and analyses made it across (unless a newer record was already there).
  const problems = [];
  for (const entry of legacySkills ?? []) {
    if (!entry?.skill) continue;
    const key = keyOf(entry.skill) || legacySkillKey(entry.skill);
    const record = out[key];
    if (!record) {
      problems.push(`${entry.skill}: no record under "${key}"`);
      continue;
    }
    if (skills?.[key]) continue;   // a newer record was kept on purpose
    if (levelIndex(record.level) < levelIndex(entry.level ?? "untrained")) {
      problems.push(`${entry.skill}: level ${entry.level} became ${record.level}`);
    }
    if ((Number(record.analysis) || 0) < (Number(entry.analysis) || 0)) {
      problems.push(`${entry.skill}: ${entry.analysis} analyses became ${record.analysis}`);
    }
  }
  const gainedBefore = (learning ?? []).reduce((sum, entry) => sum + (entry?.skill ? (entry.gained?.length ?? 0) : 0), 0);
  const gainedAfter = learningOut.reduce((sum, entry) => sum + entry.gained.length, 0);
  if (gainedAfter !== gainedBefore) problems.push(`learning: ${gainedBefore} gained levels became ${gainedAfter}`);

  const changed = (legacySkills ?? []).length > 0 || report.learningMoved > 0 || report.learningMerged > 0;
  return { skills: out, learning: learningOut, changed, report, problems };
}

