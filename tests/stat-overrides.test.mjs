import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// Real Handlebars and the system's templates: the sidebar boxes are rendered from stat-input.hbs.
import "./support/templates.mjs";
import { OVERRIDABLE_STATS, applyStatOverrides, overrideValue } from "../module/helpers/stat-overrides.mjs";

/*
 * NPC stat overrides (helpers/stat-overrides.mjs): the GM types over a sidebar stat and that number is used instead.
 * Foundry isn't loaded: the "system" here is a plain object shaped like a prepared actor's system data.
 */

/** A prepared NPC: Health 23, Sanity 14, Spirituality 9, Luck 3, Physical 18 (2 of it lost to statuses), Movement 18. */
function preparedSystem() {
  return {
    resources: { hp: { value: 20, max: 23 }, rp: { value: 14, max: 14 }, spp: { value: 9, max: 9 }, lp: { value: 3, max: 3 } },
    defenses: { armor: 0, dodge: 2, physical: 18, physique: 14, will: 14 },
    movement: 18,
  };
}
const statusChanges = { movement: -6, physicalDefense: -2 };


test("no overrides: every stat stays as calculated", () => {
  const system = preparedSystem();
  const info = applyStatOverrides(system, {}, statusChanges);
  assert.deepEqual(system, preparedSystem());
  assert.deepEqual(info.hpMax, { calculated: 23, base: 23, value: 23, statusChange: 0, isOverridden: false });
  // Calculated is before statuses: Loss of Balance took Movement from 24 to 18.
  assert.deepEqual(info.movement, { calculated: 24, base: 24, value: 18, statusChange: -6, isOverridden: false });
  assert.equal(Object.keys(info).length, OVERRIDABLE_STATS.length);
});

test("an override replaces the calculated number", () => {
  const system = preparedSystem();
  const info = applyStatOverrides(system, { hpMax: 45, sppMax: 30, willDefense: 17, physiqueDefense: 0 }, {});
  assert.equal(system.resources.hp.max, 45);
  assert.equal(system.resources.spp.max, 30);
  assert.equal(system.defenses.will, 17);
  assert.equal(system.defenses.physique, 0, "0 is an override, not 'none'");
  assert.equal(system.resources.hp.value, 20, "the current Health isn't touched");
  assert.deepEqual(info.hpMax, { calculated: 23, base: 45, value: 45, statusChange: 0, isOverridden: true });
  assert.equal(info.rpMax.isOverridden, false);
});

test("statuses still change an overridden Movement and Physical Defense, by as much as the calculated number", () => {
  const system = preparedSystem();
  const info = applyStatOverrides(system, { movement: 60, physicalDefense: 25 }, statusChanges);
  assert.equal(system.movement, 54);
  assert.equal(system.defenses.physical, 23);
  assert.deepEqual(info.movement, { calculated: 24, base: 60, value: 54, statusChange: -6, isOverridden: true });
});

test("statuses never take an override below 0", () => {
  const system = preparedSystem();
  applyStatOverrides(system, { movement: 3 }, { movement: -12 });
  assert.equal(system.movement, 0);
});

test("only Movement and Physical Defense have status changes", () => {
  const system = preparedSystem();
  const info = applyStatOverrides(system, { hpMax: 40 }, { hpMax: -5, movement: 0 });
  assert.equal(system.resources.hp.max, 40);
  assert.equal(info.hpMax.statusChange, 0);
});

test("blank, missing and non-numbers are no override", () => {
  for (const value of [null, undefined, "", "abc", NaN]) assert.equal(overrideValue(value), null, String(value));
  assert.equal(overrideValue(0), 0);
  assert.equal(overrideValue("12"), 12);

  const system = preparedSystem();
  const info = applyStatOverrides(system, { hpMax: "", movement: null, lpMax: undefined }, statusChanges);
  assert.deepEqual(system, preparedSystem());
  assert.equal(Object.values(info).some((stat) => stat.isOverridden), false);
});


/* ---- The sidebar boxes (templates/actor/parts/stat-input.hbs) ---- */

const renderBox = (stat, editable = true) => Handlebars.compile(
  '{{> "systems/lotm/templates/actor/parts/stat-input.hbs" stat=stats.box}}'
)({ stats: { box: stat }, editable });

test("player characters: a read-only box with the field's name, as before", () => {
  const html = renderBox({ key: "hpMax", name: "system.resources.hp.max", value: 23, canOverride: false });
  assert.match(html, /name="system\.resources\.hp\.max"/);
  assert.match(html, /value="23"/);
  assert.match(html, /readonly/);
  assert.doesNotMatch(html, /data-stat-override/);
});

test("NPCs: a box the GM can type in, with no name, so the sheet's form never saves it", () => {
  const stat = { key: "movement", name: "system.movement", value: 54, canOverride: true, base: 60, isOverridden: true,
    tooltip: "Set by the GM<br>Statuses: -6" };
  const html = renderBox(stat);
  assert.doesNotMatch(html, /\sname=/);
  assert.doesNotMatch(html, /readonly|disabled/);
  assert.match(html, /data-stat-override="movement"/);
  assert.match(html, /value="54"/, "shows the number now");
  assert.match(html, /data-shown="54"/);
  assert.match(html, /data-base="60"/, "and the override while typing");
  assert.match(html, /class="stat-override is-overridden"/);
  assert.match(html, /data-tooltip="Set by the GM&lt;br&gt;Statuses: -6"/);

  assert.match(renderBox({ ...stat, isOverridden: false }), /class="stat-override"/);
  assert.match(renderBox(stat, false), /disabled/, "locked when the sheet isn't editable");
});

test("the sidebar uses a stat box for every stat that can be overridden", () => {
  const sidebar = fs.readFileSync(new URL("../templates/actor/parts/sidebar.hbs", import.meta.url), "utf8");
  for (const { key, path } of OVERRIDABLE_STATS) {
    assert.match(sidebar, new RegExp(`stat-input\\.hbs" stat=stats\\.${key}\\}\\}`), key);
    assert.doesNotMatch(sidebar, new RegExp(`name="system\\.${path.replaceAll(".", "\\.")}"`), `${key}: no old box left`);
  }
});
