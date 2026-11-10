/**
 * Area and zone effects: effects handed out to everyone inside a shape on the scene.
 *
 *   area   The user places the shape (Foundry's region placement: left-click to place, mouse wheel to turn,
 *          right-click to cancel). Nothing is left on the scene. A list of the tokens inside comes up, all ticked
 *          but the caster's; untick anyone who shouldn't get it. Each ticked token gets a copy, once.
 *   zone   The shape stays on the scene as a Region with the system's "Apply LotM Effect" behavior
 *          (data/region-behavior/apply-effect.mjs): tokens get a copy when they go in and lose it when they leave.
 *          The caster gets a marker effect, "Zone: <effect>", with the effect's duration:
 *            - when the marker runs out or is removed, the zone goes (documents/active-effect.mjs)
 *            - when the zone is deleted from the scene, the marker goes (the deleteRegion hook below)
 *          The emanation shape needs no placing: it's centered on the caster's token and moves with it.
 *          The caster isn't affected by their own zone.
 *
 * Shapes and sizes: the effect's LotM tab (system.application.shape and size, in the scene's units).
 *   circle      radius = size            cone   radius = size, Foundry's default template angle
 *   ray         length = size, one grid space wide
 *   rectangle   size × size              emanation   size out from the edge of the caster's token
 *
 * Players: placing a shape only needs the canvas. Creating a zone's Region, and deleting it, is done by the GM
 * when the player isn't allowed to (queries "lotm.createZone" / "lotm.deleteZone").
 */

import { askGM, createEffectsOn, deleteEffectsOn, effectCopyData, giveEffect } from "./effect-application.mjs";
import { postEffectLine } from "./effect-chat.mjs";
import { renderTemplateSync } from "../helpers/render.mjs";

/** The region behavior type for zones (registered in lotm.mjs; listed under RegionBehavior in system.json). */
export const ZONE_BEHAVIOR_TYPE = "lotm.applyEffect";

/** Foundry's default cone angle for templates, when CONFIG doesn't say. */
const DEFAULT_CONE_ANGLE = 53.13;

const CREATE_ZONE_QUERY = "lotm.createZone";
const DELETE_ZONE_QUERY = "lotm.deleteZone";

const format = (key, data) => game.i18n.format(key, data);


/* -------------------------------------------- */
/*  Shapes (pure)                                */
/* -------------------------------------------- */

/**
 * The Region shape data for a placed shape, in pixels, before it's placed (at 0, 0; placement moves it).
 * @param {string} shape     "circle", "cone", "ray" or "rectangle".
 * @param {number} size      In the scene's units (feet, meters).
 * @param {object} grid
 * @param {number} grid.size        Pixels per grid space.
 * @param {number} grid.distance    Scene units per grid space.
 * @param {number} [grid.coneAngle] Degrees.
 * @returns {object|null}  null for a shape that isn't placed (emanation) or unknown.
 */
export function shapeData(shape, size, { size: gridSize, distance, coneAngle = DEFAULT_CONE_ANGLE }) {
  const px = (units) => (Number(units) || 0) * gridSize / distance;
  const base = { x: 0, y: 0, rotation: 0 };
  switch (shape) {
    case "circle": return { ...base, type: "circle", radius: px(size) };
    case "cone": return { ...base, type: "cone", radius: px(size), angle: coneAngle };
    case "ray": return { ...base, type: "line", length: px(size), width: px(distance) };
    case "rectangle": return { ...base, type: "rectangle", width: px(size), height: px(size) };
    default: return null;
  }
}


/**
 * The Region shape data for an emanation around a token: `size` out from the token's edge.
 * @param {{x: number, y: number, width: number, height: number, shape: number}} token   A TokenDocument (or its data).
 * @param {number} size     In the scene's units.
 * @param {object} grid     As for shapeData.
 * @returns {object}
 */
export function emanationData(token, size, { size: gridSize, distance }) {
  return {
    type: "emanation",
    radius: (Number(size) || 0) * gridSize / distance,
    base: { type: "token", x: token.x, y: token.y, rotation: 0, width: token.width, height: token.height, shape: token.shape },
  };
}


/**
 * The tokens whose centers are inside a Region (or a placed Region preview), on the scene's current level.
 * @param {RegionDocument} region
 * @param {Iterable<TokenDocument>} tokens
 * @param {object} [options]
 * @param {string|null} [options.level]   Only tokens on this level (V14 scene levels); null for any.
 * @returns {TokenDocument[]}
 */
export function tokensInside(region, tokens, { level = null } = {}) {
  const tree = region.polygonTree;
  const inside = [];
  for (const token of tokens) {
    if (level && token.level && token.level !== level) continue;
    const center = tokenCenter(token);
    if (center && tree?.testPoint(center)) inside.push(token);
  }
  return inside;
}


