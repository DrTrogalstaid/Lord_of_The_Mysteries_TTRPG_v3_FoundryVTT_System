import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Spirit Vision and Death Vision (module/canvas/): aura colours and range, the shader code and its presets, the
 * Ethereal status, and - with small stand-ins for Foundry's classes - the shader classes, the senses, the player
 * setting, the per-frame shader values and the token's aura. Foundry isn't loaded, so the shader itself (GLSL on
 * the graphics card) is checked in Foundry: tests/MANUAL_QA.md, "Spirit Vision and Death Vision".
 */

/* -------------------------------------------- */
/*  Stand-ins for Foundry                        */
/* -------------------------------------------- */

class FakeDataModel {
  constructor(data = {}, options = {}) {
    Object.assign(this, data);
    this._source = { ...data };
    this.animated = options.animated ?? false;
  }
  toObject() {
    return { ...this._source };
  }
}
class FakeVisionMode extends FakeDataModel {
  static LIGHTING_VISIBILITY = { DISABLED: 0, ENABLED: 1, REQUIRED: 2 };
}
class FakeDetectionMode extends FakeDataModel {
  static DETECTION_TYPES = { SIGHT: 0, SOUND: 1, MOVE: 2, OTHER: 3 };
  _canDetect() {
    return true;
  }
  /** Like Foundry's: in range, and in line of sight. */
  _testPoint(visionSource, mode, target, test) {
    return this._testRange(visionSource, mode, target, test) && this._testLOS(visionSource, mode, target, test);
  }
  /** Foundry's plain line of sight: clear, unless the test says walls are in the way. */
  _testLOS(visionSource, mode, target, test) {
    return !test.behindWalls;
  }
  /** Inside the token's field of view, unless the test says not. */
  _testAngle(visionSource, mode, target, test) {
    return !test.outsideView;
  }
  /** Like Foundry's: null is no limit. 20 px per foot (a 100 px grid of 5 ft squares). */
  _testRange(visionSource, mode, target, test) {
    if (mode.range === null) return true;
    return Math.hypot(test.point.x - visionSource.x, test.point.y - visionSource.y) <= mode.range * 20;
  }
}
/** Foundry's own senses are their own classes; the system wraps them. */
class FakeBasicSight extends FakeDetectionMode {}

/** A token on the canvas: position, size, statuses, actor, and its own senses. */
class FakeToken {
  constructor({ x = 0, y = 0, size = 100, actor = null, statuses = [], sightRange = 0, detectionModes = {}, visionMode = "basic" } = {}) {
    this.center = { x, y };
    this.w = size;
    this.h = size;
    this.actor = actor;
    this.visible = true;
    this.detectionFilter = null;
    this.statuses = new Set(statuses);
    this.document = {
      hasStatusEffect: (id) => this.statuses.has(id),
      sight: { range: sightRange, visionMode },
      detectionModes,
    };
    this.renderFlags = { set: (flags) => (this.flagsSet = flags) };
  }
  _refreshVisibility() {}
  _onUpdate() {}
  initializeVisionSource() {
    this.visionInitialized = (this.visionInitialized ?? 0) + 1;
  }
  _getVisionSourceData() {
    return { x: this.center.x, y: this.center.y, visionMode: this.document.sight.visionMode };
  }
  _renderDetectionFilter() {
    this.drewDetectionFilter = true;
  }
  _onApplyStatusEffect() {}
  _destroy() {}
}

/** Foundry's base class for filters (the aura is one). */
class FakeAbstractBaseFilter {
  padding = 0;
  static get defaultUniforms() {
    return {};
  }
  static create(uniforms = {}) {
    const filter = new this();
    filter.uniforms = { ...this.defaultUniforms, ...uniforms };
    filter.vertex = this._createVertexShader?.();
    filter.fragment = this._createFragmentShader?.();
    return filter;
  }
  destroy() {}
}
/** Foundry's sprite shader: what draws the scene picture on screen. */
const FOUNDRY_SPRITE_VERTEX = "attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n"
  + "uniform mat3 projectionMatrix;\nvarying vec2 vUvs;\nvoid main() { vUvs = aTextureCoord; }";
class FakeBaseSamplerShader {
  static classPluginName = "batch";
  static pausable = true;
  constructor(uniforms) {
    this.uniforms = { ...uniforms };
  }
  static get defaultUniforms() {
    return { sampler: 0, tintAlpha: [1, 1, 1, 1] };
  }
  static _createVertexShader() {
    return FOUNDRY_SPRITE_VERTEX;
  }
  static _createFragmentShader() {
    return "FOUNDRY'S FRAGMENT";
  }
  _preRender(mesh) {
    this.uniforms.sampler = mesh.texture;
  }
}

globalThis.foundry = {
  canvas: {
    perception: { VisionMode: FakeVisionMode, DetectionMode: FakeDetectionMode },
    rendering: {
      shaders: { BaseSamplerShader: FakeBaseSamplerShader },
      filters: { AbstractBaseFilter: FakeAbstractBaseFilter },
    },
    placeables: { Token: FakeToken },
  },
};

const settings = new Map();
let reduceEffects = false;
const hooks = [];
globalThis.game = {
  settings: {
    register: (namespace, key, config) => settings.set(`${namespace}.${key}`, config),
    get: () => reduceEffects,
  },
};
globalThis.Hooks = { on: (name) => hooks.push(name) };
globalThis.PIXI = { Texture: { WHITE: "plain white" } };

/** A fresh CONFIG, with Foundry's ordinary senses. */
function resetConfig() {
  globalThis.CONFIG = {
    specialStatusEffects: { ETHEREAL: "ethereal" },
    Canvas: {
      visionModes: {},
      detectionModes: {
        basicSight: new FakeBasicSight({ id: "basicSight", label: "Basic Sight", type: 0 }),
        lightPerception: new FakeDetectionMode({ id: "lightPerception", label: "Light Perception", type: 0 }),
        seeAll: new FakeDetectionMode({ id: "seeAll", label: "See All", type: 0 }),
      },
    },
  };
}
resetConfig();

