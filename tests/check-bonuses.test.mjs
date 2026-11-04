import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * Check bonuses (helpers/check-bonuses.mjs): bonuses to rolls with an attribute that don't change the attribute.
 * Foundry isn't loaded: actors and effects are small stand-ins with only what the code reads.
 */

globalThis.CONFIG = { LORD_OF_THE_MYSTERIES: { attributes: { ins: "Inspiration", str: "Strength" } } };
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, data) => (key === "LORD_OF_THE_MYSTERIES.RollDialog.CheckBonus" ? `${data.attribute} check bonus` : key),
  },
};

const { checkBonusRows } = await import("../module/helpers/check-bonuses.mjs");

/** An effect with these changes (v14 style: system.changes, type "add"). */
const effect = (id, name, changes, { active = true } = {}) => ({ id, name, img: `${id}.webp`, active, system: { changes } });
const add = (key, value) => ({ key, value: String(value), type: "add" });

/** An actor whose prepared check bonuses are already worked out (as Foundry would after applying the effects). */
function actor(checkBonus, effects) {
  return {
    system: { attributes: { ins: { total: 6, checkBonus: checkBonus.ins ?? 0 }, str: { total: 4, checkBonus: checkBonus.str ?? 0 } } },
    allApplicableEffects: () => effects,
  };
}

test("Spirit Vision's +2: one row named after the effect, for Inspiration only", () => {
  const vision = effect("sv", "Spirit Vision", [add("system.attributes.ins.checkBonus", 2)]);
  const klein = actor({ ins: 2 }, [vision]);
  assert.deepEqual(checkBonusRows(klein, "ins"), [{ key: "checkBonus:ins:sv", label: "Spirit Vision", value: 2, img: "sv.webp" }]);
  assert.deepEqual(checkBonusRows(klein, "str"), [], "other attributes get nothing");
});

test("several effects: a row each; effects that are off don't count", () => {
  const klein = actor({ ins: 3 }, [
    effect("sv", "Spirit Vision", [add("system.attributes.ins.checkBonus", 2)]),
    effect("ch", "Charm", [add("system.attributes.ins.checkBonus", 1), add("system.attributes.str.beyonder_bonus", 5)]),
    effect("old", "Expired", [add("system.attributes.ins.checkBonus", 4)], { active: false }),
  ]);
  assert.deepEqual(checkBonusRows(klein, "ins").map((row) => [row.label, row.value]), [["Spirit Vision", 2], ["Charm", 1]]);
});

test("a bonus from something other than an Add change: one more row makes up the rest", () => {
  const klein = actor({ ins: 5 }, [effect("sv", "Spirit Vision", [add("system.attributes.ins.checkBonus", 2)])]);
  assert.deepEqual(checkBonusRows(klein, "ins").map((row) => [row.label, row.value]),
    [["Spirit Vision", 2], ["Inspiration check bonus", 3]]);
});

test("older effects that store Add as mode 2 count too; nothing at all gives no rows", () => {
  const klein = actor({ ins: 2 }, [effect("sv", "Spirit Vision", [{ key: "system.attributes.ins.checkBonus", value: "2", mode: 2 }])]);
  assert.equal(checkBonusRows(klein, "ins")[0].value, 2);
  assert.deepEqual(checkBonusRows(actor({}, []), "ins"), []);
  assert.deepEqual(checkBonusRows(null, "ins"), []);
});