/**
 * A token's center point, in pixels.
 * @param {TokenDocument} token
 * @returns {{x: number, y: number}|null}
 */
function tokenCenter(token) {
  if (typeof token.getCenterPoint === "function") return token.getCenterPoint();
  if (token.object?.center) return token.object.center;
  const gridSize = token.parent?.grid?.size;
  if (!gridSize) return null;
  return { x: token.x + (token.width * gridSize) / 2, y: token.y + (token.height * gridSize) / 2 };
}

/* -------------------------------------------- */
/*  Area: a shape placed once                    */
/* -------------------------------------------- */

/**
 * Area: place the effect's shape, pick who inside gets it, give them each a copy (source: the caster).
 * @param {ActiveEffect} effect
 * @param {object} options
 * @param {Actor} options.caster
 * @returns {Promise<string[]|null>}  The names of the tokens that got it, or null when cancelled.
 */
export async function applyArea(effect, { caster }) {
  const { shape, size } = effect.system.application;
  if (shape === "emanation") {
    // An emanation burst: around the caster's token, no placing.
    const token = casterToken(caster);
    if (!token) return null;
    const preview = previewRegion(effect, [emanationData(token, size, gridOf())]);
    return chooseAndGive(effect, caster, preview);
  }

  const placed = await placeShape(effect, shape, size);
  if (!placed) return null;
  return chooseAndGive(effect, caster, placed.preview);
}


/**
 * The confirm list for an area: every token inside, ticked except the caster's. Then the copies.
 * @param {ActiveEffect} effect
 * @param {Actor} caster
 * @param {RegionDocument} preview
 * @returns {Promise<string[]|null>}
 */
async function chooseAndGive(effect, caster, preview) {
  const scene = canvas.scene;
  const visible = scene.tokens.filter((token) => token.actor && (game.user.isGM || token.object?.visible !== false));
  const inside = tokensInside(preview, visible, { level: canvas.level?.id ?? null });
  if (!inside.length) {
    ui.notifications.info(format("LORD_OF_THE_MYSTERIES.Effects.Area.NobodyInside", { name: effect.name }));
    return null;
  }

  const chosen = await chooseTokens(effect, inside, caster);
  if (!chosen?.length) return null;
  const recipients = chosen.map((token) => ({ name: token.name, actor: token.actor }));
  return giveEffect(effect, recipients, { caster, source: caster.uuid });
}


/**
 * Ask which of the tokens inside the area get the effect. All are ticked but the caster's.
 * @param {ActiveEffect} effect
 * @param {TokenDocument[]} tokens
 * @param {Actor} caster
 * @returns {Promise<TokenDocument[]|null>}  The ticked ones, or null when cancelled.
 */
async function chooseTokens(effect, tokens, caster) {
  const content = renderTemplateSync("systems/lotm/templates/dialogs/area-tokens.hbs", {
    tokens: tokens.map((token) => ({
      uuid: token.uuid,
      img: token.texture?.src ?? token.actor?.img,
      name: token.name,
      isCaster: token.actor?.uuid === caster.uuid || token.actorId === caster.id,
    })),
  });

  const uuids = await foundry.applications.api.DialogV2.wait({
    window: { title: format("LORD_OF_THE_MYSTERIES.Effects.Area.ChooseTitle", { name: effect.name }) },
    content,
    buttons: [
      {
        action: "apply",
        label: "LORD_OF_THE_MYSTERIES.Effects.Area.Apply",
        icon: "fa-solid fa-person-rays",
        default: true,
        callback: (event, button) => [...button.form.querySelectorAll("input[name=token]:checked")].map((input) => input.value),
      },
      { action: "cancel", label: "LORD_OF_THE_MYSTERIES.Effects.Area.Cancel", icon: "fa-solid fa-xmark" },
    ],
    rejectClose: false,
  });
  if (!Array.isArray(uuids)) return null;
  return tokens.filter((token) => uuids.includes(token.uuid));
}

/* -------------------------------------------- */
/*  Zone: a shape that stays                     */
/* -------------------------------------------- */

/**
 * Zone: put a Region with the Apply LotM Effect behavior on the scene (placed, or around the caster for an
 * emanation), give the tokens already inside a copy, and give the caster the marker effect.
 * @param {ActiveEffect} effect
 * @param {object} options
 * @param {Actor} options.caster
 * @returns {Promise<string[]|null>}  The names of the tokens inside when it was made, or null when cancelled.
 */