const aura = await import("../module/canvas/spirit-aura.mjs");
const glsl = await import("../module/canvas/spirit-vision-glsl.mjs");
const shaders = await import("../module/canvas/spirit-vision-shader.mjs");
const spirit = await import("../module/canvas/spirit-vision.mjs");
const { LordOfTheMysteriesToken } = await import("../module/canvas/token.mjs");
spirit.registerSpiritVision();

const EN = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")).LORD_OF_THE_MYSTERIES;

/** Round a colour so tests can compare it. */
const round = (color) => color.map((channel) => Math.round(channel * 1000) / 1000);
const HP = (value, max = 10) => ({ value, max });

/* -------------------------------------------- */
/*  Aura colours and range (spirit-aura.mjs)     */
/* -------------------------------------------- */

test("colours: #rrggbb and #rgb, anything else is no colour", () => {
  assert.deepEqual(aura.hexToRgb("#ff0000"), [1, 0, 0]);
  assert.deepEqual(aura.hexToRgb("0f0"), [0, 1, 0]);
  assert.equal(aura.hexToRgb(""), null);
  assert.equal(aura.hexToRgb("red"), null);
  assert.equal(aura.hexToRgb(undefined), null);
});

test("health ratio: 0 to 1, below 0 counts as none, no maximum counts as healthy", () => {
  assert.equal(aura.healthRatio(HP(5)), 0.5);
  assert.equal(aura.healthRatio(HP(-3)), 0);
  assert.equal(aura.healthRatio(HP(14)), 1);
  assert.equal(aura.healthRatio(HP(0, 0)), 1);
  assert.equal(aura.healthRatio(undefined), 1);
});

test("Spirit Vision: gold when healthy, deep red when hurt, in between at half", () => {
  const spiritOf = (hp) => round(aura.auraGlowColor({ vision: "spirit", hp }));
  assert.deepEqual(spiritOf(HP(10)), round([...aura.hexToRgb(aura.AURA_COLORS.healthy), 1]));
  assert.deepEqual(spiritOf(HP(0)), round([...aura.hexToRgb(aura.AURA_COLORS.hurt), 1]));
  assert.deepEqual(spiritOf(HP(-4)), spiritOf(HP(0)), "below 0 is the same as 0");
  const healthy = aura.hexToRgb(aura.AURA_COLORS.healthy);
  const hurt = aura.hexToRgb(aura.AURA_COLORS.hurt);
  assert.deepEqual(spiritOf(HP(5)), round([...healthy.map((c, i) => (c + hurt[i]) / 2), 1]));
});

test("Spirit Vision: a set aura colour wins; Ethereal without one is pale blue; a bad colour falls back to Health", () => {
  assert.deepEqual(aura.auraGlowColor({ vision: "spirit", hp: HP(2), auraColor: "#ff3355", isEthereal: true }),
    [...aura.hexToRgb("#ff3355"), 1]);
  assert.deepEqual(aura.auraGlowColor({ vision: "spirit", isEthereal: true }), [...aura.hexToRgb(aura.AURA_COLORS.spirit), 1]);
  assert.deepEqual(aura.auraGlowColor({ vision: "spirit", hp: HP(10), auraColor: "oops" }),
    aura.auraGlowColor({ vision: "spirit", hp: HP(10) }));
});

test("Death Vision: full pale green for Ethereal and undead; the living faint, brighter near death", () => {
  const full = [...aura.hexToRgb(aura.AURA_COLORS.death), 1];
  assert.deepEqual(aura.auraGlowColor({ vision: "death", isEthereal: true }), full);
  assert.deepEqual(aura.auraGlowColor({ vision: "death", isUndead: true, hp: HP(10) }), full);
  const healthy = aura.auraGlowColor({ vision: "death", hp: HP(10) });
  const dying = aura.auraGlowColor({ vision: "death", hp: HP(0) });
  assert.deepEqual(healthy.slice(0, 3), full.slice(0, 3), "the same pale green...");
  assert.ok(healthy[3] < dying[3], "...stronger the closer to death");
  assert.deepEqual(round(dying), round(full), "at 0 Health it's as bright as a spirit");
  assert.deepEqual(aura.auraGlowColor({ vision: "death", auraColor: "#ff0000", hp: HP(0) }), dying,
    "the Spirit Vision aura colour doesn't change Death Vision");
});

test("an unknown vision has no aura", () => {
  assert.equal(aura.auraGlowColor({ vision: "basic" }), null);
});

test("aura reach: the farthest spirit sense that's on; no limit wins; sight range when none is on", () => {
  const on = (range) => ({ enabled: true, range });
  const off = (range) => ({ enabled: false, range });
  assert.equal(aura.auraReach([on(10), on(30)], 5), 30);
  assert.equal(aura.auraReach([on(10), off(60)], 5), 10, "a sense that's off doesn't count");
  assert.equal(aura.auraReach([on(10), on(null)], 5), null);
  assert.equal(aura.auraReach([undefined, off(60)], 5), 5);
});

test("range reaches the creature's edge; no range means no limit", () => {
  // 100 px grid of 5 ft spaces: 20 px per foot. A 100 px token: 50 px from centre to edge.
  const near = { viewer: { x: 0, y: 0 }, target: { x: 650, y: 0, size: 100 }, distancePixels: 20 };
  assert.equal(aura.isWithinSpiritRange({ ...near, range: 30 }), true, "600 px of range + 50 px to its edge");
  assert.equal(aura.isWithinSpiritRange({ ...near, target: { x: 651, y: 0, size: 100 }, range: 30 }), false);
  assert.equal(aura.isWithinSpiritRange({ ...near, range: null }), true);
  assert.equal(aura.isWithinSpiritRange({ ...near, range: undefined }), true);
});

/* -------------------------------------------- */
/*  Shader code (spirit-vision-glsl.mjs)         */
/* -------------------------------------------- */

