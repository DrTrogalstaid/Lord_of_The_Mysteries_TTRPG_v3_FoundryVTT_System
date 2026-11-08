import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * "Action Used" expiry (effects/action-expiry.mjs): counting uses, and when an effect runs out.
 * Foundry isn't loaded: actions and effects are small stand-ins.
 */

const { actionKeys, countActionUse, resetExpiryEvents, rowCountsUse, usesLeft } = await import("../module/effects/action-expiry.mjs");

const SMITE = "Compendium.lotm.action_compendium.Item.smite";
const DODGE = "Compendium.lotm.action_compendium.Item.dodge";
const OWNED_SMITE = "Actor.klein.Item.smite1";

/** An effect stand-in. */
function makeEffect(expiryEvents, actionList = []) {
  return { system: { expiryEvents, actionList } };
}


test("an action is known by its own UUID and the compendium entry it came from", () => {
  assert.deepEqual([...actionKeys({ uuid: SMITE })], [SMITE]);
  assert.deepEqual([...actionKeys({ uuid: OWNED_SMITE, _stats: { compendiumSource: SMITE } })], [OWNED_SMITE, SMITE]);
  assert.deepEqual([...actionKeys({ uuid: OWNED_SMITE, flags: { core: { sourceId: SMITE } } })], [OWNED_SMITE, SMITE]);
  assert.equal(actionKeys(null).size, 0);
});


test("which rows count a use", () => {
  const smite = actionKeys({ uuid: OWNED_SMITE, _stats: { compendiumSource: SMITE } });
  // A row for one action: only that action (an owned copy of it counts).
  assert.equal(rowCountsUse({ actionUuid: SMITE }, makeEffect([]), smite), true);
  assert.equal(rowCountsUse({ actionUuid: DODGE }, makeEffect([]), smite), false);
  // No action on the row: the effect's granted actions...
  assert.equal(rowCountsUse({ actionUuid: "" }, makeEffect([], [SMITE]), smite), true);
  assert.equal(rowCountsUse({ actionUuid: "" }, makeEffect([], [DODGE]), smite), false);
  // ...or any action, when it grants none.
  assert.equal(rowCountsUse({ actionUuid: "" }, makeEffect([]), smite), true);
  // Other row types don't count action uses.
  assert.equal(rowCountsUse({ type: "somethingElse", actionUuid: SMITE }, makeEffect([]), smite), false);
});


test("counting: up by one, ends when a row reaches its uses", () => {
  const keys = actionKeys({ uuid: SMITE });
  const effect = makeEffect([{ type: "actionUsed", actionUuid: SMITE, uses: 3, used: 1 }]);
  const once = countActionUse(effect, keys);
  assert.equal(once.changed, true);
  assert.equal(once.expired, false);
  assert.equal(once.events[0].used, 2);
  assert.equal(effect.system.expiryEvents[0].used, 1, "the effect's own rows aren't changed");

  const last = countActionUse(makeEffect(once.events), keys);
  assert.equal(last.expired, true);
  assert.equal(last.ended.actionUuid, SMITE);
});


test("several rows: whichever comes first ends it", () => {
  const effect = makeEffect([
    { type: "actionUsed", actionUuid: SMITE, uses: 3, used: 0 },
    { type: "actionUsed", actionUuid: DODGE, uses: 1, used: 0 },
  ]);
  const smite = countActionUse(effect, actionKeys({ uuid: SMITE }));
  assert.deepEqual([smite.expired, smite.events.map((row) => row.used)], [false, [1, 0]]);
  const dodge = countActionUse(makeEffect(smite.events), actionKeys({ uuid: DODGE }));
  assert.deepEqual([dodge.expired, dodge.ended.actionUuid], [true, DODGE]);
});


test("an action no row counts changes nothing", () => {
  const result = countActionUse(makeEffect([{ type: "actionUsed", actionUuid: SMITE, uses: 1, used: 0 }]), actionKeys({ uuid: DODGE }));
  assert.deepEqual([result.changed, result.expired], [false, false]);
  assert.deepEqual(countActionUse(makeEffect(undefined), actionKeys({ uuid: DODGE })).changed, false);
});


test("uses left, and fresh copies", () => {
  assert.equal(usesLeft({ uses: 3, used: 1 }), 2);
  assert.equal(usesLeft({ uses: 1, used: 5 }), 0);
  assert.equal(usesLeft({}), 1);
  assert.deepEqual(resetExpiryEvents([{ actionUuid: SMITE, uses: 2, used: 2 }]), [{ actionUuid: SMITE, uses: 2, used: 0 }]);
  assert.deepEqual(resetExpiryEvents(undefined), []);
});
