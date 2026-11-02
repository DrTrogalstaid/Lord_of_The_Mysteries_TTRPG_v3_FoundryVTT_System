import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPortion, combineStatusRules, movementAgility, physicalDefense, smallerPortion } from "../module/effects/status-math.mjs";
import { STATUS_RULES, activeStatusIds, activeStatusRules, statusRule, withImpliedStatuses } from "../module/effects/status-effects.mjs";

/* -------------------------------------------- */
/*  status-math.mjs                              */
/* -------------------------------------------- */

test("smallerPortion: none beats half, half beats full", () => {
    assert.equal(smallerPortion("full", "half"), "half");
    assert.equal(smallerPortion("half", "none"), "none");
    assert.equal(smallerPortion("none", "full"), "none");
    assert.equal(smallerPortion(undefined, undefined), "full");
    assert.equal(smallerPortion("half", undefined), "half");
});

test("applyPortion halves rounding up, and none is 0", () => {
    assert.equal(applyPortion(5, "half"), 3, "Loss of Balance: 5 Agility becomes 3");
    assert.equal(applyPortion(4, "half"), 2);
    assert.equal(applyPortion(5, "none"), 0);
    assert.equal(applyPortion(5, "full"), 5);
    assert.equal(applyPortion(5), 5);
});

test("with no statuses Physical Defense is Agility + Armor + Dodge + 10, as before", () => {
    const { defense } = combineStatusRules([]);
    assert.equal(physicalDefense({ agility: 4, armor: 3, dodge: 2, defense }), 19);
    assert.equal(physicalDefense({ agility: 4, armor: 3, dodge: 2 }), 19, "no defense settings at all");
});

test("Bound / Off Guard: no Agility and no Dodge in Physical Defense", () => {
    const { defense } = combineStatusRules([STATUS_RULES.bound]);
    assert.equal(physicalDefense({ agility: 4, armor: 3, dodge: 2, defense }), 13);
    assert.deepEqual(defense.sources, ["bound"]);
});

test("Loss of Balance: Agility halved (rounded up) for defense and movement, Dodge kept", () => {
    const { defense, movement } = combineStatusRules([STATUS_RULES.lossOfBalance]);
    assert.equal(physicalDefense({ agility: 5, armor: 0, dodge: 2, defense }), 3 + 0 + 2 + 10);
    assert.equal(movementAgility(5, movement), 3);
});

test("Disadvantage takes 2 off the Agility + Dodge part", () => {
    const { defense } = combineStatusRules([STATUS_RULES.disadvantage]);
    assert.equal(physicalDefense({ agility: 4, armor: 3, dodge: 2, defense }), 17);
});

test("Disadvantage with Bound: nothing left to lower, so it's skipped", () => {
    const { defense } = combineStatusRules([STATUS_RULES.bound, STATUS_RULES.disadvantage]);
    assert.equal(physicalDefense({ agility: 4, armor: 3, dodge: 2, defense }), 13);
    assert.deepEqual(defense.sources, ["bound", "disadvantage"]);
});

test("the stronger change wins: Loss of Balance and Bound together remove Agility", () => {
    const { defense } = combineStatusRules([STATUS_RULES.lossOfBalance, STATUS_RULES.bound]);
    assert.equal(defense.agility, "none");
    assert.equal(defense.dodge, "none");
});

test("statuses without defense or movement settings change nothing", () => {
    const result = combineStatusRules([STATUS_RULES.fear, STATUS_RULES.silence]);
    assert.deepEqual(result.defense, { agility: "full", dodge: "full", modifier: 0, sources: [] });
    assert.deepEqual(result.movement, { agility: "full", sources: [] });
    assert.equal(movementAgility(5, result.movement), 5);
});

/* -------------------------------------------- */
/*  status-effects.mjs                           */
/* -------------------------------------------- */

/** A stand-in for an Actor: allApplicableEffects() gives its effects, like Foundry's. */
const fakeActor = (effects) => ({ *allApplicableEffects() { yield* effects; } });
const fakeEffect = (statuses, { active = true } = {}) => ({ statuses: new Set(statuses), active });

test("Helpless implies Bound", () => {
    assert.deepEqual([...withImpliedStatuses(new Set(["helpless"]))].sort(), ["bound", "helpless"]);
});

test("activeStatusIds: skips effects that are off or suppressed, and adds implied statuses", () => {
    const actor = fakeActor([
        fakeEffect(["helpless"]),
        fakeEffect(["fear"], { active: false }),          // disabled, or on stowed gear
        fakeEffect(["prone"]),                            // a status the system doesn't know is kept, but has no rule
    ]);
    assert.deepEqual([...activeStatusIds(actor)].sort(), ["bound", "helpless", "prone"]);
    assert.deepEqual(activeStatusRules(actor).map((rule) => rule.id), ["helpless", "bound"], "status-list order, known statuses only");
});

test("activeStatusIds on a missing actor is empty", () => {
    assert.equal(activeStatusIds(null).size, 0);
});

test("every status has an icon, a rules page and a Foundry status entry", () => {
    for (const rule of Object.values(STATUS_RULES)) {
        assert.ok(rule.img, `${rule.id} icon`);
        assert.match(rule.reference ?? "", /^Compendium\.lotm\.rules_compendium\.JournalEntry\.\w{16}\.JournalEntryPage\.\w{16}$/, `${rule.id} page`);
        const config = rule.toStatusEffect();
        assert.equal(config.id, rule.id);
        assert.equal(config.type, "effect");
    }
});

test("Foundry's status entries carry only their own status (implied ones get their own linked effects)", () => {
    for (const rule of Object.values(STATUS_RULES)) {
        const config = rule.toStatusEffect();
        assert.equal(config.statuses, undefined, `${rule.id} has no extra statuses`);
        assert.equal(config._id, undefined, `${rule.id} needs no fixed id`);
    }
    assert.deepEqual(STATUS_RULES.helpless.implies, ["bound"]);
});

test("toEffectData: a single-status effect for a linked implied status", () => {
    globalThis.game = { i18n: { localize: (key) => (key === "LORD_OF_THE_MYSTERIES.Status.Names.bound" ? "Bound" : key) } };
    const data = STATUS_RULES.bound.toEffectData({ impliedBy: "abc" }, { disabled: true });
    assert.equal(data.name, "Bound");
    assert.equal(data.type, "effect");
    assert.deepEqual(data.statuses, ["bound"]);
    assert.deepEqual(data.system, { impliedBy: "abc" });
    assert.equal(data.disabled, true);
    assert.match(data.description, /@UUID\[Compendium\.lotm\.rules_compendium\.JournalEntry\.xVlBNlTOMkhLtx6h\.JournalEntryPage\.l3r635tKgr7cILRL\]/);
    delete globalThis.game;
});

test("statusRule: unknown statuses give null", () => {
    assert.equal(statusRule("bound"), STATUS_RULES.bound);
    assert.equal(statusRule("prone"), null);
});