test("shader code: every preset setting and per-frame value is a uniform; the vertex shader gives both positions", () => {
  const keys = Object.keys(glsl.SPIRIT_VISION_UNIFORMS);
  assert.deepEqual(Object.keys(glsl.DEATH_VISION_UNIFORMS), keys, "both presets have the same settings");
  for (const key of [...keys, "lotmTime", "lotmGridUv", "lotmScreenToGrid", "lotmVisionMask", "lotmTokens", "lotmTokenCount",
    "sampler", "tintAlpha"]) {
    assert.match(glsl.SPIRIT_VISION_FRAGMENT, new RegExp(`uniform\\s+\\w+\\s+${key}\\b`), key);
  }
  for (const varying of ["vUvs", "vLotmScreen"]) {
    assert.match(glsl.SPIRIT_VISION_VERTEX, new RegExp(`varying\\s+vec2\\s+${varying}\\b`), varying);
    assert.match(glsl.SPIRIT_VISION_FRAGMENT, new RegExp(`varying\\s+vec2\\s+${varying}\\b`), varying);
  }
  assert.match(glsl.SPIRIT_VISION_VERTEX, /uniform\s+vec2\s+screenDimensions\b/);
  assert.ok(glsl.SPIRIT_VISION_FRAGMENT.indexOf("float lotmHash") < glsl.SPIRIT_VISION_FRAGMENT.indexOf("void main"),
    "helpers come before main()");
});

test("shader code: only replaces Foundry's sprite shader when it has the inputs ours uses", () => {
  assert.equal(glsl.isSpriteCodeCompatible(FOUNDRY_SPRITE_VERTEX), true);
  assert.equal(glsl.isSpriteCodeCompatible("#version 300 es\nin vec2 aVertexPosition; in vec2 aTextureCoord; uniform mat3 projectionMatrix;"),
    true, "a newer GLSL version with the same names is fine");
  assert.equal(glsl.isSpriteCodeCompatible(FOUNDRY_SPRITE_VERTEX.replaceAll("aTextureCoord", "aUv")), false, "renamed");
  assert.equal(glsl.isSpriteCodeCompatible("attribute vec2 aVertexPositionX; attribute vec2 aTextureCoord; uniform mat3 projectionMatrix;"),
    false, "whole names only");
  assert.equal(glsl.isSpriteCodeCompatible(undefined), false);
});

test("camera: a spot on screen turns back into the right spot on the map", () => {
  // Half zoom, the camera centred on map point (1000, 800) of a 1000 x 800 screen, 100 px grid squares.
  const camera = { zoom: 0.5, pivot: { x: 1000, y: 800 }, position: { x: 500, y: 400 }, screen: [1000, 800], gridSize: 100 };
  const { lotmGridUv, lotmScreenToGrid } = glsl.cameraUniforms(camera);
  assert.deepEqual(lotmGridUv, [0.05, 0.0625], "a grid square is 50 px on screen");

  // Map point (1200, 900) is drawn at screen (1200 - 1000) * 0.5 + 500 = 600 and (900 - 800) * 0.5 + 400 = 450.
  const screenSpot = [600 / 1000, 450 / 800];
  const [xScale, yScale, xOffset, yOffset] = lotmScreenToGrid;
  const onMap = [screenSpot[0] * xScale + xOffset, screenSpot[1] * yScale + yOffset];
  assert.deepEqual(onMap.map((n) => Math.round(n * 1e9) / 1e9), [12, 9], "map point (1200, 900) is grid square (12, 9)");
});

test("token areas: grid squares, the ones nearest the middle of the screen first, at most MAX_TOKENS", () => {
  const near = { x: 150, y: 250, width: 100, height: 200 };
  const far = { x: 5000, y: 0, width: 100, height: 100 };
  const { lotmTokens, lotmTokenCount } = glsl.tokenAreaUniforms([far, near], { gridSize: 100, focus: { x: 0, y: 0 } });
  assert.equal(lotmTokenCount, 2);
  assert.equal(lotmTokens.length, glsl.MAX_TOKENS * 4, "always the full size the shader expects");
  assert.deepEqual([...lotmTokens.slice(0, 8)], [1.5, 2.5, 0.5, 1, 50, 0, 0.5, 0.5], "nearest first; centre and half size");

  const crowd = Array.from({ length: glsl.MAX_TOKENS + 5 }, (_, i) => ({ x: i * 100, y: 0, width: 100, height: 100 }));
  const many = glsl.tokenAreaUniforms(crowd, { gridSize: 100, focus: { x: 0, y: 0 } });
  assert.equal(many.lotmTokenCount, glsl.MAX_TOKENS);
  assert.equal(many.lotmTokens.at(-4), glsl.MAX_TOKENS - 1, "the farthest ones are left out");
  assert.match(glsl.SPIRIT_VISION_FRAGMENT, new RegExp(`#define LOTM_MAX_TOKENS ${glsl.MAX_TOKENS}\\b`));
});

/* -------------------------------------------- */
/*  Shader classes (spirit-vision-shader.mjs)    */
/* -------------------------------------------- */

test("shader classes: Foundry's uniforms plus the preset; Death Vision uses its own preset", () => {
  const spiritUniforms = shaders.SpiritVisionShader.defaultUniforms;
  assert.deepEqual(spiritUniforms.tintAlpha, [1, 1, 1, 1], "Foundry's are kept");
  assert.equal(spiritUniforms.lotmTintStrength, glsl.SPIRIT_VISION_UNIFORMS.lotmTintStrength);
  assert.equal(shaders.DeathVisionShader.defaultUniforms.lotmTintStrength, glsl.DEATH_VISION_UNIFORMS.lotmTintStrength);
  assert.deepEqual(shaders.DeathVisionShader.defaultUniforms.lotmGridUv, [0, 0]);
  assert.deepEqual(shaders.DeathVisionShader.defaultUniforms.screenDimensions, [1, 1]);
});

