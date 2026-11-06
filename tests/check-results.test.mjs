import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkSucceeds, defenseValue, effectiveDefenseTarget, isAttackHit, isMissingDefenseTarget, naturalD20,
  sanityCheckSucceeds, totalWithLuck,
} from "../module/helpers/check-results.mjs";

/*
 * Check results (helpers/check-results.mjs): passing a DC, hitting a defense, sanity checks, which defense an
 * attack goes against. Rolls and actors are small stand-ins with only what the code reads.
 */

/** A roll whose d20 shows `face` (and maybe a damage die too). */
const rollWith = (...dice) => ({ dice });
const d20 = (...faces) => ({ faces: 20, results: faces.map((result) => ({ result, active: true })) });

test("the natural d20 is read from the roll's single d20", () => {
  assert.equal(naturalD20(rollWith(d20(17))), 17);
  assert.equal(naturalD20(rollWith({ faces: 6, results: [{ result: 4, active: true }] }, d20(20))), 20);
  assert.equal(naturalD20(rollWith({ faces: 6, results: [{ result: 4, active: true }] })), null, "no d20");
  assert.equal(naturalD20(rollWith(d20(3, 18))), null, "2d20: no single natural");
  // 2d20kh: the dropped die isn't active.
  assert.equal(naturalD20(rollWith({ faces: 20, results: [{ result: 3, active: false, discarded: true }, { result: 18, active: true }] })), 18);
});

test("a check meets or beats the DC; natural 20 / 1 decide on their own", () => {
  assert.equal(checkSucceeds({ total: 15, natural: 10, dc: 15 }), true, "meets it");
  assert.equal(checkSucceeds({ total: 14, natural: 10, dc: 15 }), false);
  assert.equal(checkSucceeds({ total: 12, natural: 20, dc: 25 }), true, "natural 20 always passes");
  assert.equal(checkSucceeds({ total: 30, natural: 1, dc: 10 }), false, "natural 1 always fails");
  assert.equal(isAttackHit({ total: 18, natural: 9, defense: 18 }), true);
  assert.equal(isAttackHit({ total: 17, natural: 9, defense: 18 }), false);
});

test("sanity checks: at or under Sanity passes, natural 20 always fails, promotions have no naturals", () => {
  assert.equal(sanityCheckSucceeds({ total: 12, natural: 12, sanity: 12 }), true);
  assert.equal(sanityCheckSucceeds({ total: 13, natural: 13, sanity: 12 }), false);
  assert.equal(sanityCheckSucceeds({ total: 15, natural: 20, sanity: 16 }), false, "a natural 20 is a Big Failure");
  assert.equal(sanityCheckSucceeds({ total: 9, natural: 1, sanity: 4 }), false, "a natural 1 isn't a pass on its own");
  assert.equal(sanityCheckSucceeds({ total: 15, natural: 20, sanity: 16, isPromotion: true }), true, "no Big Failure on promotions");
});

/** An actor's prepared data: Agility 4, armor 2, Dodge +2 (Trained), Will 6, Physique 5. */
const target = ({ quick = false, status = {} } = {}) => ({
  attributes: { agi: { total: 4 } },
  defenses: { armor: 2, dodge: 2, physical: 18, will: 16, physique: 15 },
  statusModifiers: { defense: { agility: "full", dodge: "full", modifier: 0, ...status } },
  isQuickDodgable: quick,
});

test("each defense an attack can target", () => {
  const t = target();
  assert.equal(defenseValue(t, "physical"), 18, "the prepared Physical Defense");
  assert.equal(defenseValue(t, "physicalNoEvasion"), 12, "firearms: 10 + armor");
  assert.equal(defenseValue(target({ quick: true }), "physicalNoEvasion"), 18, "Quick Dodge keeps Agility and Dodge");
  assert.equal(defenseValue(target({ quick: true }), "physicalUndodgeable"), 12, "lightning: Quick Dodge doesn't help");
  assert.equal(defenseValue(t, "physicalNoArmor"), 16, "grapple: 10 + Agility + Dodge");
  assert.equal(defenseValue(t, "will"), 16);
  assert.equal(defenseValue(t, "physique"), 15);
  assert.equal(defenseValue(t, ""), null, "no hit check");
});

test("statuses still count when a part of Physical Defense is left out", () => {
  // Disadvantage: -2 on the Agility + Dodge part.
  const disadvantaged = target({ status: { modifier: -2 } });
  assert.equal(defenseValue(disadvantaged, "physicalNoArmor"), 14);
  assert.equal(defenseValue(disadvantaged, "physicalNoEvasion"), 12, "nothing left for the -2 to lower");
});

test("Luck burned on a roll adds up", () => {
  assert.equal(totalWithLuck(14, [2, -1, 3]), 18);
  assert.equal(totalWithLuck(14), 14);
});


test("a gun shot left blank is too fast to dodge; other blank actions have no hit check", () => {
  assert.equal(effectiveDefenseTarget({ defenseTarget: "", ammoUse: "fire" }), "physicalNoEvasion");
  assert.equal(effectiveDefenseTarget({ defenseTarget: "physical", ammoUse: "fire" }), "physical");
  assert.equal(effectiveDefenseTarget({ defenseTarget: "will" }), "will");
  assert.equal(effectiveDefenseTarget({ defenseTarget: "", ammoUse: "none" }), "");
  assert.equal(effectiveDefenseTarget({ defenseTarget: "" }), "");   // a spell
  assert.equal(effectiveDefenseTarget(undefined), "");
});

test("the GM is told when an attack with targets has no Defense Targeted", () => {
  const punch = { defenseTarget: "", actionType: "attack", damageRollMacro: "1d4" };
  assert.equal(isMissingDefenseTarget(punch, 1), true);
  assert.equal(isMissingDefenseTarget(punch, 0), false);                                   // nothing targeted
  assert.equal(isMissingDefenseTarget({ ...punch, defenseTarget: "physical" }, 1), false);
  assert.equal(isMissingDefenseTarget({ ...punch, ammoUse: "fire" }, 1), false);            // guns have a default
  assert.equal(isMissingDefenseTarget({ actionType: "quick", damageRollMacro: "2d6[fire]" }, 2), true);
  assert.equal(isMissingDefenseTarget({ actionType: "quick", damageRollMacro: "na" }, 2), false);   // Listen
  assert.equal(isMissingDefenseTarget({ actionType: "quick", damageRollMacro: "" }, 2), false);
});
