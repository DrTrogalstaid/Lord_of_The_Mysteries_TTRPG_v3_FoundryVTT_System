import { test } from "node:test";
import assert from "node:assert/strict";

// Typed money amounts (helpers/currency.mjs parseMoney). Only game.settings is read, and only by other functions.
globalThis.game = { settings: { get: () => "loen", register() {} }, i18n: { localize: (k) => k, format: (k) => k } };
const { parseMoney } = await import("../module/helpers/currency.mjs");

test("Loen: pounds, soli and pence, in pennies (£1 = 20s = 240d)", () => {
  assert.equal(parseMoney("£3 4s 6d"), 3 * 240 + 4 * 12 + 6);
  assert.equal(parseMoney("3 pounds 10 soli"), 3 * 240 + 120);
  assert.equal(parseMoney("2.5s"), 30);
  assert.equal(parseMoney("8d"), 8);
  assert.equal(parseMoney("5"), 5 * 240, "a bare number is the main coin");
  assert.equal(parseMoney("£ 3"), 720);
  assert.equal(parseMoney("3 gold pounds, 2 pence and 1 sol"), 720 + 2 + 12);
  assert.equal(parseMoney(""), 0);
});

test("other currencies, and coin names that are only one letter", () => {
  assert.equal(parseMoney("12 verl d'or 50 c", "intis"), 1250);
  assert.equal(parseMoney("1 hoorn 2 f 3 k", "feysac"), 123);
  assert.equal(parseMoney("3 s", "loen"), 36);
});

test("text that isn't an amount gives null", () => {
  for (const text of ["abc", "3 sword", "s3", "3 s d", "£", "3 d'", "3.5.2"]) {
    assert.equal(parseMoney(text), null, text);
  }
  assert.equal(parseMoney("3", "nope"), null, "unknown currency");
});