test("shader classes: drawn on their own (not batched), never paused, with our shader code", () => {
  for (const Shader of [shaders.SpiritVisionShader, shaders.DeathVisionShader]) {
    assert.equal(Shader.classPluginName, null, Shader.name);
    assert.equal(Shader.pausable, false, Shader.name);
    assert.equal(Shader._createVertexShader(), glsl.SPIRIT_VISION_VERTEX, Shader.name);
    assert.equal(Shader._createFragmentShader(), glsl.SPIRIT_VISION_FRAGMENT, Shader.name);
  }
});

test("shader classes: Foundry's sprite shader renamed its inputs: Foundry's own code, and one warning", async () => {
  class RenamedSamplerShader extends FakeBaseSamplerShader {
    static _createVertexShader() {
      return "in vec2 aPosition; in vec2 aUv; uniform mat3 uProjection;";
    }
  }
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  foundry.canvas.rendering.shaders.BaseSamplerShader = RenamedSamplerShader;
  try {
    const renamed = await import("../module/canvas/spirit-vision-shader.mjs?renamed");
    assert.equal(renamed.SpiritVisionShader._createVertexShader(), RenamedSamplerShader._createVertexShader());
    assert.equal(renamed.DeathVisionShader._createFragmentShader(), "FOUNDRY'S FRAGMENT");
  } finally {
    foundry.canvas.rendering.shaders.BaseSamplerShader = FakeBaseSamplerShader;
    console.warn = realWarn;
  }
  assert.equal(warnings.length, 1, "checked once");
  assert.match(warnings[0], /^LotM \| /);
});

test("each frame: picture, vision mask, clock and camera; only the camera (not the token) places the ripples", () => {
  globalThis.canvas = {
    masks: { vision: { renderTexture: "what can be seen right now" } },
    dimensions: { size: 100 },
    app: { ticker: { lastTime: 3_605_000 } },
    stage: { scale: { x: 0.5 }, pivot: { x: 1000, y: 800 }, position: { x: 500, y: 400 } },
    screenDimensions: [1000, 800],
  };
  const shader = new shaders.SpiritVisionShader(shaders.SpiritVisionShader.defaultUniforms);
  const picture = { texture: "the scene picture" };
  shader._preRender(picture, {});
  assert.equal(shader.uniforms.sampler, "the scene picture", "Foundry's part still runs");
  assert.equal(shader.uniforms.lotmVisionMask, "what can be seen right now", "Foundry's vision mask");
  assert.deepEqual(shader.uniforms.screenDimensions, [1000, 800]);
  assert.equal(Math.round(shader.uniforms.lotmTime * 1000) / 1000, 5, "wraps every hour");
  assert.deepEqual(shader.uniforms.lotmGridUv, [0.05, 0.0625], "a 100 px square at half zoom on a 1000 x 800 screen");
  const before = shader.uniforms.lotmScreenToGrid;
  assert.deepEqual(before, glsl.cameraUniforms({
    zoom: 0.5, pivot: canvas.stage.pivot, position: canvas.stage.position, screen: [1000, 800], gridSize: 100,
  }).lotmScreenToGrid);

  canvas.stage.pivot = { x: 1100, y: 800 };
  shader._preRender(picture, {});
  assert.notDeepEqual(shader.uniforms.lotmScreenToGrid, before, "panning the camera does change it");

  canvas.photosensitiveMode = true;
  shader._preRender(picture, {});
  assert.equal(shader.uniforms.lotmTime, 0, "Photosensitive Mode stops the movement");

  delete canvas.masks;
  shader._preRender(picture, {});
  assert.equal(shader.uniforms.lotmVisionMask, "plain white", "no vision mask: recolour everything rather than nothing");
  assert.equal(shader.uniforms.lotmTokenCount, 0, "no tokens layer: no tokens");

  // Tokens: only the ones this player can see, with their art's size (scaled art is bigger than its space).
  const placed = (x, visible, scaleX = 1) => ({ visible, center: { x, y: 0 }, w: 100, h: 100, document: { texture: { scaleX, scaleY: 1 } } });
  canvas.tokens = { placeables: [placed(1100, true, -1.5), placed(1200, false)] };
  shader._preRender(picture, {});
  assert.equal(shader.uniforms.lotmTokenCount, 1, "the hidden one is left out");
  assert.deepEqual([...shader.uniforms.lotmTokens.slice(0, 4)], [11, 0, 0.75, 0.5], "mirrored art (-1.5) still counts as 1.5 wide");
});

/* -------------------------------------------- */
/*  The Ethereal status                          */
/* -------------------------------------------- */

test("Ethereal is one of the system's statuses, and every status has a name", async () => {
  const { STATUS_RULES, registerStatusEffects } = await import("../module/effects/status-effects.mjs");
  assert.ok(STATUS_RULES.ethereal);
  for (const id of Object.keys(STATUS_RULES)) assert.ok(EN.Status.Names[id], `${id} has a name`);

  const saved = globalThis.CONFIG;
  globalThis.CONST = { ACTIVE_EFFECT_SHOW_ICON: { ALWAYS: 2 } };
  globalThis.CONFIG = { specialStatusEffects: {} };
  registerStatusEffects();
  assert.equal(CONFIG.specialStatusEffects.ETHEREAL, "ethereal");
  assert.ok(CONFIG.statusEffects.ethereal);
  globalThis.CONFIG = saved;
});

/* -------------------------------------------- */
/*  Senses and the setting (spirit-vision.mjs)   */
/* -------------------------------------------- */

const ghost = () => new FakeToken({ actor: { system: {} }, statuses: ["ethereal"] });
const person = () => new FakeToken({ actor: { system: {} } });
const undead = () => new FakeToken({ actor: { system: { spirit: { isUndead: true } } } });
const looking = (token = person()) => ({ object: token });

test("setting: per computer, off by default, reloads; strings exist", () => {
  const setting = settings.get("lotm.reduceSpiritVisionEffects");
  assert.equal(setting.scope, "client");
  assert.equal(setting.default, false);
  assert.equal(setting.requiresReload, true);
  assert.ok(EN.Settings.ReduceSpiritVisionEffects.Name && EN.Settings.ReduceSpiritVisionEffects.Hint);
  for (const key of ["SpiritVision", "DeathVision", "SpiritSight", "DeathSight"]) assert.ok(EN.Vision[key], key);
});

