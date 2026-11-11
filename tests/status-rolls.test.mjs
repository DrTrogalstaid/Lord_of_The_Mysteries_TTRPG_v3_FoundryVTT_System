import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * What statuses add to rolls (effects/status-rolls.mjs) and what they stop (effects/status-restrictions.mjs).
 * Foundry isn't loaded: the actors and effects are small stand-ins with only what the code reads.
 */

// Foundry globals the status code reads.
globalThis.CONST = { ACTIVE_EFFECT_SHOW_ICON: { NEVER: 0, CONDITIONAL: 1, ALWAYS: 2 } };
globalThis.Handlebars = {
  escapeExpression: (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
};

/** A few English strings; any other key comes back as itself. {name}-style placeholders are filled in. */
const STRINGS = {
  "LORD_OF_THE_MYSTERIES.Status.Names.advantage": "Advantage",
  "LORD_OF_THE_MYSTERIES.Status.Names.fear": "Fear",
  "LORD_OF_THE_MYSTERIES.Status.Names.angry": "Angry/Taunted",
  "LORD_OF_THE_MYSTERIES.Status.Rolls.Against": "{status} vs. {source}",
  "LORD_OF_THE_MYSTERIES.Status.Rolls.HelplessTarget": "Advantage: target is Helpless",
  "LORD_OF_THE_MYSTERIES.Status.Notes.TargetInvisible": "{name} is Invisible",
  "LORD_OF_THE_MYSTERIES.Status.Notes.TargetBound": "{name} is Bound",
  "LORD_OF_THE_MYSTERIES.Status.Notes.Deaf": "Deaf: hearing checks fail",
  "LORD_OF_THE_MYSTERIES.Status.Notes.Blind": "Blind: Inspiration check first",
  "LORD_OF_THE_MYSTERIES.Status.Restrictions.dying": "Dying: Will check (DC {dc})",
};
const fill = (text, data) => text.replace(/\{(\w+)\}/g, (match, key) => (key in data ? String(data[key]) : match));
globalThis.game = {
  i18n: {
    localize: (key) => STRINGS[key] ?? key,
    format: (key, data = {}) => fill(STRINGS[key] ?? key, data),
  },
};

const { statusRollExtras } = await import("../module/effects/status-rolls.mjs");
const { statusRestrictions } = await import("../module/effects/status-restrictions.mjs");

const LISTEN = "Compendium.lotm.skills_compendium.Item.NLLyOSb3OqhMvLVP";
const SPOT = "Compendium.lotm.skills_compendium.Item.SpotSpotSpotSpot";

/* -------------------------------------------- */
/*  Stand-ins                                    */
/* -------------------------------------------- */

/** An actor with these effects. */
function makeActor(name, effects = [], system = {}) {
  return { name, uuid: `Actor.${name}`, system, allApplicableEffects: () => effects };
}

/**
 * An effect with these statuses.
 * @param {string[]} statuses
 * @param {object} [options]
 * @param {object} [options.source]   The actor that caused it (system.source / sourceActor).
 * @param {object} [options.system]   More system fields (isPenaltyHalved, ...).
 * @param {boolean} [options.active]
 */
function makeEffect(statuses, { source = null, system = {}, active = true } = {}) {
  return {
    active,
    statuses: new Set(statuses),
    system: { source: source?.uuid ?? null, ...system },
    sourceActor: source,
  };
}

/** An action or spell with this action type and these traits. */
const makeItem = (actionType, traits = []) => ({ name: "Test Action", system: { actionType, traits: new Set(traits) } });

const values = (extras) => extras.modifiers.map((m) => m.value);

/* -------------------------------------------- */
/*  Roll modifiers                               */
/* -------------------------------------------- */

test("Angry: -4 on skill, attribute and action rolls", () => {
  const actor = makeActor("Klein", [makeEffect(["angry"])]);
  for (const kind of ["skill", "attribute", "action"]) {
    const extras = statusRollExtras({ actor, kind });
    assert.deepEqual(values(extras), [-4], kind);
    assert.equal(extras.modifiers[0].label, "Angry/Taunted");
    assert.ok(extras.modifiers[0].img, "status rows carry the status icon");
  }
});

test("Angry after Meditation (Half): -2", () => {
  const actor = makeActor("Klein", [makeEffect(["angry"], { system: { isPenaltyHalved: true } })]);
  assert.deepEqual(values(statusRollExtras({ actor, kind: "skill" })), [-2]);
});

test("a switched-off effect adds nothing", () => {
  const actor = makeActor("Klein", [makeEffect(["angry"], { active: false })]);
  assert.deepEqual(statusRollExtras({ actor, kind: "skill" }), { modifiers: [], notes: [] });
});

test("Fear: -4 named after its source when nothing is targeted", () => {
  const monster = makeActor("Monster");
  const actor = makeActor("Klein", [makeEffect(["fear"], { source: monster })]);
  const extras = statusRollExtras({ actor, kind: "skill" });
  assert.deepEqual(values(extras), [-4]);
  assert.equal(extras.modifiers[0].label, "Fear vs. Monster");
});

test("Fear: -4 when the source is targeted, nothing when only someone else is", () => {
  const monster = makeActor("Monster");
  const bystander = makeActor("Bystander");
  const actor = makeActor("Klein", [makeEffect(["fear"], { source: monster })]);
  assert.deepEqual(values(statusRollExtras({ actor, kind: "action", targets: [monster] })), [-4]);
  assert.deepEqual(values(statusRollExtras({ actor, kind: "action", targets: [bystander, monster] })), [-4]);
  assert.deepEqual(values(statusRollExtras({ actor, kind: "action", targets: [bystander] })), []);
});

test("Fear with no source: -4 on every check (the player takes it out if it doesn't apply)", () => {
  const actor = makeActor("Klein", [makeEffect(["fear"])]);
  const extras = statusRollExtras({ actor, kind: "skill", targets: [makeActor("Anyone")] });
  assert.deepEqual(values(extras), [-4]);
  assert.equal(extras.modifiers[0].label, "Fear");
});

test("Advantage: +2 against its source only", () => {
  const enemy = makeActor("Enemy");
  const other = makeActor("Other");
  const actor = makeActor("Klein", [makeEffect(["advantage"], { source: enemy })]);
  assert.deepEqual(values(statusRollExtras({ actor, kind: "action", targets: [enemy] })), [2]);
  assert.deepEqual(values(statusRollExtras({ actor, kind: "action", targets: [other] })), []);
});

test("two Fear effects from the same source count once, from two sources twice", () => {
  const a = makeActor("A");
  const b = makeActor("B");
  const same = makeActor("Klein", [makeEffect(["fear"], { source: a }), makeEffect(["fear"], { source: a })]);
  assert.deepEqual(values(statusRollExtras({ actor: same, kind: "skill" })), [-4]);
  const two = makeActor("Klein", [makeEffect(["fear"], { source: a }), makeEffect(["fear"], { source: b })]);
  assert.deepEqual(values(statusRollExtras({ actor: two, kind: "skill" })), [-4, -4]);
});

test("attacking a Helpless target: +2 on action rolls, not on skill checks", () => {
  const target = makeActor("Victim", [makeEffect(["helpless"])]);
  const actor = makeActor("Klein");
  const extras = statusRollExtras({ actor, kind: "action", targets: [target] });
  assert.deepEqual(values(extras), [2]);
  assert.equal(extras.modifiers[0].label, "Advantage: target is Helpless");
  assert.deepEqual(values(statusRollExtras({ actor, kind: "skill", targets: [target] })), []);
});

test("Helpless target and Advantage against it: +2 once, not +4", () => {
  const target = makeActor("Victim", [makeEffect(["helpless"])]);
  const actor = makeActor("Klein", [makeEffect(["advantage"], { source: target })]);
  assert.deepEqual(values(statusRollExtras({ actor, kind: "action", targets: [target] })), [2]);
});

test("two Helpless targets: +2 once", () => {
  const targets = [makeActor("A", [makeEffect(["helpless"])]), makeActor("B", [makeEffect(["helpless"])])];
  assert.deepEqual(values(statusRollExtras({ actor: makeActor("Klein"), kind: "action", targets })), [2]);
});

/* -------------------------------------------- */
/*  Notes                                        */
/* -------------------------------------------- */

test("Deaf: a note on Listen checks only", () => {
  const actor = makeActor("Klein", [makeEffect(["deaf"])]);
  assert.deepEqual(statusRollExtras({ actor, kind: "skill", skillKey: "listening", skillUuid: LISTEN }).notes, ["Deaf: hearing checks fail"]);
  assert.deepEqual(statusRollExtras({ actor, kind: "skill", skillKey: "spot", skillUuid: SPOT }).notes, []);
  // Skills are matched by key, so a world copy of Listening (another UUID) counts too.
  assert.deepEqual(statusRollExtras({ actor, kind: "skill", skillKey: "listening", skillUuid: "Item.worldCopy" }).notes, ["Deaf: hearing checks fail"]);
  assert.deepEqual(statusRollExtras({ actor, kind: "attribute" }).notes, []);
});

test("Blind: a note on action rolls", () => {
  const actor = makeActor("Klein", [makeEffect(["blind"])]);
  assert.deepEqual(statusRollExtras({ actor, kind: "action" }).notes, ["Blind: Inspiration check first"]);
  assert.deepEqual(statusRollExtras({ actor, kind: "attribute" }).notes, []);
});

test("an Invisible target: a note naming it, on actions and skill checks", () => {
  const ghost = makeActor("Ghost <b>", [makeEffect(["invisible"])]);
  const actor = makeActor("Klein");
  assert.deepEqual(statusRollExtras({ actor, kind: "action", targets: [ghost] }).notes, ["Ghost &lt;b&gt; is Invisible"]);
  assert.deepEqual(statusRollExtras({ actor, kind: "skill", targets: [ghost] }).notes, ["Ghost &lt;b&gt; is Invisible"]);
  assert.deepEqual(statusRollExtras({ actor, kind: "attribute", targets: [ghost] }).notes, []);
});

test("a Helpless target also notes that it's Bound (Helpless brings Bound)", () => {
  const target = makeActor("Victim", [makeEffect(["helpless"])]);
  const { notes } = statusRollExtras({ actor: makeActor("Klein"), kind: "action", targets: [target] });
  assert.deepEqual(notes, ["Victim is Bound"]);
});

/* -------------------------------------------- */
/*  Restrictions (Use Anyway warnings)           */
/* -------------------------------------------- */

const restrictedBy = (actor, item) => statusRestrictions(actor, item).map((entry) => entry.statusId);

test("Bound stops movement actions, grapples and parries, not attacks", () => {
  const actor = makeActor("Klein", [makeEffect(["bound"])]);
  assert.deepEqual(restrictedBy(actor, makeItem("move")), ["bound"]);
  assert.deepEqual(restrictedBy(actor, makeItem("attack", ["grapple", "aimed"])), ["bound"]);
  assert.deepEqual(restrictedBy(actor, makeItem("quick", ["parry", "reaction"])), ["bound"]);
  assert.deepEqual(restrictedBy(actor, makeItem("attack", ["aimed"])), []);
});

test("Helpless warns as Bound (the status it brings)", () => {
  const actor = makeActor("Klein", [makeEffect(["helpless"])]);
  assert.deepEqual(restrictedBy(actor, makeItem("move")), ["bound"]);
});

test("Silence stops speech; Off Guard stops reactions; Loss of Balance stops movement", () => {
  assert.deepEqual(restrictedBy(makeActor("A", [makeEffect(["silence"])]), makeItem("attack", ["speech"])), ["silence"]);
  assert.deepEqual(restrictedBy(makeActor("A", [makeEffect(["silence"])]), makeItem("attack", ["aimed"])), []);
  assert.deepEqual(restrictedBy(makeActor("A", [makeEffect(["offGuard"])]), makeItem("quick", ["reaction"])), ["offGuard"]);
  assert.deepEqual(restrictedBy(makeActor("A", [makeEffect(["lossOfBalance"])]), makeItem("move")), ["lossOfBalance"]);
  assert.deepEqual(restrictedBy(makeActor("A", [makeEffect(["lossOfBalance"])]), makeItem("attack")), []);
});

test("Blind stops anything aimed", () => {
  const actor = makeActor("Klein", [makeEffect(["blind"])]);
  assert.deepEqual(restrictedBy(actor, makeItem("attack", ["aimed"])), ["blind"]);
  assert.deepEqual(restrictedBy(actor, makeItem("free")), []);
});

test("Dying: only free and quick actions, unless physically improved", () => {
  const dying = makeActor("Klein", [makeEffect(["dying"])], { hasPhysicalImprovement: false });
  assert.deepEqual(restrictedBy(dying, makeItem("attack")), ["dying"]);
  assert.deepEqual(restrictedBy(dying, makeItem("move")), ["dying"]);
  assert.deepEqual(restrictedBy(dying, makeItem("full")), ["dying"]);
  assert.deepEqual(restrictedBy(dying, makeItem("free")), []);
  assert.deepEqual(restrictedBy(dying, makeItem("quick")), []);
  assert.deepEqual(restrictedBy(dying, makeItem("")), [], "a spell with no action type isn't stopped");
  assert.equal(statusRestrictions(dying, makeItem("attack"))[0].reason, "Dying: Will check (DC 15)");

  const improved = makeActor("Klein", [makeEffect(["dying"])], { hasPhysicalImprovement: true });
  assert.deepEqual(restrictedBy(improved, makeItem("attack")), []);
});

test("Dead stops everything", () => {
  const actor = makeActor("Klein", [makeEffect(["dead"])]);
  assert.deepEqual(restrictedBy(actor, makeItem("free")), ["dead"]);
  assert.deepEqual(restrictedBy(actor, makeItem("")), ["dead"]);
});

test("each status warns once, even with two effects of it", () => {
  const actor = makeActor("Klein", [makeEffect(["bound"]), makeEffect(["helpless"])]);
  assert.deepEqual(restrictedBy(actor, makeItem("move")), ["bound"]);
});

test("no statuses: no warnings", () => {
  assert.deepEqual(restrictedBy(makeActor("Klein"), makeItem("move", ["speech", "aimed"])), []);
});