export async function createZone(effect, { caster }) {
  if (!canvas?.ready || !canvas.scene) {
    ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Area.NoCanvas", { name: effect.name }));
    return null;
  }
  const { shape, size } = effect.system.application;

  let shapes;
  let attachTo = null;
  if (shape === "emanation") {
    const token = casterToken(caster);
    if (!token) return null;
    shapes = [emanationData(token, size, gridOf())];
    attachTo = token.id;
  } else {
    const placed = await placeShape(effect, shape, size);
    if (!placed) return null;
    shapes = [placed.shape];
  }

  const regionData = zoneRegionData(effect, caster, shapes, attachTo);
  const regionUuid = await createRegion(canvas.scene, regionData);
  if (!regionUuid) return null;

  // The marker on the caster: the zone lasts as long as it does.
  await createEffectsOn(caster, [zoneMarkerData(effect, regionUuid)]);

  await postEffectLine({
    speaker: ChatMessage.getSpeaker({ actor: caster }),
    img: effect.img,
    key: "LORD_OF_THE_MYSTERIES.Effects.Zone.Chat",
    data: { name: caster.name, effect: effect.name },
  });
  return [];
}


/**
 * The data of a zone's Region.
 * @param {ActiveEffect} effect
 * @param {Actor} caster
 * @param {object[]} shapes
 * @param {string|null} attachTo   A token id: the Region moves with it (emanations).
 * @returns {object}
 */
export function zoneRegionData(effect, caster, shapes, attachTo = null) {
  const data = {
    name: format("LORD_OF_THE_MYSTERIES.Effects.Zone.RegionName", { effect: effect.name, name: caster.name }),
    color: game.user.color?.css ?? String(game.user.color ?? "#c9a227"),
    shapes,
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    highlightMode: "coverage",
    behaviors: [{
      name: effect.name,
      type: ZONE_BEHAVIOR_TYPE,
      system: { effects: [effect.uuid], source: caster.uuid, includeSource: false },
    }],
    flags: { lotm: { zoneEffect: effect.uuid, caster: caster.uuid } },
  };
  if (canvas?.level?.id) data.levels = [canvas.level.id];
  if (attachTo) data.attachment = { token: attachTo };
  return data;
}


/**
 * The caster's marker effect for a zone: the effect's name, icon and duration, nothing else.
 * @param {ActiveEffect} effect
 * @param {string} regionUuid
 * @returns {object}
 */
export function zoneMarkerData(effect, regionUuid) {
  const duration = foundry.utils.deepClone(effect.toObject().duration ?? {});
  for (const key of ["startTime", "startRound", "startTurn", "combat"]) delete duration[key];
  return {
    name: format("LORD_OF_THE_MYSTERIES.Effects.Zone.MarkerName", { name: effect.name }),
    img: effect.img,
    type: "effect",
    duration,
    origin: effect.parent?.documentName === "Item" ? effect.parent.uuid : null,
    system: { zone: regionUuid },
  };
}


/**
 * Create a zone's Region: straight away if the user may, otherwise through the GM. Either way the tokens already
 * inside get their copies from whoever created it.
 * @param {Scene} scene
 * @param {object} regionData
 * @returns {Promise<string|null>}  The Region's UUID.
 */
async function createRegion(scene, regionData) {
  const RegionClass = CONFIG.Region?.documentClass;
  if (game.user.isGM || RegionClass?.canUserCreate?.(game.user)) {
    return createRegionHere(scene, regionData);
  }
  return askGM(CREATE_ZONE_QUERY, { sceneUuid: scene.uuid, regionData }, regionData.name);
}


/**
 * Create the Region on this client and hand the copies to the tokens already inside.
 * @param {Scene} scene
 * @param {object} regionData
 * @returns {Promise<string|null>}
 */
async function createRegionHere(scene, regionData) {
  const [region] = await scene.createEmbeddedDocuments("Region", [regionData]);
  if (!region) return null;
  for (const behavior of region.behaviors) {
    if (behavior.type === ZONE_BEHAVIOR_TYPE) await behavior.system.applyToTokensInside?.();
  }
  return region.uuid;
}


/**
 * Delete a zone's Region (its marker effect was removed or ran out): straight away if the user may,
 * otherwise through the GM. Nothing happens if it's already gone.
 * @param {string} regionUuid
 */
export async function deleteZoneRegion(regionUuid) {
  const region = await fromUuid(regionUuid).catch(() => null);
  if (!region) return;
  if (region.canUserModify?.(game.user, "delete") ?? game.user.isGM) {
    await region.delete();
    return;
  }
  await askGM(DELETE_ZONE_QUERY, { regionUuid }, region.name);
}

/* -------------------------------------------- */
/*  Placing                                      */
/* -------------------------------------------- */

/**
 * The scene's grid, for sizes: pixels per space, units per space, the default cone angle.
 * @returns {{size: number, distance: number, coneAngle: number}}
 */
