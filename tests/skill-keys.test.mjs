import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * Skill keys and the skill registry's lookup tables (helpers/skill-keys.mjs).
 */

const {
  buildSkillRegistry, isSkillKey, isSkillUuid, legacySkillKey, skillKeyFromName, skillKeyOf,
} = await import("../module/helpers/skill-keys.mjs");

const PACK = "Compendium.lotm.skills_compendium.Item";


test("keys from names: camelCase, no spaces, accents or apostrophes", () => {
  assert.equal(skillKeyFromName("Pistol"), "pistol");
  assert.equal(skillKeyFromName("Slight of Hand"), "slightOfHand");
  assert.equal(skillKeyFromName("Knowledge of the Dead"), "knowledgeOfTheDead");
  assert.equal(skillKeyFromName("Ancient Feysac"), "ancientFeysac");
  assert.equal(skillKeyFromName("Hunter's Eye"), "huntersEye");
  assert.equal(skillKeyFromName("Café Talk"), "cafeTalk");
  assert.equal(skillKeyFromName("  Lip   Reading "), "lipReading");
  assert.equal(skillKeyFromName("7th Sense"), "skill7thSense");
  assert.equal(skillKeyFromName("!!!"), "");
  assert.equal(skillKeyFromName(undefined), "");
});


test("a key never has a dot, so it works in an Active Effect change key", () => {
  for (const name of ["Dr. Who's Lore", "A.B.C", "Mech. Maintenance"]) {
    const key = skillKeyFromName(name);
    assert.equal(key.includes("."), false, name);
    assert.equal(isSkillKey(key), true, name);
  }
});


test("valid keys and UUIDs are told apart", () => {
  assert.equal(isSkillKey("pistol"), true);
  assert.equal(isSkillKey("knowledgeOfTheDead"), true);
  assert.equal(isSkillKey("missing_abc123"), true);
  assert.equal(isSkillKey(`${PACK}.abc`), false);
  assert.equal(isSkillKey("Lip Reading"), false);
  assert.equal(isSkillKey("1pistol"), false);
  assert.equal(isSkillKey(""), false);
  assert.equal(isSkillUuid(`${PACK}.abc`), true);
  assert.equal(isSkillUuid("pistol"), false);
});


test("a skill's key: its Identifier first, otherwise its name", () => {
  assert.equal(skillKeyOf({ identifier: "gunplay", name: "Pistol" }), "gunplay");
  assert.equal(skillKeyOf({ identifier: "", name: "Pistol" }), "pistol");
  assert.equal(skillKeyOf({ identifier: "   ", name: "Pistol" }), "pistol");
  // An Identifier typed with spaces is cleaned up the same way a name is.
  assert.equal(skillKeyOf({ identifier: "Knowledge of the Dead", name: "Whatever" }), "knowledgeOfTheDead");
});


test("a saved skill whose Item is gone gets a key from its old UUID", () => {
  assert.equal(legacySkillKey(`${PACK}.abc123`), "missing_abc123");
  assert.equal(legacySkillKey("Item.x-y_z"), "missing_xyz");
  assert.equal(legacySkillKey(""), "missing_unknown");
});


/* -------------------------------------------- */
/*  Registry                                     */
/* -------------------------------------------- */

const entry = (id, name, system = {}, extra = {}) => ({ uuid: `${PACK}.${id}`, name, img: `${id}.webp`, system, folderName: "", isSystemPack: true, aliases: [], ...extra });

test("registry: one skill per key, with what actors need", () => {
  const registry = buildSkillRegistry([
    entry("p1", "Pistol", { skill_attribute: "agi", modifier: 1, categories: [{ category: "firearms", mode: "both" }] }, { folderName: "Agility" }),
  ], { standardFolders: ["Agility"] });
  assert.deepEqual(registry.byKey.get("pistol"), {
    key: "pistol", uuid: `${PACK}.p1`, name: "Pistol", img: "p1.webp", attribute: "agi",
    categories: [{ category: "firearms", mode: "both" }], flatModifier: 1, isStandard: true,
  });
  assert.equal(registry.keyByUuid.get(`${PACK}.p1`), "pistol");
  assert.equal(registry.keyByName.get("pistol"), "pistol");
});


test("registry: a world copy is the same skill, and the compendium's one is kept", () => {
  const registry = buildSkillRegistry([
    entry("p1", "Pistol", { skill_attribute: "agi" }),
    { uuid: "Item.world1", name: "Pistol", system: { skill_attribute: "agi" }, aliases: [`${PACK}.p1`] },
  ]);
  assert.equal(registry.byKey.size, 1);
  assert.equal(registry.byKey.get("pistol").uuid, `${PACK}.p1`);
  assert.equal(registry.keyByUuid.get("Item.world1"), "pistol");
  assert.deepEqual(registry.duplicates, []);
});


test("registry: two different skills with one key are reported", () => {
  const registry = buildSkillRegistry([
    entry("p1", "Pistol", { skill_attribute: "agi" }),
    { uuid: "Item.home", name: "Pistol", system: { skill_attribute: "edu" } },
  ]);
  assert.deepEqual(registry.duplicates, [{ key: "pistol", kept: `${PACK}.p1`, also: "Item.home" }]);
});


test("registry: standard skills -- the box when it's saved, the attribute folders when it isn't", () => {
  const registry = buildSkillRegistry([
    entry("a", "Climbing", {}, { folderName: "Strength" }),                                  // folder rule: standard
    entry("b", "Feysac", {}, { folderName: "Languages" }),                                   // not an attribute tab
    entry("c", "Death Knowledge", {}, { folderName: "Extraordinary Knowledge" }),
    entry("d", "Knowledge of the Dead", {}, { folderName: "" }),                             // no folder
    entry("e", "Swim", { isStandard: false }, { folderName: "Agility" }),                   // box saved: off
    { uuid: "Item.w", name: "Homebrew", system: { isStandard: true } },                       // world skill, box on
    { uuid: "Item.v", name: "Climbing Too", system: { isStandard: null }, folderName: "Strength" },   // world folder doesn't count
  ], { standardFolders: ["Strength", "Agility"] });
  const standard = (key) => registry.byKey.get(key).isStandard;
  assert.equal(standard("climbing"), true);
  assert.equal(standard("feysac"), false);
  assert.equal(standard("deathKnowledge"), false);
  assert.equal(standard("knowledgeOfTheDead"), false);
  assert.equal(standard("swim"), false);
  assert.equal(standard("homebrew"), true);
  assert.equal(standard("climbingToo"), false);
});


test("registry: the old single category is read too", () => {
  const registry = buildSkillRegistry([entry("p", "Pistol", { category: "firearms" })]);
  assert.deepEqual(registry.byKey.get("pistol").categories, [{ category: "firearms", mode: "both" }]);
});