test("vision modes: their shader draws the whole scene; lights don't paint the real colours back over it", () => {
  const spiritMode = CONFIG.Canvas.visionModes.lotmSpiritVision;
  assert.equal(spiritMode.canvas.shader, shaders.SpiritVisionShader);
  assert.equal(CONFIG.Canvas.visionModes.lotmDeathVision.canvas.shader, shaders.DeathVisionShader);
  assert.equal(spiritMode.lighting.background.visibility, FakeVisionMode.LIGHTING_VISIBILITY.DISABLED);
  assert.equal(spiritMode.vision.background, undefined, "nothing extra drawn inside the token's sight range");
  assert.equal(spiritMode.vision.darkness.adaptive, true);
  assert.equal(spiritMode.label, "LORD_OF_THE_MYSTERIES.Vision.SpiritVision");
});

test("ordinary senses can't see Ethereal tokens, unless the one looking is Ethereal too", () => {
  for (const id of ["basicSight", "lightPerception"]) {
    const sense = CONFIG.Canvas.detectionModes[id];
    assert.equal(sense._canDetect(looking(), ghost()), false, id);
    assert.equal(sense._canDetect(looking(), person()), true, id);
    assert.equal(sense._canDetect(looking(ghost()), ghost()), true, `${id}: spirits see each other`);
  }
  assert.ok(CONFIG.Canvas.detectionModes.basicSight instanceof FakeBasicSight, "still Foundry's own sense underneath");
  assert.equal(CONFIG.Canvas.detectionModes.basicSight.id, "basicSight");
  assert.equal(CONFIG.Canvas.detectionModes.seeAll._canDetect(looking(), ghost()), true, "See All still sees everything");
});

test("Spirit Sight sees anything with an actor; Death Sight only Ethereal and undead", () => {
  const spiritSight = CONFIG.Canvas.detectionModes.lotmSpiritSight;
  const deathSight = CONFIG.Canvas.detectionModes.lotmDeathSight;
  assert.equal(spiritSight.type, FakeDetectionMode.DETECTION_TYPES.SIGHT, "sight: Blind stops it");
  assert.equal(spiritSight._canDetect(looking(), ghost()), true);
  assert.equal(spiritSight._canDetect(looking(), person()), true);
  assert.equal(spiritSight._canDetect(looking(), new FakeToken()), false, "no actor, no spirit");
  assert.equal(deathSight._canDetect(looking(), ghost()), true);
  assert.equal(deathSight._canDetect(looking(), undead()), true);
  assert.equal(deathSight._canDetect(looking(), person()), false);
  assert.ok(spirit.isSpiritFilter(spiritSight.constructor.getDetectionFilter()));
  assert.notEqual(spiritSight.constructor.getDetectionFilter(), deathSight.constructor.getDetectionFilter(),
    "each sense has its own glow");
});

/**
 * Spirit Sight checking a point: the viewer at (0, 0) with Spirit Sight 30 ft (600 px) and the given basic sight;
 * light everywhere left of x = 300.
 */
function spiritSightSees(point, basicSight = { enabled: true, range: 0 }) {
  globalThis.canvas = { effects: { testInsideLight: (p) => p.x < 300 } };
  const viewer = new FakeToken({ detectionModes: { basicSight } });
  const visionSource = { object: viewer, x: 0, y: 0 };
  return CONFIG.Canvas.detectionModes.lotmSpiritSight._testPoint(visionSource, { enabled: true, range: 30 }, ghost(), { point });
}

test("Spirit Vision isn't darkvision: seen in light, or within ordinary sight range, and within its own range", () => {
  assert.equal(spiritSightSees({ x: 200, y: 0 }), true, "in light");
  assert.equal(spiritSightSees({ x: 400, y: 0 }), false, "in the dark, no darkvision");
  assert.equal(spiritSightSees({ x: 400, y: 0 }, { enabled: true, range: 25 }), true, "in the dark, within 25 ft darkvision");
  assert.equal(spiritSightSees({ x: 560, y: 0 }, { enabled: true, range: 25 }), false, "in the dark, past the darkvision");
  assert.equal(spiritSightSees({ x: 400, y: 0 }, { enabled: false, range: 60 }), false, "basic sight turned off");
  assert.equal(spiritSightSees({ x: 400, y: 0 }, { enabled: true, range: null }), true, "basic sight with no limit");
  assert.equal(spiritSightSees({ x: 100, y: 590 }), true, "in light, just within 30 ft (598 px)");
  assert.equal(spiritSightSees({ x: 200, y: 600 }), false, "in light, but past Spirit Sight's 30 ft");
});

test("Death Sight needs light the same way", () => {
  globalThis.canvas = { effects: { testInsideLight: (p) => p.x < 300 } };
  const deathSight = CONFIG.Canvas.detectionModes.lotmDeathSight;
  const visionSource = { object: new FakeToken({ detectionModes: { basicSight: { enabled: true, range: 0 } } }), x: 0, y: 0 };
  const mode = { enabled: true, range: 30 };
  assert.equal(deathSight._testPoint(visionSource, mode, undead(), { point: { x: 200, y: 0 } }), true);
  assert.equal(deathSight._testPoint(visionSource, mode, undead(), { point: { x: 400, y: 0 } }), false);
});

test("aura hooks: actor and token changes redraw auras", () => {
  assert.deepEqual(hooks, ["updateActor", "updateToken"]);
});

/* -------------------------------------------- */
/*  The aura filter (spirit-vision-shader.mjs)   */
/* -------------------------------------------- */

test("aura size: a share of the token's size on screen, never too thin or too wide", () => {
  const { shareOfToken, minPixels, maxPixels } = glsl.AURA_SIZE;
  // A token size that lands between the limits, whatever the settings are tuned to.
  const size = (minPixels + maxPixels) / 2 / shareOfToken;
  assert.equal(glsl.auraWidthOnScreen(size, 1), size * shareOfToken);
  assert.ok(glsl.auraWidthOnScreen(size, 0.8) < glsl.auraWidthOnScreen(size, 1), "zoomed out: smaller on screen");
  assert.equal(glsl.auraWidthOnScreen(size, 0.0001), minPixels);
  assert.equal(glsl.auraWidthOnScreen(size, 1000), maxPixels);
});