function gridOf() {
  const grid = canvas.scene.grid;
  return { size: grid.size, distance: grid.distance || 1, coneAngle: CONFIG.MeasuredTemplate?.defaults?.angle ?? DEFAULT_CONE_ANGLE };
}


/**
 * Let the user place the effect's shape (Foundry's region placement). Nothing is created.
 * @param {ActiveEffect} effect
 * @param {string} shape
 * @param {number} size
 * @returns {Promise<{shape: object, preview: RegionDocument}|null>}  null when cancelled or there's no scene.
 */
async function placeShape(effect, shape, size) {
  if (!canvas?.ready || !canvas.scene) {
    ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Area.NoCanvas", { name: effect.name }));
    return null;
  }
  const data = shapeData(shape, size, gridOf());
  if (!data) return null;

  ui.notifications.info(format("LORD_OF_THE_MYSTERIES.Effects.Area.PlaceHint", { name: effect.name }));
  let placedShape = null;
  const preview = await canvas.regions.placeRegion({
    name: effect.name,
    color: game.user.color?.css ?? String(game.user.color ?? "#c9a227"),
    displayMeasurements: true,
    highlightMode: "coverage",
    shapes: [data],
    flags: { core: { MeasuredTemplate: true } },
  }, {
    create: false,
    // The shape as placed (position and turn), the same way dnd5e reads it.
    preConfirm: ({ document }) => {
      placedShape = document.toObject().shapes.at(-1) ?? null;
    },
  });
  if (!preview) return null;
  return { shape: placedShape ?? preview.toObject().shapes.at(-1), preview };
}


/**
 * A Region preview (not saved) with these shapes, for finding the tokens inside an emanation burst.
 * @param {ActiveEffect} effect
 * @param {object[]} shapes
 * @returns {RegionDocument}
 */
function previewRegion(effect, shapes) {
  const RegionClass = CONFIG.Region.documentClass;
  return new RegionClass({ name: effect.name, shapes }, { parent: canvas.scene });
}


/**
 * The caster's token on this scene, for an emanation: the one the user has selected, or the first one.
 * @param {Actor} caster
 * @returns {TokenDocument|null}
 */
function casterToken(caster) {
  const controlled = canvas?.tokens?.controlled?.find((token) => token.actor === caster);
  if (controlled) return controlled.document;
  const token = caster.getActiveTokens?.(false, true)?.find((t) => t.parent === canvas.scene) ?? null;
  if (!token) ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Area.NoCasterToken", { name: caster.name }));
  return token;
}

/* -------------------------------------------- */
/*  Keeping zones and markers together           */
/* -------------------------------------------- */

/**
 * Called once from the init hook:
 *   - the GM's side of the zone queries (a player's zone, or a player removing their zone's marker)
 *   - a zone deleted from the scene takes its marker off the caster
 */
export function registerZones() {
  CONFIG.queries ??= {};
  CONFIG.queries[CREATE_ZONE_QUERY] = async ({ sceneUuid, regionData } = {}) => {
    const scene = await fromUuid(sceneUuid).catch(() => null);
    if (!scene || !regionData) return null;
    return createRegionHere(scene, regionData);
  };
  CONFIG.queries[DELETE_ZONE_QUERY] = async ({ regionUuid } = {}) => {
    const region = await fromUuid(regionUuid).catch(() => null);
    if (region) await region.delete();
    return true;
  };

  Hooks.on("deleteRegion", async (region, options, userId) => {
    if (userId !== game.user.id) return;
    const casterUuid = region.flags?.lotm?.caster;
    if (!casterUuid) return;
    const caster = await fromUuid(casterUuid).catch(() => null);
    if (!caster) return;
    const markers = caster.effects.filter((effect) => effect.system?.zone === region.uuid).map((effect) => effect.id);
    if (markers.length) await deleteEffectsOn(caster, markers);
  });
}


/**
 * The copies one zone behavior has put on an actor (their origin is the behavior).
 * @param {Actor} actor
 * @param {string} behaviorUuid
 * @returns {string[]} Effect ids.
 */
export function zoneCopyIds(actor, behaviorUuid) {
  return (actor?.effects?.contents ?? [...(actor?.effects ?? [])])
    .filter((effect) => effect.origin === behaviorUuid)
    .map((effect) => effect.id);
}


/**
 * The data of the copies a zone puts on someone inside it.
 * @param {ActiveEffect[]} effects   The zone's effects.
 * @param {object} options
 * @param {string|null} options.source        Actor UUID (the caster).
 * @param {string} options.behaviorUuid       The copies' origin, so they can be found again when the token leaves.
 * @returns {object[]}
 */
export function zoneCopyData(effects, { source, behaviorUuid }) {
  return effects.filter(Boolean).map((effect) => effectCopyData(effect, { source, origin: behaviorUuid }));
}
