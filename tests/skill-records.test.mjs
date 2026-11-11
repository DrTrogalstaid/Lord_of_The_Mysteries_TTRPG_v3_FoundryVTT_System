import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * An actor's skills, worked out in one place (helpers/skill-records.mjs): which skills it has, their levels, and
 * moving old-format skill data to skill keys without losing anything.
 */

const { buildSkillRecords, computeSkillLevels, mergeLegacySkills, migrateSkillData, skillTotal } =
  await import("../module/helpers/skill-records.mjs");

const PACK = "Compendium.lotm.skills_compendium.Item";
const UUIDS = {
  [`${PACK}.pistol`]: "pistol",
  "Item.worldPistol": "pistol",          // a world copy of Pistol
  [`${PACK}.history`]: "history",
  [`${PACK}.sword`]: "sword",
  [`${PACK}.melee`]: "melee",
  [`${PACK}.dodge`]: "dodge",
  [`${PACK}.kotd`]: "knowledgeOfTheDead",
};
const keyOf = (uuid) => UUIDS[uuid] ?? "";

const INFO = {
  sword: { name: "Sword", categories: [{ category: "fighting", mode: "both" }] },
  melee: { name: "Melee", categories: [{ category: "fighting", mode: "both" }] },
  pistol: { name: "Pistol", categories: [{ category: "firearms", mode: "both" }] },
};
const infoOf = (key) => INFO[key] ?? { name: key, categories: [] };


/* -------------------------------------------- */
/*  Which skills                                 */
/* -------------------------------------------- */

test("records: saved, standard, granted by a Sequence, raised by an effect, bonus targets", () => {
  const records = buildSkillRecords({
    saved: { pistol: { uuid: `${PACK}.pistol`, level: "trained", analysis: 0 } },
    standard: ["pistol", "history"],
    granted: new Map([["knowledgeOfTheDead", ["Corpse Collector"]]]),
    raised: new Map([["sword", ["Blade Dance"]]]),
    bonusTargets: ["melee"],
    keyOf,
  });
  assert.deepEqual(Object.keys(records).sort(), ["history", "knowledgeOfTheDead", "melee", "pistol", "sword"]);
  assert.equal(records.pistol.isSaved, true);
  assert.equal(records.pistol.isStandard, true);
  assert.equal(records.pistol.level, "trained");
  assert.equal(records.history.isSaved, false);
  assert.equal(records.history.level, "untrained");
  assert.deepEqual(records.knowledgeOfTheDead.grantedBy, ["Corpse Collector"]);
  assert.equal(records.knowledgeOfTheDead.isStandard, false);
  assert.deepEqual(records.sword.raisedBy, ["Blade Dance"]);
  assert.equal(records.melee.isBonusTarget, true);
  for (const record of Object.values(records)) assert.equal(record.bonus, 0);
});


test("records: an NPC (no standard skills) only has what it was given", () => {
  const records = buildSkillRecords({ saved: { sword: { level: "advanced" } }, keyOf });
  assert.deepEqual(Object.keys(records), ["sword"]);
});


test("records: old-format entries are read until they're migrated, and a new record wins", () => {
  const records = buildSkillRecords({
    saved: { pistol: { uuid: `${PACK}.pistol`, level: "proficient", analysis: 0 } },
    legacy: [
      { list: "agi", skill: `${PACK}.pistol`, level: "trained", analysis: 0 },   // older than the record above
      { list: "edu", skill: `${PACK}.history`, level: "trained", analysis: 3 },
      { list: "edu", skill: `${PACK}.gone`, level: "mastery", analysis: 1 },     // its Item was deleted
    ],
    keyOf,
  });
  assert.equal(records.pistol.level, "proficient");
  assert.equal(records.pistol.isLegacy, false);
  assert.equal(records.history.level, "trained");
  assert.equal(records.history.analysis, 3);
  assert.equal(records.history.isLegacy, true);
  assert.equal(records.history.isSaved, true);
  assert.equal(records.missing_gone.isMissingItem, true);
  assert.equal(records.missing_gone.level, "mastery");
  assert.equal(records.missing_gone.uuid, `${PACK}.gone`);
});


test("old entries for the same skill (compendium and world copy) merge: higher level, more analyses", () => {
  const merged = mergeLegacySkills([
    { skill: `${PACK}.pistol`, level: "trained", analysis: 2 },
    { skill: "Item.worldPistol", level: "advanced", analysis: 1 },
  ], keyOf);
  assert.equal(merged.size, 1);
  const pistol = merged.get("pistol");
  assert.equal(pistol.level, "advanced");
  assert.equal(pistol.analysis, 2);
  assert.equal(pistol.count, 2);
});


/* -------------------------------------------- */
/*  Levels                                       */
/* -------------------------------------------- */

test("levels: starting level, Sequence raises, effect raises, related skills", () => {
  const records = buildSkillRecords({
    saved: { sword: { level: "proficient" }, melee: { level: "untrained" } },
    standard: ["dodge"],
    keyOf,
  });
  const levels = computeSkillLevels(records, {
    infoOf,
    minimums: { dodge: "trained" },
    sequenceSteps: { sword: 1 },                                    // Sequence: Proficient -> Advanced
    effectRaises: { sword: [{ value: 1, maxLevel: "", name: "Blade Dance" }] },   // effect: -> Mastery
  });

  assert.equal(levels.get("dodge").ownLevel, "trained");
  assert.equal(levels.get("dodge").effectiveLevel, "trained");

  const sword = levels.get("sword");
  assert.equal(sword.ownLevel, "proficient");
  assert.equal(sword.learnLevel, "advanced");          // the Sequence counts, the effect doesn't
  assert.equal(sword.effectiveLevel, "mastery");
  assert.equal(sword.boostedByEffects, true);
  assert.equal(sword.sequenceSteps, 1);

  // Sword is Advanced without effects (Melee +1) and Mastery with them (Melee +2, capped at Proficient).
  const melee = levels.get("melee");
  assert.equal(melee.learnLevel, "trained");
  assert.equal(melee.effectiveLevel, "proficient");
  assert.equal(melee.associated.raised, true);
  assert.equal(melee.associated.sources[0].uuid, "sword");
});