test("aura filter: its own shader code; every setting is a uniform; PIXI's inputs are where PIXI expects them", () => {
  const filter = shaders.SpiritAuraFilter.create({ auraColor: [1, 0, 0, 0.5] });
  assert.equal(filter.vertex, glsl.SPIRIT_AURA_VERTEX);
  assert.equal(filter.fragment, glsl.SPIRIT_AURA_FRAGMENT);
  assert.deepEqual(filter.uniforms.auraColor, [1, 0, 0, 0.5]);
  for (const key of [...Object.keys(glsl.SPIRIT_AURA_UNIFORMS), "auraColor", "auraWidth", "auraTime"]) {
    assert.ok(key in filter.uniforms, `${key} has a starting value`);
    assert.match(glsl.SPIRIT_AURA_FRAGMENT, new RegExp(`uniform\\s+\\w+\\s+${key}\\b`), key);
  }
  // A uniform used by both halves must have the same precision in both, so each of PIXI's is used in only one.
  for (const name of ["inputSize", "outputFrame", "projectionMatrix"]) {
    assert.match(glsl.SPIRIT_AURA_VERTEX, new RegExp(`uniform\\s+\\w+\\s+${name}\\b`), name);
    assert.doesNotMatch(glsl.SPIRIT_AURA_FRAGMENT, new RegExp(`\\b${name}\\b`), name);
  }
  assert.doesNotMatch(glsl.SPIRIT_AURA_VERTEX, /\binputClamp\b/);
});

test("aura filter: sized to the token at the current zoom, with room around it; breathes, except in Photosensitive Mode", () => {
  globalThis.canvas = { stage: { scale: { x: 0.5 } }, app: { ticker: { lastTime: 3_602_500 } } };
  const filter = shaders.SpiritAuraFilter.create();
  filter.fitTo({ w: 200, h: 100 });
  assert.equal(filter.uniforms.auraWidth, glsl.auraWidthOnScreen(100, 0.5), "from the smaller side");
  assert.equal(filter.padding, Math.ceil(filter.uniforms.auraWidth) + 2);

  const drawn = [];
  const filterManager = { applyFilter: (...args) => drawn.push(args) };
  filter.apply(filterManager, "in", "out", 1);
  assert.equal(Math.round(filter.uniforms.auraTime * 1000) / 1000, 2.5);
  assert.deepEqual(drawn, [[filter, "in", "out", 1]], "PIXI still draws it");

  canvas.photosensitiveMode = true;
  filter.apply(filterManager, "in", "out", 1);
  assert.equal(filter.uniforms.auraTime, 0);
});

/* -------------------------------------------- */
/*  Auras on tokens (token.mjs)                  */
/* -------------------------------------------- */

/** A scene: one player token looking with a vision mode, and a creature 400 px away (20 ft on a 5 ft / 100 px grid). */
function scene({ visionMode = "lotmSpiritVision", sightRange = 30, creature = {} } = {}) {
  const sense = { enabled: true, range: sightRange };
  const viewer = new FakeToken({ x: 0, y: 0, detectionModes: { lotmSpiritSight: sense, lotmDeathSight: sense } });
  const token = new LordOfTheMysteriesToken({ x: 400, y: 0, actor: { system: { resources: { hp: HP(10) } } }, ...creature });
  globalThis.canvas = {
    dimensions: { distancePixels: 20 },
    effects: { visionSources: [{ active: true, visionMode: { id: visionMode }, object: viewer, x: 0, y: 0 }] },
  };
  return { viewer, token };
}

test("token aura: a creature in range glows with its aura colour", () => {
  const { token } = scene({ creature: { actor: { system: { resources: { hp: HP(10) }, spirit: { auraColor: "#ff0000" } } } } });
  token._refreshVisibility();
  assert.ok(spirit.isSpiritFilter(token.detectionFilter));
  assert.ok(token.detectionFilter instanceof shaders.SpiritAuraFilter);
  assert.deepEqual(token.detectionFilter.uniforms.auraColor, [1, 0, 0, 1]);
});

test("token aura: the token being looked through glows too, in its own colour", () => {
  const sense = { enabled: true, range: 30 };
  const klein = new LordOfTheMysteriesToken({
    x: 0, y: 0, detectionModes: { lotmSpiritSight: sense },
    actor: { system: { resources: { hp: HP(10) }, spirit: { auraColor: "#00ff00" } } },
  });
  globalThis.canvas = {
    dimensions: { distancePixels: 20 },
    effects: { visionSources: [{ active: true, visionMode: { id: "lotmSpiritVision" }, object: klein, x: 0, y: 0 }] },
  };
  klein._refreshVisibility();
  assert.ok(spirit.isSpiritFilter(klein.detectionFilter));
  assert.deepEqual(klein.detectionFilter.uniforms.auraColor, [0, 1, 0, 1]);
});

test("token aura: out of range, ordinary vision, or no actor: no aura", () => {
  const far = scene({ sightRange: 10 }).token;          // 200 px + 50 px to its edge < 400 px
  far._refreshVisibility();
  assert.equal(far.detectionFilter, null);
  const basic = scene({ visionMode: "basic" }).token;
  basic._refreshVisibility();
  assert.equal(basic.detectionFilter, null);
  const object = scene({ creature: { actor: null } }).token;
  object._refreshVisibility();
  assert.equal(object.detectionFilter, null);
});

test("token aura: another sense's glow (See Invisibility) is kept; hidden tokens get nothing", () => {
  const { token } = scene();
  const seeInvisibility = { uniforms: {} };
  token._refreshVisibility = function () {
    this.detectionFilter = seeInvisibility;
    LordOfTheMysteriesToken.prototype._refreshVisibility.call(this);
  };
  token._refreshVisibility();
  assert.equal(token.detectionFilter, seeInvisibility);

  const hidden = scene().token;
  hidden.visible = false;
  hidden._refreshVisibility();
  assert.equal(hidden.detectionFilter, null);
});

