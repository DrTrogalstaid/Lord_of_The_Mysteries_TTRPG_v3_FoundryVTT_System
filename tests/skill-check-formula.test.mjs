import { test } from "node:test";
import assert from "node:assert/strict";
import { signedTerm, buildSkillCheckFormula, computeSkillCheckTotal } from "../module/helpers/skill-check-formula.mjs";

test("signedTerm always shows an explicit sign", () => {
    assert.equal(signedTerm(3), "+3");
    assert.equal(signedTerm(-3), "-3");
    assert.equal(signedTerm(0), "+0");
});

test("buildSkillCheckFormula produces the base die plus attribute and level terms, tagged N[Label]", () => {
    const formula = buildSkillCheckFormula({
        baseDie: "1d20",
        attrAbbr: "CHA",
        attrTotal: 3,
        levelLabel: "Trained",
        levelBonus: 2,
        skillName: "Performance"
    });
    assert.equal(formula, "1d20 +3[CHA] +2[Trained]");
});

test("buildSkillCheckFormula omits the flat item modifier term when it's zero", () => {
    const formula = buildSkillCheckFormula({
        baseDie: "1d20",
        attrAbbr: "CHA",
        attrTotal: 3,
        levelLabel: "Trained",
        levelBonus: 2,
        skillName: "Performance",
        flatModifier: 0
    });
    assert.ok(!formula.includes("[Performance]"), "a zero flat modifier should not add a term");
});

test("buildSkillCheckFormula includes a nonzero flat item modifier, tagged with the skill's name", () => {
    const formula = buildSkillCheckFormula({
        baseDie: "1d20",
        attrAbbr: "CHA",
        attrTotal: 3,
        levelLabel: "Trained",
        levelBonus: 2,
        skillName: "Performance",
        flatModifier: 1
    });
    assert.equal(formula, "1d20 +3[CHA] +2[Trained] +1[Performance]");
});

test("buildSkillCheckFormula appends every ad-hoc modifier in order, each with its own label", () => {
    const formula = buildSkillCheckFormula({
        baseDie: "1d20",
        attrAbbr: "INS",
        attrTotal: 4,
        levelLabel: "Untrained",
        levelBonus: -4,
        skillName: "Law",
        modifiers: [
            { label: "Bold Move", value: 2 },
            { label: "Distracted", value: -1 }
        ]
    });
    assert.equal(formula, "1d20 +4[INS] -4[Untrained] +2[Bold Move] -1[Distracted]");
});

test("buildSkillCheckFormula includes both the flat item modifier and ad-hoc modifiers together", () => {
    const formula = buildSkillCheckFormula({
        baseDie: "1d20",
        attrAbbr: "STR",
        attrTotal: 2,
        levelLabel: "Proficient",
        levelBonus: 4,
        skillName: "Fighting",
        flatModifier: 1,
        modifiers: [{ label: "Flanking", value: 2 }]
    });
    assert.equal(formula, "1d20 +2[STR] +4[Proficient] +1[Fighting] +2[Flanking]");
});

test("computeSkillCheckTotal sums attribute, level bonus, flat modifier, and ad-hoc modifiers", () => {
    const total = computeSkillCheckTotal({
        attrTotal: 3,
        levelBonus: 2,
        flatModifier: 1,
        modifiers: [{ value: 2 }, { value: -1 }]
    });
    assert.equal(total, 7); // 3 + 2 + 1 + 2 - 1
});

test("computeSkillCheckTotal defaults flatModifier and modifiers when omitted", () => {
    assert.equal(computeSkillCheckTotal({ attrTotal: 5, levelBonus: -4 }), 1);
});

test("computeSkillCheckTotal stays in sync with what buildSkillCheckFormula actually rolls", () => {
    // Regression guard: these two must always agree, since the dialog shows
    // computeSkillCheckTotal()'s number on the Roll button but actually rolls
    // whatever buildSkillCheckFormula() produces.
    const params = {
        attrTotal: 3,
        levelBonus: 2,
        flatModifier: 1,
        modifiers: [{ label: "Bold Move", value: 2 }, { label: "Distracted", value: -1 }]
    };
    const total = computeSkillCheckTotal(params);

    const formula = buildSkillCheckFormula({
        baseDie: "1d20",
        attrAbbr: "CHA",
        levelLabel: "Trained",
        skillName: "Performance",
        ...params
    });
    // Match each "+N[" / "-N[" the same way LOTM_VTTRoll's own cleanFormula
    // regex does (see module/dice/lotm-roll.mjs) -- can't split on a plain
    // space since a modifier's own label (e.g. "Bold Move") may contain one.
    const numericTerms = [...formula.matchAll(/([+-]\d+)\[/g)].map((m) => Number(m[1]));
    const sumOfTerms = numericTerms.reduce((sum, n) => sum + n, 0);

    assert.equal(sumOfTerms, total);
});