test("levels don't change the records", () => {
  const records = buildSkillRecords({ saved: { sword: { level: "advanced" } }, keyOf });
  computeSkillLevels(records, { infoOf, sequenceSteps: { sword: 2 } });
  assert.equal(records.sword.level, "advanced");
  assert.equal(records.sword.effectiveLevel, undefined);
});


test("total: attribute + level bonus + own modifier + effect bonuses", () => {
  assert.equal(skillTotal({ attributeTotal: 5, levelBonus: 2, flatModifier: 1, bonus: 3 }), 11);
  assert.equal(skillTotal({ attributeTotal: 4, levelBonus: -4 }), 0);
});


/* -------------------------------------------- */
/*  Migration                                    */
/* -------------------------------------------- */

test("migration: every old entry gets a record with its level, analyses and study fields", () => {
  const study = { days: 3, method: "self", progress: 0.5, studiedLevels: 1 };
  const result = migrateSkillData({
    skills: {},
    legacySkills: [
      { list: "agi", skill: `${PACK}.pistol`, level: "trained", analysis: 0 },
      { list: "edu", skill: `${PACK}.history`, level: "proficient", analysis: 4, study },
      { list: "edu", skill: `${PACK}.gone`, level: "mastery", analysis: 2 },
    ],
    learning: [],
  }, keyOf);

  assert.deepEqual(result.problems, []);
  assert.equal(result.changed, true);
  assert.deepEqual(result.skills.pistol, { uuid: `${PACK}.pistol`, level: "trained", analysis: 0, bonus: 0 });
  assert.deepEqual(result.skills.history, { uuid: `${PACK}.history`, level: "proficient", analysis: 4, bonus: 0, study });
  assert.equal(result.skills.missing_gone.level, "mastery");
  assert.equal(result.skills.missing_gone.analysis, 2);
  assert.deepEqual(result.report.missing, [`${PACK}.gone`]);
  assert.equal(result.report.moved, 3);
});


test("migration: a newer record is kept, and the same skill twice becomes one", () => {
  const result = migrateSkillData({
    skills: { pistol: { uuid: "", level: "advanced", analysis: 0, bonus: 0 } },
    legacySkills: [
      { list: "agi", skill: `${PACK}.pistol`, level: "trained", analysis: 0 },
      { list: "edu", skill: `${PACK}.history`, level: "trained", analysis: 1 },
      { list: "edu", skill: "Item.worldHistory", level: "untrained", analysis: 5 },
    ],
  }, (uuid) => (uuid === "Item.worldHistory" ? "history" : keyOf(uuid)));

  assert.deepEqual(result.problems, []);
  assert.equal(result.skills.pistol.level, "advanced");
  assert.equal(result.skills.history.level, "trained");
  assert.equal(result.skills.history.analysis, 5);
  assert.equal(result.report.kept, 1);
  assert.equal(result.report.merged, 1);
});


test("migration: learning entries move to keys, and two for one skill are merged without losing a level", () => {
  const result = migrateSkillData({
    legacySkills: [],
    learning: [
      { skill: `${PACK}.pistol`, study: 0.25, studyFrom: "trained", successes: 1, successesFrom: "trained",
        gained: [{ from: "untrained", to: "trained", source: "study", detail: "" }] },
      { skill: "Item.worldPistol", study: 0.5, studyFrom: "trained", successes: 0, successesFrom: "",
        gained: [{ from: "trained", to: "proficient", source: "ability", detail: "Thief" }] },
      { skill: "history", study: 0.1, studyFrom: "untrained", successes: 0, successesFrom: "", gained: [] },
    ],
  }, keyOf);

  assert.deepEqual(result.problems, []);
  assert.equal(result.learning.length, 2);
  const pistol = result.learning.find((entry) => entry.skill === "pistol");
  assert.equal(pistol.study, 0.5);
  assert.equal(pistol.successes, 1);
  assert.equal(pistol.gained.length, 2);
  assert.equal(result.learning.find((entry) => entry.skill === "history").study, 0.1);
  assert.equal(result.report.learningMoved, 2);
  assert.equal(result.report.learningMerged, 1);
});


test("migration: nothing to do for data that's already in the new format", () => {
  const result = migrateSkillData({ skills: { pistol: { level: "trained" } }, legacySkills: [], learning: [{ skill: "pistol", gained: [] }] }, keyOf);
  assert.equal(result.changed, false);
  assert.deepEqual(result.problems, []);
});


test("migration: two different skills that share a key keep the higher level (nothing ends up lower)", () => {
  const sameKey = () => "pistol";
  const result = migrateSkillData({
    legacySkills: [
      { skill: `${PACK}.a`, level: "mastery", analysis: 0 },
      { skill: `${PACK}.b`, level: "untrained", analysis: 3 },
    ],
  }, sameKey);
  assert.deepEqual(result.problems, []);
  assert.equal(result.skills.pistol.level, "mastery");
  assert.equal(result.skills.pistol.analysis, 3);
});


test("migration: entries without a skill are skipped", () => {
  const result = migrateSkillData({ legacySkills: [{ skill: "", level: "trained" }, null], learning: [{ skill: "" }] }, keyOf);
  assert.deepEqual(result.skills, {});
  assert.deepEqual(result.learning, []);
  assert.deepEqual(result.problems, []);
});