test("token aura: sized for the zoom just before Foundry draws it; other senses' glows are left alone", () => {
  const { token } = scene();
  token._refreshVisibility();
  canvas.stage = { scale: { x: 2 } };
  token._renderDetectionFilter({});
  assert.equal(token.drewDetectionFilter, true, "Foundry still draws it");
  assert.equal(token.detectionFilter.uniforms.auraWidth, glsl.auraWidthOnScreen(100, 2));

  const other = scene().token;
  const seeInvisibility = { uniforms: {} };
  other.detectionFilter = seeInvisibility;
  assert.doesNotThrow(() => other._renderDetectionFilter({}));
  assert.deepEqual(seeInvisibility.uniforms, {});
});

test("token aura: in Death Vision a dying creature glows pale green", () => {
  const { token } = scene({ visionMode: "lotmDeathVision", creature: { actor: { system: { resources: { hp: HP(0) } } } } });
  token._refreshVisibility();
  assert.deepEqual(round(token.detectionFilter.uniforms.auraColor), round([...aura.hexToRgb(aura.AURA_COLORS.death), 1]));
});

/* -------------------------------------------- */
/*  The Death pathway: Death Sight always on     */
/* -------------------------------------------- */

const deathSight = (range = 30) => ({ lotmDeathSight: { enabled: true, range } });

test("Death pathway: with Death Sight on, using Spirit Vision gives the Death Vision look", () => {
  assert.equal(spirit.visionModeFor({ detectionModes: deathSight() }, "lotmSpiritVision"), "lotmDeathVision");
  assert.equal(spirit.visionModeFor({ detectionModes: {} }, "lotmSpiritVision"), "lotmSpiritVision", "other pathways");
  assert.equal(spirit.visionModeFor({ detectionModes: { lotmDeathSight: { enabled: false, range: 30 } } }, "lotmSpiritVision"),
    "lotmSpiritVision", "Death Sight turned off");
  assert.equal(spirit.visionModeFor({ detectionModes: deathSight() }, "basic"), "basic", "not using Spirit Vision: normal look");

  const corpseCollector = new LordOfTheMysteriesToken({ visionMode: "lotmSpiritVision", detectionModes: deathSight() });
  assert.equal(corpseCollector._getVisionSourceData().visionMode, "lotmDeathVision", "the token's vision uses it");
  const seer = new LordOfTheMysteriesToken({ visionMode: "lotmSpiritVision" });
  assert.equal(seer._getVisionSourceData().visionMode, "lotmSpiritVision");

  // Death Sight switched on or off: the token's vision is rebuilt, so the look changes straight away.
  corpseCollector.vision = {};
  corpseCollector._onUpdate({ detectionModes: { lotmDeathSight: { enabled: false } } }, {}, "user");
  assert.equal(corpseCollector.visionInitialized, 1);
  corpseCollector._onUpdate({ name: "Renamed" }, {}, "user");
  assert.equal(corpseCollector.visionInitialized, 1, "other changes leave it alone");
});

test("Death pathway: Death Sight alone gives spirits their Death Vision aura; Spirit Vision gives everyone theirs", () => {
  const sense = { lotmDeathSight: { enabled: true, range: 30 } };
  const viewer = new FakeToken({ detectionModes: sense });
  const ghostToken = new LordOfTheMysteriesToken({ x: 400, y: 0, actor: { system: {} }, statuses: ["ethereal"] });
  const look = (visionMode) => {
    globalThis.canvas = {
      dimensions: { distancePixels: 20 },
      effects: { visionSources: [{ active: true, visionMode: { id: visionMode }, object: viewer, x: 0, y: 0 }] },
    };
    // Foundry picked Death Sight's glow, because only Death Sight sees the ghost.
    ghostToken.detectionFilter = CONFIG.Canvas.detectionModes.lotmDeathSight.constructor.getDetectionFilter();
    ghostToken._refreshVisibility();
    return ghostToken.detectionFilter;
  };
  const alone = look("basic");
  assert.ok(spirit.isSpiritFilter(alone), "the ghost glows with Death Sight alone");
  assert.deepEqual(round(alone.uniforms.auraColor), round([...aura.hexToRgb(aura.AURA_COLORS.death), 1]), "full pale green");
  assert.notEqual(alone, CONFIG.Canvas.detectionModes.lotmDeathSight.constructor.getDetectionFilter(), "its own aura");

  // A living goblin, seen by ordinary sight: no filter from Foundry, so no aura without Spirit Vision.
  const goblin = new LordOfTheMysteriesToken({ x: 300, y: 0, actor: { system: { resources: { hp: HP(10) } } } });
  goblin.detectionFilter = null;
  goblin._refreshVisibility();
  assert.equal(goblin.detectionFilter, null);

  const withSpiritVision = look("lotmDeathVision");
  assert.ok(spirit.isSpiritFilter(withSpiritVision), "Spirit Vision on: the aura");
  assert.deepEqual(round(withSpiritVision.uniforms.auraColor), round([...aura.hexToRgb(aura.AURA_COLORS.death), 1]));
});

test("Death Vision: auras reach as far as Death Sight or Spirit Sight, whichever is farther", () => {
  const viewer = new FakeToken({ detectionModes: { lotmDeathSight: { enabled: true, range: 10 }, lotmSpiritSight: { enabled: true, range: 30 } } });
  const goblin = new LordOfTheMysteriesToken({ x: 500, y: 0, actor: { system: { resources: { hp: HP(10) } } } });
  globalThis.canvas = {
    dimensions: { distancePixels: 20 },
    effects: { visionSources: [{ active: true, visionMode: { id: "lotmDeathVision" }, object: viewer, x: 0, y: 0 }] },
  };
  assert.equal(spirit.viewerSpiritVision(goblin), "death", "500 px is past Death Sight's 200 px, within Spirit Sight's 600 px");
});

