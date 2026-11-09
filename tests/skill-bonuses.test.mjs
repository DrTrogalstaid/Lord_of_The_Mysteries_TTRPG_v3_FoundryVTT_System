import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * Skill roll bonuses from Active Effects (effects/skill-bonuses.mjs). Foundry isn't loaded: effects are small stand-ins.
 */

const {
  CATEGORY_BONUS_PATTERN, SKILL_BONUS_PATTERN, categoryBonusChangeKey, changeAmount, collectSkillBonuses,
  skillBonusChangeKey, skillBonusRows, skillBonusTotal,
} = await import("../module/effects/skill-bonuses.mjs");

/** An effect stand-in with v14-style changes. */
function makeEffect(id, changes, { active = true, name = `Effect ${id}` } = {}) {
  return { id, name, img: `${id}.svg`, active, system: { changes } };
}
const add = (key, value) => ({ key, type: "add", value, phase: "initial", priority: null });


test("change keys", () => {
  assert.equal(skillBonusChangeKey("pistol"), "system.skills.pistol.bonus");
  assert.equal(categoryBonusChangeKey("firearms"), "system.skillCategoryBonuses.firearms");
  assert.equal("system.skills.knowledgeOfTheDead.bonus".match(SKILL_BONUS_PATTERN)[1], "knowledgeOfTheDead");
  assert.equal("system.skillCategoryBonuses.fighting".match(CATEGORY_BONUS_PATTERN)[1], "fighting");
  assert.equal("system.skills.pistol.level".match(SKILL_BONUS_PATTERN), null);
  assert.equal("system.attributes.agi.checkBonus".match(CATEGORY_BONUS_PATTERN), null);
});


test("change amounts: Add, Subtract; nothing for Override", () => {
  assert.equal(changeAmount({ type: "add", value: "2" }), 2);
  assert.equal(changeAmount({ type: "subtract", value: 1 }), -1);
  assert.equal(changeAmount({ type: "override", value: 5 }), null);
  assert.equal(changeAmount({ type: "add", value: "abc" }), null);
});


test("collecting: only active effects, skill and category changes, by effect", () => {
  const collected = collectSkillBonuses([
    makeEffect("focus", [add("system.skills.pistol.bonus", 2), add("system.attributes.agi.checkBonus", 1)], { name: "Focus" }),
    makeEffect("drill", [add("system.skillCategoryBonuses.firearms", 1)], { name: "Drill" }),
    makeEffect("off", [add("system.skills.pistol.bonus", 9)], { active: false }),
    makeEffect("set", [{ key: "system.skills.rifle.bonus", type: "override", value: 4 }]),
  ]);
  assert.deepEqual(collected.skills, { pistol: [{ effectId: "focus", name: "Focus", img: "focus.svg", value: 2 }] });
  assert.deepEqual(collected.categories, { firearms: [{ effectId: "drill", name: "Drill", img: "drill.svg", value: 1 }] });
  // Override changes don't add a set amount, but their skill still needs a place to go.
  assert.deepEqual([...collected.targets].sort(), ["pistol", "rifle"]);
});


test("rows: one per effect for the skill, and per effect for its categories", () => {
  const collected = collectSkillBonuses([
    makeEffect("focus", [add("system.skills.pistol.bonus", 2)], { name: "Focus" }),
    makeEffect("drill", [add("system.skillCategoryBonuses.firearms", 1)], { name: "Drill" }),
  ]);
  const rows = skillBonusRows({ key: "pistol", categories: ["firearms"], collected, skillTotal: 2, categoryTotals: { firearms: 1 } });
  assert.deepEqual(rows.map((row) => [row.name, row.value, row.kind, row.category]), [
    ["Focus", 2, "skill", null],
    ["Drill", 1, "category", "firearms"],
  ]);
  assert.equal(skillBonusTotal(rows), 3);
});


test("rows: one effect covering two of a skill's categories counts once (the bigger one)", () => {
  const collected = collectSkillBonuses([
    makeEffect("insight", [add("system.skillCategoryBonuses.social", 1), add("system.skillCategoryBonuses.reconnaissance", 2)], { name: "Insight" }),
    makeEffect("charm", [add("system.skillCategoryBonuses.social", 1)], { name: "Charm" }),
  ]);
  // Psychology is in both Social and Reconnaissance.
  const rows = skillBonusRows({
    key: "psychology", categories: ["social", "reconnaissance"], collected,
    categoryTotals: { social: 2, reconnaissance: 2 },
  });
  assert.deepEqual(rows.map((row) => [row.name, row.value]), [["Insight", 2], ["Charm", 1]]);
  assert.equal(skillBonusTotal(rows), 3);
});


test("rows: an Override (or anything else that isn't an effect's Add) shows as one more row", () => {
  const collected = collectSkillBonuses([
    makeEffect("focus", [add("system.skills.pistol.bonus", 2)], { name: "Focus" }),
    makeEffect("set", [{ key: "system.skills.pistol.bonus", type: "override", value: 5 }], { name: "Set" }),
  ]);
  // Foundry applied both: the total is 5 (Override after Add). The rows still add up to it.
  const rows = skillBonusRows({ key: "pistol", collected, skillTotal: 5 });
  assert.deepEqual(rows.map((row) => [row.name, row.value, row.rest]), [["Focus", 2, false], ["", 3, true]]);
  assert.equal(skillBonusTotal(rows), 5);
});


test("rows: nothing when there are no bonuses", () => {
  const collected = collectSkillBonuses([]);
  assert.deepEqual(skillBonusRows({ key: "pistol", categories: ["firearms"], collected, skillTotal: 0, categoryTotals: {} }), []);
});


test("rows: Subtract is a penalty", () => {
  const collected = collectSkillBonuses([
    makeEffect("shaky", [{ key: "system.skills.pistol.bonus", type: "subtract", value: 2 }], { name: "Shaky Hands" }),
  ]);
  const rows = skillBonusRows({ key: "pistol", collected, skillTotal: -2 });
  assert.deepEqual(rows.map((row) => [row.name, row.value]), [["Shaky Hands", -2]]);
});
