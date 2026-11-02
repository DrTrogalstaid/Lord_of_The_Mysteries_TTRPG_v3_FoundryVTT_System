import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * Area and zone effects (effects/effect-areas.mjs): the shapes, finding tokens inside, and the data for a zone's
 * Region, its caster's marker, and the copies handed out inside it. Foundry isn't loaded.
 */

globalThis.CONST = { REGION_VISIBILITY: { LAYER: 0, GAMEMASTER: 1, ALWAYS: 2 } };
globalThis.Handlebars = { escapeExpression: (text) => String(text ?? "") };
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };
const STRINGS = {
  "LORD_OF_THE_MYSTERIES.Effects.Zone.RegionName": "{effect} ({name})",
  "LORD_OF_THE_MYSTERIES.Effects.Zone.MarkerName": "Zone: {name}",
};
globalThis.game = {
  i18n: {
    localize: (key) => STRINGS[key] ?? key,
    format: (key, data = {}) => (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in data ? String(data[k]) : m)),
  },
  user: { color: { css: "#ff0000" } },
};
globalThis.canvas = { level: { id: "level1" } };

const {
  ZONE_BEHAVIOR_TYPE, emanationData, shapeData, tokensInside, zoneCopyData, zoneCopyIds, zoneMarkerData, zoneRegionData,
} = await import("../module/effects/effect-areas.mjs");

/** A 100 px grid of 5 ft spaces. */
const GRID = { size: 100, distance: 5, coneAngle: 60 };

/* -------------------------------------------- */
/*  Shapes                                       */
/* -------------------------------------------- */

test("shapes: sizes in scene units become pixels", () => {
  assert.deepEqual(shapeData("circle", 10, GRID), { x: 0, y: 0, rotation: 0, type: "circle", radius: 200 });
  assert.deepEqual(shapeData("cone", 15, GRID), { x: 0, y: 0, rotation: 0, type: "cone", radius: 300, angle: 60 });
  assert.deepEqual(shapeData("ray", 30, GRID), { x: 0, y: 0, rotation: 0, type: "line", length: 600, width: 100 },
    "a ray is one grid space wide");
  assert.deepEqual(shapeData("rectangle", 20, GRID), { x: 0, y: 0, rotation: 0, type: "rectangle", width: 400, height: 400 });
});

test("shapes: the cone uses Foundry's default angle when none is given; unknown shapes and emanations aren't placed", () => {
  assert.equal(shapeData("cone", 5, { size: 100, distance: 5 }).angle, 53.13);
  assert.equal(shapeData("emanation", 10, GRID), null);
  assert.equal(shapeData("hexagon", 10, GRID), null);
});

test("emanation: around the token, its size out from the token", () => {
  const token = { x: 300, y: 400, width: 2, height: 2, shape: 1 };
  assert.deepEqual(emanationData(token, 10, GRID), {
    type: "emanation",
    radius: 200,
    base: { type: "token", x: 300, y: 400, rotation: 0, width: 2, height: 2, shape: 1 },
  });
});

/* -------------------------------------------- */
/*  Who's inside                                 */
/* -------------------------------------------- */

/** A Region whose polygon tree says a point is inside when it's within `radius` of (cx, cy). */
const circleRegion = (cx, cy, radius) => ({
  polygonTree: { testPoint: ({ x, y }) => Math.hypot(x - cx, y - cy) <= radius },
});
const token = (name, x, y, extra = {}) => ({ name, getCenterPoint: () => ({ x, y }), ...extra });

test("tokens inside: by their center point", () => {
  const region = circleRegion(500, 500, 200);
  const tokens = [token("in", 550, 550), token("edge", 700, 500), token("out", 900, 900)];
  assert.deepEqual(tokensInside(region, tokens).map((t) => t.name), ["in", "edge"]);
});

test("tokens inside: only the current level's, when the scene has levels", () => {
  const region = circleRegion(0, 0, 1000);
  const tokens = [token("here", 0, 0, { level: "level1" }), token("upstairs", 0, 0, { level: "level2" }), token("no level", 0, 0)];
  assert.deepEqual(tokensInside(region, tokens, { level: "level1" }).map((t) => t.name), ["here", "no level"]);
  assert.equal(tokensInside(region, tokens).length, 3, "no level given: all of them");
});