/* -------------------------------------------- */
/*  Reduce Spirit Vision Effects (setting on)    */
/* -------------------------------------------- */

test("reduced effects: plain vision, no glows, no aura hooks, Ethereal still revealed", async () => {
  resetConfig();
  reduceEffects = true;
  hooks.length = 0;
  const reduced = await import("../module/canvas/spirit-vision.mjs?reduced");
  reduced.registerSpiritVision();

  assert.equal(reduced.areSpiritEffectsReduced(), true);
  const mode = CONFIG.Canvas.visionModes.lotmSpiritVision;
  assert.equal(mode.canvas, undefined, "no shader: a plain vision mode");
  assert.equal(mode.lighting, undefined);

  const spiritSight = CONFIG.Canvas.detectionModes.lotmSpiritSight;
  assert.equal(spiritSight.constructor.getDetectionFilter(), undefined);
  assert.equal(spiritSight._canDetect(looking(), ghost()), true, "ghosts are still revealed");
  assert.equal(CONFIG.Canvas.detectionModes.basicSight._canDetect(looking(), ghost()), false);
  assert.deepEqual(hooks, []);
  reduceEffects = false;
});


/* -------------------------------------------- */
/*  Through walls (spirit-walls.mjs)             */
/* -------------------------------------------- */

const walls = await import("../module/canvas/spirit-walls.mjs");

/** A wall across the sight line at x (pixels), from y = -100 to 100. */
const wallAt = (x, sight = walls.WALL_SIGHT.NORMAL, extra = {}) => ({ a: { x, y: -100 }, b: { x, y: 100 }, sight, ...extra });
/** Looking from (0, 0) to (500, 0) on a 100 px / 5 ft grid: 5 ft is 100 px. */
const seen = (wallList) => walls.seesThroughWalls({ origin: { x: 0, y: 0 }, point: { x: 500, y: 0 }, walls: wallList, maxThickness: 100 });

test("through walls: one wall drawn as a line, or two faces less than 5 ft apart, can be seen through", () => {
  assert.equal(seen([]), true, "nothing in the way");
  assert.equal(seen([wallAt(250)]), true, "a single line");
  assert.equal(seen([wallAt(200), wallAt(260)]), true, "a wall 3 ft thick (both faces drawn)");
  assert.equal(seen([wallAt(200), wallAt(300)]), false, "a wall 5 ft thick: not less than 5 ft");
  assert.equal(seen([wallAt(100), wallAt(400)]), false, "two separate walls");
  assert.equal(seen([wallAt(600)]), true, "a wall past the creature doesn't count");
});

test("through walls: terrain walls always block; open doors, see-through walls and one-way walls facing away don't count", () => {
  assert.equal(seen([wallAt(250, walls.WALL_SIGHT.LIMITED)]), false, "terrain, however thin");
  assert.equal(seen([wallAt(250), wallAt(260, walls.WALL_SIGHT.LIMITED)]), false);
  assert.equal(seen([wallAt(100), wallAt(400, walls.WALL_SIGHT.NONE)]), true, "a wall that doesn't block sight");
  assert.equal(seen([wallAt(100), wallAt(400, walls.WALL_SIGHT.NORMAL, { isOpenDoor: true })]), true, "an open door");
  assert.equal(seen([wallAt(100), wallAt(400, walls.WALL_SIGHT.NORMAL, { isFacingAway: true })]), true, "one-way, open from here");
});

test("through walls: where a line crosses a wall, and which side a point is on", () => {
  assert.equal(walls.crossingAt({ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 250, y: -10 }, { x: 250, y: 10 }), 0.5);
  assert.equal(walls.crossingAt({ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 250, y: 5 }, { x: 250, y: 10 }), null, "misses");
  assert.equal(walls.crossingAt({ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 0, y: 5 }, { x: 500, y: 5 }), null, "parallel");
  const a = { x: 0, y: -100 };
  const b = { x: 0, y: 100 };
  assert.notEqual(walls.sideOf(a, b, { x: -50, y: 0 }), walls.sideOf(a, b, { x: 50, y: 0 }), "opposite sides differ");
  assert.equal(walls.sideOf(a, b, { x: 0, y: 0 }), walls.WALL_DIRECTION.BOTH);
});

test("Spirit Sight sees a goblin through one thin wall, not through two or terrain, not outside its view", () => {
  globalThis.CONST = { ...(globalThis.CONST ?? {}), WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 } };
  const placed = (x, sight = 20, extra = {}) => ({ document: { c: [x, -100, x, 100], sight, door: 0, ds: 0, dir: 0, ...extra } });
  const look = (wallList, test = {}) => {
    globalThis.canvas = { dimensions: { distancePixels: 20 }, walls: { placeables: wallList } };
    const visionSource = { x: 0, y: 0, object: new FakeToken() };
    return CONFIG.Canvas.detectionModes.lotmSpiritSight._testLOS(visionSource, { enabled: true, range: 60 }, person(),
      { point: { x: 500, y: 0 }, behindWalls: true, ...test });
  };
  assert.equal(look([placed(250)]), true, "one wall");
  assert.equal(look([placed(100), placed(400)]), false, "two walls");
  assert.equal(look([placed(250, 10)]), false, "terrain");
  assert.equal(look([placed(100), placed(400, 20, { door: 1, ds: 1 })]), true, "the second one is an open door");
  assert.equal(look([placed(250)], { outsideView: true }), false, "outside the token's field of view");
  assert.equal(look([placed(100), placed(400)], { behindWalls: false }), true, "in plain sight: Foundry's own test");

  // One-way: Foundry's wall says which side the viewer is on.
  const oneWay = { ...placed(250, 20, { dir: 1 }), edge: { orientPoint: () => 1 } };
  assert.equal(look([placed(100), oneWay]), true, "a one-way wall open from the viewer's side doesn't count");
  oneWay.edge.orientPoint = () => 2;
  assert.equal(look([placed(100), oneWay]), false, "from its blocking side it does");
});
