import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECK_PATTERN, SANITY_PATTERN, parseCheckLink, parseSanityLink } from "../module/helpers/enrichers.mjs";

/* What's inside @Sanity[...] and @Check[...] (helpers/enrichers.mjs). */

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
