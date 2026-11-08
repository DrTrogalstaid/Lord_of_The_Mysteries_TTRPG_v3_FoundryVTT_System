import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * What Active Effects give (effects/effect-grants.mjs): granted actions, and skill raises with "at most" limits.
 * Foundry isn't loaded: effects are small stand-ins.
 */

const { applySkillRaises, collectSkillRaises, grantedActionUuids, isEffectActive } = await import("../module/effects/effect-grants.mjs");

const PISTOL = "Compendium.lotm.skills_compendium.Item.pistol";
const STEALTH = "Compendium.lotm.skills_compendium.Item.stealth";
const SMITE = "Compendium.lotm.action_compendium.Item.smite";

/** An effect stand-in. */
function makeEffect(id, { active = true, skillIncreases = [], actionList = [], name = `Effect ${id}` } = {}) {
  return { id, name, active, system: { skillIncreases, actionList } };
}


test("active: turned on and not suppressed", () => {
  assert.equal(isEffectActive(makeEffect("a")), true);
  assert.equal(isEffectActive(makeEffect("a", { active: false })), false);
  // No `active` getter: worked out from disabled / isSuppressed.
  assert.equal(isEffectActive({ disabled: false, isSuppressed: false }), true);
  assert.equal(isEffectActive({ disabled: true }), false);
  assert.equal(isEffectActive({ disabled: false, isSuppressed: true }), false);
  assert.equal(isEffectActive(null), false);
});


test("granted actions: blank entries are left out", () => {
  assert.deepEqual(grantedActionUuids(makeEffect("a", { actionList: [SMITE, "", null] })), [SMITE]);
  assert.deepEqual(grantedActionUuids(makeEffect("a")), []);
  assert.deepEqual(grantedActionUuids({}), []);
});


test("collecting raises: only active effects, only rows with a skill and a value", () => {
  const raises = collectSkillRaises([
    makeEffect("eagle", { name: "Eagle Eye", skillIncreases: [{ skillUuid: PISTOL, value: 1, maxLevel: "advanced" }] }),
    makeEffect("focus", { name: "Focus", skillIncreases: [{ skillUuid: PISTOL, value: 2, maxLevel: "" }, { skillUuid: STEALTH, value: 0 }] }),
    makeEffect("off", { active: false, skillIncreases: [{ skillUuid: STEALTH, value: 3 }] }),
    makeEffect("blank", { skillIncreases: [{ skillUuid: "", value: 1 }] }),
  ]);
  assert.deepEqual(Object.keys(raises), [PISTOL]);
  assert.deepEqual(raises[PISTOL], [
    { value: 1, maxLevel: "advanced", name: "Eagle Eye", effectId: "eagle" },
    { value: 2, maxLevel: "", name: "Focus", effectId: "focus" },
  ]);
  assert.deepEqual(collectSkillRaises(undefined), {});
});


test("a raise with no limit: +N levels, stopping at Grand Master", () => {
  assert.equal(applySkillRaises("untrained", [{ value: 1, maxLevel: "" }]), "trained");
  assert.equal(applySkillRaises("trained", [{ value: 2 }]), "advanced");
  assert.equal(applySkillRaises("lore", [{ value: 5 }]), "grandMaster");
  assert.equal(applySkillRaises("proficient", []), "proficient");
  assert.equal(applySkillRaises("proficient"), "proficient");
});


test("at most: the raise stops at its limit, and never lowers a skill already above it", () => {
  assert.equal(applySkillRaises("untrained", [{ value: 3, maxLevel: "trained" }]), "trained");
  assert.equal(applySkillRaises("trained", [{ value: 1, maxLevel: "advanced" }]), "proficient");
  assert.equal(applySkillRaises("proficient", [{ value: 1, maxLevel: "proficient" }]), "proficient");
  assert.equal(applySkillRaises("mastery", [{ value: 1, maxLevel: "proficient" }]), "mastery");
});


test("stacked raises: lowest limit first, so the order of the effects doesn't matter", () => {
  const low = { value: 1, maxLevel: "proficient" };
  const high = { value: 1, maxLevel: "mastery" };
  assert.equal(applySkillRaises("trained", [low, high]), "advanced");
  assert.equal(applySkillRaises("trained", [high, low]), "advanced");
  // Two raises with no limit add up.
  assert.equal(applySkillRaises("untrained", [{ value: 1 }, { value: 1 }]), "proficient");
  // The capped one goes first whatever order they're listed in, so both count: +1 to Proficient, then +2 to Mastery.
  assert.equal(applySkillRaises("trained", [{ value: 2 }, { value: 1, maxLevel: "proficient" }]), "mastery");
  // A capped raise on a skill already at its limit adds nothing; the uncapped one still does.
  assert.equal(applySkillRaises("advanced", [{ value: 1 }, { value: 1, maxLevel: "proficient" }]), "mastery");
});
