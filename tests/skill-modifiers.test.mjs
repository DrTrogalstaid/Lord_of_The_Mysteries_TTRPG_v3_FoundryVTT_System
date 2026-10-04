import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSkillModifier } from "../module/helpers/skill-modifiers.mjs";

// The bonus table is: untrained -4, trained +2, proficient +4, advanced +5,
// mastery +6, lore +7, grandMaster +8 -- applied on top of whatever
// attributeTotal is passed in. These pin that table down so it can't drift
// silently (this exact table also drives the character sheet's displayed
// skill modifier via PlayerCharacterSheet._calculateSkillModifier, which now
// just wraps this function).
test("calculateSkillModifier applies the documented bonus per level", () => {
    assert.equal(calculateSkillModifier("untrained", 5), 1);
    assert.equal(calculateSkillModifier("trained", 5), 7);
    assert.equal(calculateSkillModifier("proficient", 5), 9);
    assert.equal(calculateSkillModifier("advanced", 5), 10);
    assert.equal(calculateSkillModifier("mastery", 5), 11);
    assert.equal(calculateSkillModifier("lore", 5), 12);
    assert.equal(calculateSkillModifier("grandMaster", 5), 13);
});

test("calculateSkillModifier with attributeTotal=0 isolates just the level's own bonus", () => {
    // This is exactly how SkillCheckDialog gets a separate "level" formula
    // term instead of one lump sum -- see module/apps/skill-check-dialog.mjs.
    assert.equal(calculateSkillModifier("untrained", 0), -4);
    assert.equal(calculateSkillModifier("grandMaster", 0), 8);
});

test("calculateSkillModifier passes attributeTotal through unmodified for an unrecognized level", () => {
    assert.equal(calculateSkillModifier("nonsense", 4), 4);
    assert.equal(calculateSkillModifier(undefined, 4), 4);
});

test("calculateSkillModifier handles a negative attribute total", () => {
    assert.equal(calculateSkillModifier("untrained", -2), -6);
    assert.equal(calculateSkillModifier("grandMaster", -2), 6);
});