test("tokens inside: a token without getCenterPoint uses its position and size on the grid", () => {
  const region = circleRegion(150, 150, 10);
  const plain = { name: "plain", x: 100, y: 100, width: 1, height: 1, parent: { grid: { size: 100 } } };
  assert.deepEqual(tokensInside(region, [plain]).map((t) => t.name), ["plain"]);
});

/* -------------------------------------------- */
/*  Zone data                                    */
/* -------------------------------------------- */

const caster = { name: "Klein", uuid: "Actor.klein" };
const spellEffect = {
  name: "Fog of Dread",
  img: "icons/svg/terror.svg",
  uuid: "Actor.klein.Item.fog.ActiveEffect.e1",
  parent: { documentName: "Item", uuid: "Actor.klein.Item.fog" },
  toObject: () => ({ duration: { value: 3, units: "rounds", startTime: 10, startRound: 1, startTurn: 0, combat: "c1" } }),
};

test("a zone's Region: the behavior hands out the effect with the caster as source, on the current level", () => {
  const data = zoneRegionData(spellEffect, caster, [{ type: "circle", radius: 200 }]);
  assert.equal(data.name, "Fog of Dread (Klein)");
  assert.equal(data.color, "#ff0000");
  assert.deepEqual(data.levels, ["level1"]);
  assert.equal(data.visibility, CONST.REGION_VISIBILITY.ALWAYS);
  assert.equal(data.attachment, undefined, "placed shapes aren't attached");
  assert.deepEqual(data.behaviors, [{
    name: "Fog of Dread",
    type: ZONE_BEHAVIOR_TYPE,
    system: { effects: [spellEffect.uuid], source: "Actor.klein", includeSource: false },
  }]);
  assert.deepEqual(data.flags.lotm, { zoneEffect: spellEffect.uuid, caster: "Actor.klein" });
});

test("an emanation zone is attached to the caster's token", () => {
  assert.deepEqual(zoneRegionData(spellEffect, caster, [], "tok1").attachment, { token: "tok1" });
});

test("the caster's marker: the effect's name and duration (not its start), and the zone's UUID", () => {
  const marker = zoneMarkerData(spellEffect, "Scene.s.Region.r");
  assert.equal(marker.name, "Zone: Fog of Dread");
  assert.equal(marker.img, "icons/svg/terror.svg");
  assert.deepEqual(marker.duration, { value: 3, units: "rounds" });
  assert.equal(marker.origin, "Actor.klein.Item.fog");
  assert.deepEqual(marker.system, { zone: "Scene.s.Region.r" });
  assert.equal(marker.statuses, undefined, "the marker itself does nothing");
});

/* -------------------------------------------- */
/*  Copies inside a zone                         */
/* -------------------------------------------- */

test("copies made by a zone have the behavior as origin, and are found by it", () => {
  const effect = {
    uuid: "Actor.klein.Item.fog.ActiveEffect.e1",
    parent: { documentName: "Item", uuid: "Actor.klein.Item.fog" },
    toObject: () => ({ _id: "e1", name: "Terrified", statuses: ["fear"], transfer: false, system: {} }),
  };
  const behaviorUuid = "Scene.s.Region.r.RegionBehavior.b";
  const [data] = zoneCopyData([effect, null], { source: "Actor.klein", behaviorUuid });
  assert.equal(data.origin, behaviorUuid);
  assert.equal(data.system.source, "Actor.klein");
  assert.equal(data._id, undefined);

  const actor = { effects: { contents: [{ id: "a", origin: behaviorUuid }, { id: "b", origin: "Item.other" }, { id: "c", origin: behaviorUuid }] } };
  assert.deepEqual(zoneCopyIds(actor, behaviorUuid), ["a", "c"]);
  assert.deepEqual(zoneCopyIds(null, behaviorUuid), []);
});
