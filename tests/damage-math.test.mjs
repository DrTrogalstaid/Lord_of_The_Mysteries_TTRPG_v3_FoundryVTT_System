import { test } from "node:test";
import assert from "node:assert/strict";
import { bigSuccessDamage, normalizeDamageType, reduceHit, splitBigSuccess } from "../module/helpers/damage-math.mjs";

/* Damage resistance, immunity and reduction on one hit, and Big Success damage (helpers/damage-math.mjs). */

test("reduction is taken off once per hit, not once per damage type (the destruction potion)", () => {
  // 2d6 acid + 2d6 poison + 2d6 fire, one hit, against 5 points of all-damage reduction.
  const result = reduceHit({ acid: 7, poison: 5, fire: 6 }, { reduction: { acid: 5, poison: 5, fire: 5 } });
  assert.equal(result.incoming, 18);
  assert.equal(result.reduced, 5);
  assert.equal(result.total, 13);
});

test("reduction never takes a hit below 1", () => {
  assert.equal(reduceHit({ physical: 4 }, { reduction: { physical: 5 } }).total, 1, "the rulebook's 4 vs 5");
  assert.equal(reduceHit({ physical: 6 }, { reduction: { physical: 5 } }).total, 1, "an air cannon: 6 - 5");
});

test("resistance can take a type to 0, immunity always does", () => {
  assert.equal(reduceHit({ fire: 4 }, { resistance: { fire: 5 } }).total, 0);
  assert.equal(reduceHit({ poison: 12 }, { immunities: ["poison"] }).total, 0);
  // Resistance first, then reduction on what's left (at least 1 if any is left).
  const result = reduceHit({ fire: 8 }, { resistance: { fire: 5 }, reduction: { fire: 5 } });
  assert.equal(result.total, 1);
});

test("one type's reduction can't soak up another type's damage", () => {
  // 10 physical + 2 fire, fire reduction 5 only: it takes the 2 fire away, not 5 of the physical.
  const result = reduceHit({ physical: 10, fire: 2 }, { reduction: { fire: 5 } });
  assert.equal(result.total, 10);
  // With physical 3 and fire 5, the biggest that applies is used once: 3 off the physical.
  assert.equal(reduceHit({ physical: 10, fire: 2 }, { reduction: { physical: 3, fire: 5 } }).total, 9);
});

test("untyped damage uses the 'all' reduction", () => {
  assert.equal(reduceHit({ "": 9 }, { reduction: { all: 2 } }).total, 7);
  assert.equal(reduceHit({ "": 9 }, { reduction: { physical: 2 } }).total, 9);
});

test("the parts say how much each type lost", () => {
  const { parts } = reduceHit({ physical: 10, fire: 6 }, { resistance: { fire: 2 }, reduction: { physical: 3 } });
  const byType = Object.fromEntries(parts.map((part) => [part.type, part]));
  assert.deepEqual([byType.physical.reduction, byType.physical.taken], [3, 7]);
  assert.deepEqual([byType.fire.reduction, byType.fire.taken], [2, 4]);
});

test("Big Success: at least half the maximum, rounded up", () => {
  assert.deepEqual(bigSuccessDamage(6, 13), { minimum: 7, amount: 7, isRaised: true }, "1d8+5 rolled 6");
  assert.deepEqual(bigSuccessDamage(8, 13), { minimum: 7, amount: 8, isRaised: false });
  assert.equal(bigSuccessDamage(3, 12).amount, 6, "2d6");
});

test("a raised Big Success keeps each damage type and adds up to the minimum", () => {
  const parts = splitBigSuccess([{ type: "fire", amount: 12 }, { type: "cold", amount: 5 }], 9);
  assert.equal(parts.reduce((sum, part) => sum + part.amount, 0), 9);
  assert.deepEqual(parts.map((part) => part.type), ["fire", "cold"]);
});

test("damage types saved the old ways are read as keys", () => {
  const types = { physical: "LORD_OF_THE_MYSTERIES.DamageTypes.Physical", fire: "LORD_OF_THE_MYSTERIES.DamageTypes.Fire" };
  assert.equal(normalizeDamageType("physical", types), "physical");
  assert.equal(normalizeDamageType("Physical", types), "physical");
  assert.equal(normalizeDamageType("LORD_OF_THE_MYSTERIES.DamageTypes.Fire", types), "fire");
  assert.equal(normalizeDamageType("All", types), "all");
  assert.equal(normalizeDamageType("", types), null);
});

test("a damage type with no reduction of its own gets the 'all' reduction", () => {
  assert.equal(reduceHit({ piercing: 9 }, { reduction: { all: 2, physical: 2 } }).total, 7);
});
