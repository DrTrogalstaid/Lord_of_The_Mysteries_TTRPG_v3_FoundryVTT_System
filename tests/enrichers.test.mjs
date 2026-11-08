import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_PATTERN, DAMAGE_PATTERN, EFFECT_PATTERN, SANITY_PATTERN,
  appliedEffectKey, parseCheckLink, parseDamageLink, parseEffectLink, parseSanityLink,
} from "../module/helpers/enrichers.mjs";

/* What's inside @Sanity[...], @Check[...], @Effect[...] and @Damage[...] (helpers/enrichers.mjs). */

const ATTRIBUTES = {
  str: "Strength", agi: "Agility", wil: "Wilpower", phy: "Physique",
  cha: "Charisma", ins: "Inspiration", luc: "Luck", edu: "Education",
};

test("@Sanity: pass / fail losses, one loss for both, and a penalty", () => {
  assert.deepEqual(parseSanityLink("1/1d2"), { success: "1", failure: "1d2", penalty: 0 });
  assert.deepEqual(parseSanityLink("0/1d2"), { success: "0", failure: "1d2", penalty: 0 });
  assert.deepEqual(parseSanityLink("1d3"), { success: "1d3", failure: "1d3", penalty: 0 });
  assert.deepEqual(parseSanityLink("1d8/2d8|+4"), { success: "1d8", failure: "2d8", penalty: 4 });
  assert.equal(parseSanityLink("1/1d2 | penalty=2").penalty, 2);
});

test("@Check: attributes by key, name or the translation's other words", () => {
  assert.deepEqual(parseCheckLink("wil|15", ATTRIBUTES), { attribute: "wil", skill: null, dc: 15 });
  assert.equal(parseCheckLink("Will|15", ATTRIBUTES).attribute, "wil");
  assert.equal(parseCheckLink("Willpower", ATTRIBUTES).attribute, "wil");
  assert.equal(parseCheckLink("Constitution|DC 10", ATTRIBUTES).attribute, "phy");
  assert.equal(parseCheckLink("Luck|20", ATTRIBUTES).attribute, "luc");
  assert.equal(parseCheckLink("phy|dc=15", ATTRIBUTES).dc, 15);
});

test("@Check: anything else is a skill name", () => {
  assert.deepEqual(parseCheckLink("Listening|30", ATTRIBUTES), { attribute: null, skill: "Listening", dc: 30 });
  assert.deepEqual(parseCheckLink("Medicine", ATTRIBUTES), { attribute: null, skill: "Medicine", dc: null });
});

test("@Sanity and @Sanity are the same button; @Check is its own", () => {
  const matches = (pattern, text) => [...text.matchAll(pattern)].map((m) => [m[1], m[2] ?? null]);
  const text = "Lose @Sanity[0/1d2]{Whispers} or @sanity[1/1d3], then @Check[wil|15]{Decipher}.";
  assert.deepEqual(matches(SANITY_PATTERN, text), [["0/1d2", "Whispers"], ["1/1d3", null]]);
  assert.deepEqual(matches(CHECK_PATTERN, text), [["wil|15", "Decipher"]]);
});


test("@Effect: a UUID (it has dots), or a status's id or name", () => {
  assert.deepEqual(parseEffectLink("Compendium.lotm.effects.ActiveEffect.abc123"),
    { uuid: "Compendium.lotm.effects.ActiveEffect.abc123", status: null });
  assert.deepEqual(parseEffectLink("Actor.x.ActiveEffect.y"), { uuid: "Actor.x.ActiveEffect.y", status: null });
  assert.deepEqual(parseEffectLink(" bound "), { uuid: null, status: "bound" });
  assert.deepEqual(parseEffectLink("Loss of Balance"), { uuid: null, status: "Loss of Balance" });
  assert.deepEqual(parseEffectLink(""), { uuid: null, status: null });
});

test("@Effect is its own button, with an optional label", () => {
  const matches = (pattern, text) => [...text.matchAll(pattern)].map((m) => [m[1], m[2] ?? null]);
  const text = "You're @Effect[Compendium.lotm.effects.ActiveEffect.abc]{Cursed}, then @effect[bound]. @Check[wil|15]";
  assert.deepEqual(matches(EFFECT_PATTERN, text), [["Compendium.lotm.effects.ActiveEffect.abc", "Cursed"], ["bound", null]]);
  assert.deepEqual(matches(CHECK_PATTERN, text), [["wil|15", null]]);
});

test("@Effect: each character is remembered once per effect on a message", () => {
  assert.equal(appliedEffectKey("Actor.klein", { uuid: "Compendium.lotm.effects.ActiveEffect.abc" }),
    "Actor.klein|Compendium.lotm.effects.ActiveEffect.abc");
  assert.equal(appliedEffectKey("Actor.klein", { statusId: "bound", uuid: null }), "Actor.klein|status:bound");
});


test("@Damage: the formula, and a type after |", () => {
  assert.deepEqual(parseDamageLink("2d6"), { formula: "2d6", type: "" });
  assert.deepEqual(parseDamageLink(" 1d8 + 3 | fire "), { formula: "1d8 + 3", type: "fire" });
  assert.deepEqual(parseDamageLink("2d6[fire] + 1d4"), { formula: "2d6[fire] + 1d4", type: "" });
  assert.deepEqual(parseDamageLink("2d6[fire] + 1d4|physical"), { formula: "2d6[fire] + 1d4", type: "physical" });
  // A | inside a [label] isn't the separator.
  assert.deepEqual(parseDamageLink("2d6[a|b]"), { formula: "2d6[a|b]", type: "" });
});

test("@Damage keeps the formula's own [labels]", () => {
  const matches = (pattern, text) => [...text.matchAll(pattern)].map((m) => [m[1], m[2] ?? null]);
  const text = "Rocks fall: @Damage[2d6[physical] + 1d4[fire]]{Falling Rocks}, then @Damage[1d8+@attributes.str.total|fire]. @Check[agi]";
  assert.deepEqual(matches(DAMAGE_PATTERN, text), [
    ["2d6[physical] + 1d4[fire]", "Falling Rocks"],
    ["1d8+@attributes.str.total|fire", null],
  ]);
  assert.deepEqual(matches(CHECK_PATTERN, text), [["agi", null]]);
});
