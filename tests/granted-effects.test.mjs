import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * Passive effects of granted abilities (effects/granted-effects.mjs): which get copied where, and what a sync changes.
 * Foundry isn't loaded: abilities and effects are small stand-ins.
 */

const { diffGrantedEffects, grantedCopyData, planGrantedEffects } = await import("../module/effects/granted-effects.mjs");

/** An effect on an ability. */
function makeEffect(id, { transfer = true, modifiedTime = 100, disabled = false, name = `Effect ${id}` } = {}) {
  return {
    id, transfer, disabled, name, _stats: { modifiedTime },
    toObject() {
      return structuredClone({
        _id: id, name, type: "effect", transfer, disabled, origin: "Compendium.lotm.ability_compendium.Item.x",
        start: { time: 1 }, duration: { value: null, startTime: 5 },
        system: { changes: [{ key: "system.attributes.ins.beyonder_bonus", value: "2" }], impliedBy: "x", turnChecks: ["a"] },
      });
    },
  };
}

/** An ability with these effects. */
const makeAbility = (name, effects = []) => ({ documentName: "Item", type: "ability", name, effects });

const SPIRIT_VISION = "Compendium.lotm.ability_compendium.Item.spiritVision";
const DANGER_SENSE = "Compendium.lotm.ability_compendium.Item.dangerSense";

/* -------------------------------------------- */
/*  Planning                                     */
/* -------------------------------------------- */

test("a granted ability's passive effects are planned onto its granter; handed-out ones aren't", () => {
  const vision = makeAbility("Spirit Vision", [makeEffect("p1"), makeEffect("a1", { transfer: false })]);
  const planned = planGrantedEffects({
    ownedAbilities: [],
    granters: [{ id: "seer", abilities: [{ uuid: SPIRIT_VISION, doc: vision }] }],
  });
  assert.deepEqual(planned.map((p) => [p.granterId, p.abilityUuid, p.effect.id]), [["seer", SPIRIT_VISION, "p1"]]);
});

test("an ability the actor owns isn't copied: by its compendium source, or by its name", () => {
  const vision = makeAbility("Spirit Vision", [makeEffect("p1")]);
  const granters = [{ id: "seer", abilities: [{ uuid: SPIRIT_VISION, doc: vision }] }];
  assert.equal(planGrantedEffects({ ownedAbilities: [{ key: SPIRIT_VISION, name: "Other" }], granters }).length, 0);
  assert.equal(planGrantedEffects({ ownedAbilities: [{ key: "Actor.a.Item.b", name: "spirit vision" }], granters }).length, 0);
});

test("each ability once: two granters, or two abilities with the same name, give one set of copies on the first", () => {
  const vision = makeAbility("Spirit Vision", [makeEffect("p1")]);
  const visionCopy = makeAbility("Spirit Vision", [makeEffect("p9")]);
  const planned = planGrantedEffects({
    ownedAbilities: [],
    granters: [
      { id: "seer", abilities: [{ uuid: SPIRIT_VISION, doc: vision }] },
      { id: "charm", abilities: [{ uuid: SPIRIT_VISION, doc: vision }, { uuid: "Item.worldVision", doc: visionCopy }] },
    ],
  });
  assert.deepEqual(planned.map((p) => `${p.granterId}:${p.effect.id}`), ["seer:p1"]);
});

test("NPC hidden grants: the hidden ability, and abilities with its name, aren't copied", () => {
  const vision = makeAbility("Spirit Vision", [makeEffect("p1")]);
  const sense = makeAbility("Danger Sense", [makeEffect("p2")]);
  const granters = [{ id: "seer", abilities: [{ uuid: SPIRIT_VISION, doc: vision }, { uuid: DANGER_SENSE, doc: sense }] }];
  const byUuid = planGrantedEffects({ ownedAbilities: [], granters, hiddenGrants: new Set([SPIRIT_VISION]) });
  assert.deepEqual(byUuid.map((p) => p.effect.id), ["p2"]);
  const byName = planGrantedEffects({ ownedAbilities: [], granters, hiddenNames: new Set(["danger sense"]) });
  assert.deepEqual(byName.map((p) => p.effect.id), ["p1"]);
});

