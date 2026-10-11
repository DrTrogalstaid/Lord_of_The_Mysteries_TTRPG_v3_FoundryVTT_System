import { test } from "node:test";
import assert from "node:assert/strict";
import { addGrantedSkill, buildGrantedSkillTab, recordSkillAnalysis, updateGrantedSkill } from "../module/helpers/granted-skills.mjs";

const divination = { uuid: "Compendium.lotm.skills_compendium.Item.div", name: "Divination Knowledge", attribute: "edu" };
const death = { uuid: "Compendium.lotm.skills_compendium.Item.death", name: "Death Knowledge", attribute: "edu" };

test("addGrantedSkill adds a dropdown skill as untrained with no analyses", () => {
    assert.deepEqual(addGrantedSkill([], divination, "a1"), [
        { id: "a1", uuid: divination.uuid, name: "Divination Knowledge", attribute: "edu", level: "untrained", analysis: 0 }
    ]);
});

test("addGrantedSkill adds a custom skill with a blank uuid and a trimmed name", () => {
    const [entry] = addGrantedSkill(undefined, { name: "  Reading Knowledge ", attribute: "edu" }, "c1");
    assert.equal(entry.uuid, "");
    assert.equal(entry.name, "Reading Knowledge");
});

test("addGrantedSkill rejects duplicates and blank names", () => {
    const list = addGrantedSkill([], divination, "a1");
    assert.equal(addGrantedSkill(list, divination, "a2"), null, "same compendium skill");
    assert.equal(addGrantedSkill(list, { name: "divination knowledge", attribute: "edu" }, "a3"), null, "same name, any case");
    assert.equal(addGrantedSkill(list, { name: "   ", attribute: "edu" }, "a4"), null, "blank name");
    assert.notEqual(addGrantedSkill(list, { name: "Divination Knowledge", attribute: "ins" }, "a5"), null,
        "same name under a different attribute is allowed");
});

test("updateGrantedSkill changes only the matching entry", () => {
    const list = [{ id: "a", level: "untrained", analysis: 0 }, { id: "b", level: "untrained", analysis: 2 }];
    assert.deepEqual(updateGrantedSkill(list, "b", { analysis: 3 }), [
        { id: "a", level: "untrained", analysis: 0 },
        { id: "b", level: "untrained", analysis: 3 }
    ]);
});

test("buildGrantedSkillTab rolls each skill with its own attribute and hides taken options", () => {
    const ability = {
        id: "ek", name: "Extraordinary Knowledge",
        grantedSkills: [
            { id: "1", uuid: divination.uuid, name: "Divination Knowledge", attribute: "edu", level: "trained", analysis: 4 },
            { id: "2", uuid: "", name: "Lock Lore", attribute: "agi", level: "untrained", analysis: 0 }
        ],
        options: [divination, death]
    };
    const tab = buildGrantedSkillTab(ability, { agi: 3, edu: 5 });

    assert.equal(tab.abilityName, "Extraordinary Knowledge");
    assert.deepEqual(tab.skills.map((s) => [s.name, s.modifier]), [["Divination Knowledge", 7], ["Lock Lore", -1]]);
    assert.deepEqual(tab.options.map((o) => o.name), ["Death Knowledge"]);
});

const stealth = { uuid: "Compendium.lotm.skills_compendium.Item.stealth", name: "Stealth" };

test("recordSkillAnalysis adds an Education copy with one analysis the first time", () => {
    assert.deepEqual(recordSkillAnalysis([], stealth, "s1"), [
        { id: "s1", uuid: stealth.uuid, name: "Stealth", attribute: "edu", level: "untrained", analysis: 1 }
    ]);
});

test("recordSkillAnalysis bumps the existing copy's counter afterwards", () => {
    const once = recordSkillAnalysis([], stealth, "s1");
    const twice = recordSkillAnalysis(once, stealth, "s2");
    assert.equal(twice.length, 1);
    assert.equal(twice[0].analysis, 2);
});

test("recordSkillAnalysis counts toward a same-named custom Education skill", () => {
    const custom = addGrantedSkill([], { name: "Stealth", attribute: "edu" }, "c1");
    const result = recordSkillAnalysis(custom, stealth, "s1");
    assert.equal(result.length, 1);
    assert.equal(result[0].analysis, 1);
});
