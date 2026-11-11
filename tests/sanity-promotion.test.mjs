import { test } from "node:test";
import assert from "node:assert/strict";
// Real Handlebars and the system's templates: rolledValueHTML renders one.
import "./support/templates.mjs";
import {
  lossAfterSolidification, parseSanityLoss, pendingSanityLoss, rolledValueHTML, wantedSanityStatuses,
} from "../module/helpers/sanity.mjs";
import { messageModeOf } from "../module/helpers/message-modes.mjs";
import { promotionLoss, promotionModifiers, promotionStage } from "../module/helpers/promotion.mjs";

/* The plain math of sanity (helpers/sanity.mjs) and promotion (helpers/promotion.mjs). */

test("Indeterminate Madness below half the maximum (rounded up); Out of Control at 0", () => {
  // Will 6: maximum 16, half is 8.
  assert.deepEqual(wantedSanityStatuses({ value: 8, max: 16 }), { indeterminate: false, outOfControl: false });
  assert.deepEqual(wantedSanityStatuses({ value: 7, max: 16 }), { indeterminate: true, outOfControl: false });
  assert.deepEqual(wantedSanityStatuses({ value: 0, max: 16 }), { indeterminate: false, outOfControl: true });
  // 17 max: half rounded up is 9.
  assert.equal(wantedSanityStatuses({ value: 8, max: 17 }).indeterminate, true);
});

test("mental solidification takes 1 off, never below 0", () => {
  assert.equal(lossAfterSolidification(3, true), 2);
  assert.equal(lossAfterSolidification(0, true), 0);
  assert.equal(lossAfterSolidification(3, false), 3);
});

test("a book-style loss splits into pass / fail", () => {
  assert.deepEqual(parseSanityLoss("1/1d3"), { success: "1", failure: "1d3" });
  assert.deepEqual(parseSanityLoss("1d4"), { success: "1d4", failure: "1d4" });
});

test("promotion modifiers from the dialog's choices", () => {
  const rows = promotionModifiers({ digestion: 20, auxiliary: 4, isHelped: true, helperSequences: 1, moon: "full", isRaw: false });
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  assert.equal(total, -20 - 4 - 3 - 2);
  assert.equal(promotionModifiers({ isRaw: true, imprint: "opposite", isAnimal: true, undigested: 2 })
    .reduce((sum, row) => sum + row.value, 0), 5 + 4 + 4 + 2);
});

test("promotion loss: ritual protection, doubled without one, followers from Sequence 2", () => {
  assert.deepEqual(promotionLoss({ rolled: 7, hasRitual: true, sequence: 5 }), { loss: 2, doubled: 7, protection: 5 });
  assert.deepEqual(promotionLoss({ rolled: 3, hasRitual: false, sequence: 7 }), { loss: 6, doubled: 6, protection: 0 });
  assert.equal(promotionLoss({ rolled: 20, hasRitual: true, followers: 3000, sequence: 2 }).protection, 8);
  assert.equal(promotionLoss({ rolled: 20, hasRitual: true, followers: 3000, sequence: 3 }).protection, 5, "followers only from Sequence 2");
});

test("where a promotion stands", () => {
  assert.equal(promotionStage(2), "promoted");
  assert.equal(promotionStage(3), "semi");
  assert.equal(promotionStage(4), "semi");
  assert.equal(promotionStage(5), "lost");
});

test("a rolled loss shows as a number with its dice in a tooltip, not a roll button", () => {
  const roll = { total: 2, formula: "1d3", result: "2", dice: [{ faces: 3 }] };
  assert.equal(rolledValueHTML(roll), '<strong class="lotm-rolled" data-tooltip="1d3: 2">2</strong>');
  assert.equal(rolledValueHTML(roll, 1), '<strong class="lotm-rolled" data-tooltip="1d3: 2">1</strong>');   // solidified
  assert.equal(rolledValueHTML({ total: 1, formula: "1", result: "1", dice: [] }), '<strong class="lotm-rolled">1</strong>');
  assert.ok(!rolledValueHTML(roll).includes("inline-roll"));
});

test("Roll Loss rolls the loss for the check's result at that moment, Luck included", () => {
  const check = { total: 12, natural: 11, sanity: 10, lossFormulas: { success: "1", failure: "1d3" } };
  assert.deepEqual(pendingSanityLoss(check), { total: 12, success: false, formula: "1d3", isBigFailure: false });
  // 2 Luck burned to lower it: now under Sanity, so the pass loss.
  assert.deepEqual(pendingSanityLoss(check, [-2]), { total: 10, success: true, formula: "1", isBigFailure: false });
  assert.equal(pendingSanityLoss(check, [-2, 1]).success, false);
});

test("a natural 20 stays a Big Failure whatever Luck is burned", () => {
  const check = { total: 20, natural: 20, sanity: 30, lossFormulas: { success: "0", failure: "1d6" } };
  assert.deepEqual(pendingSanityLoss(check, [-15]), { total: 5, success: false, formula: "1d6", isBigFailure: true });
});

test("a blank loss rolls 0", () => {
  assert.equal(pendingSanityLoss({ total: 3, natural: 3, sanity: 10, lossFormulas: { success: "", failure: "1" } }).formula, "0");
});

test("the loss is posted for the same people as the check", () => {
  assert.equal(messageModeOf({ whisper: [], blind: false }), "public");
  assert.equal(messageModeOf({ whisper: ["gm1"], blind: true, author: { id: "p1" } }), "blind");
  assert.equal(messageModeOf({ whisper: ["p1"], blind: false, author: { id: "p1" } }), "self");
  assert.equal(messageModeOf({ whisper: ["gm1", "p1"], blind: false, author: { id: "p1" } }), "gm");
});