test("missing abilities and non-abilities in the list are skipped", () => {
  const planned = planGrantedEffects({
    ownedAbilities: [],
    granters: [{ id: "seer", abilities: [
      { uuid: "Item.gone", doc: null },
      { uuid: "Item.spell", doc: { documentName: "Item", type: "spell", name: "Fireball", effects: [makeEffect("x")] } },
      { uuid: "", doc: null },
    ] }],
  });
  assert.equal(planned.length, 0);
});

/* -------------------------------------------- */
/*  Copy data                                    */
/* -------------------------------------------- */

test("a copy: passive, on the granter, tagged with the ability, its effect and when it was edited", () => {
  const data = grantedCopyData(makeEffect("p1", { modifiedTime: 123 }), { abilityUuid: SPIRIT_VISION, origin: "Actor.k.Item.seer" });
  assert.equal(data._id, undefined);
  assert.equal(data.start, undefined);
  assert.deepEqual(data.duration, { value: null });
  assert.equal(data.transfer, true);
  assert.equal(data.origin, "Actor.k.Item.seer");
  assert.equal(data.system.grantedFrom, SPIRIT_VISION);
  assert.equal(data.system.grantedEffectId, "p1");
  assert.equal(data.system.grantedModifiedTime, 123);
  assert.equal(data.system.changes.length, 1, "the changes are copied");
  assert.equal(data.system.impliedBy, "");
  assert.deepEqual(data.system.turnChecks, []);
  assert.equal(grantedCopyData(makeEffect("p1"), { abilityUuid: SPIRIT_VISION, disabled: true }).disabled, true);
});

/* -------------------------------------------- */
/*  Diff                                         */
/* -------------------------------------------- */

/** A copy already on a granter. */
const copy = (id, { grantedFrom = SPIRIT_VISION, grantedEffectId = "p1", grantedModifiedTime = 100, disabled = false } = {}) =>
  ({ id, disabled, system: { grantedFrom, grantedEffectId, grantedModifiedTime } });

const planOne = (effect) => [{ granterId: "seer", granterUuid: "Actor.k.Item.seer", abilityUuid: SPIRIT_VISION, ability: {}, effect }];

test("nothing there yet: one copy made", () => {
  const { create, remove } = diffGrantedEffects(planOne(makeEffect("p1")), []);
  assert.equal(create.length, 1);
  assert.equal(create[0].granterId, "seer");
  assert.equal(create[0].data.origin, "Actor.k.Item.seer");
  assert.deepEqual(remove, []);
});

test("an up-to-date copy is kept", () => {
  const { create, remove } = diffGrantedEffects(planOne(makeEffect("p1")), [{ granterId: "seer", effect: copy("c1") }]);
  assert.deepEqual(create, []);
  assert.deepEqual(remove, []);
});

test("the ability's effect was edited since: the copy is replaced, and stays off if it was off", () => {
  const { create, remove } = diffGrantedEffects(planOne(makeEffect("p1", { modifiedTime: 200 })),
    [{ granterId: "seer", effect: copy("c1", { disabled: true }) }]);
  assert.deepEqual(remove, [{ granterId: "seer", id: "c1" }]);
  assert.equal(create.length, 1);
  assert.equal(create[0].data.disabled, true);
  assert.equal(create[0].data.system.grantedModifiedTime, 200);
});

test("copies of abilities no longer granted, and duplicates, are removed", () => {
  const existing = [
    { granterId: "seer", effect: copy("c1") },
    { granterId: "seer", effect: copy("c2") },                                      // a duplicate of c1
    { granterId: "seer", effect: copy("c3", { grantedFrom: DANGER_SENSE }) },       // no longer granted
    { granterId: "charm", effect: copy("c4") },                                     // granted by the Sequence instead now
  ];
  const { create, remove } = diffGrantedEffects(planOne(makeEffect("p1")), existing);
  assert.deepEqual(create, []);
  assert.deepEqual(remove.map((r) => r.id).sort(), ["c2", "c3", "c4"]);
});

test("nothing planned: every copy goes", () => {
  const { create, remove } = diffGrantedEffects([], [{ granterId: "seer", effect: copy("c1") }]);
  assert.deepEqual(create, []);
  assert.deepEqual(remove, [{ granterId: "seer", id: "c1" }]);
});
