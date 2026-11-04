/**
 * Spirit Vision and Death Vision: how the world looks through them, and what they can see.
 *
 *   Vision modes (how the world looks, CONFIG.Canvas.visionModes)
 *     lotmSpiritVision  the Seer's view: the scene repainted in strong colours with rippling edges
 *     lotmDeathVision   the Corpse Collector's view: drained to pale green, with creeping mist
 *     The recolour covers what the token can see right now; it doesn't light anything up, and places explored
 *     earlier keep their real colours.
 *     When a player sees through several tokens at once, Foundry takes the colours from just one of them.
 *     The look is the presets in spirit-vision-glsl.mjs; the shaders are in spirit-vision-shader.mjs.
 *   Detection modes (what can be seen, CONFIG.Canvas.detectionModes)
 *     lotmSpiritSight   anything with a spirit (any token with an actor), Ethereal ones included
 *     lotmDeathSight    Ethereal and undead creatures (system.spirit.isUndead)
 *     Spirit Vision isn't darkvision: both only see where the token could see anyway, in light or within its
 *     ordinary sight range (basic sight). They're sight: Blind stops them, and with the "Invisible Hides Tokens"
 *     setting on they don't see Invisible creatures. Walls block them.
 *   The Ethereal status (effects/status-effects.mjs): ghosts, wraiths and other spirit bodies. Foundry's ordinary
 *     senses (basic sight, light perception, see / sense invisibility, tremor) can't see an Ethereal token, unless
 *     the one looking is Ethereal too. "See All" and "Sense All" still see everything.
 *   Auras: while a player looks through a token with Spirit or Death Vision, creatures in range glow, that token too
 *     (colours in spirit-aura.mjs, drawn by LordOfTheMysteriesToken in token.mjs). A spirit sense on its own (Death
 *     Sight without Spirit Vision) gives auras only to the creatures it alone reveals: spirits.
 *
 * Abilities turn these on with Active Effects on the actor (all changes Override):
 *   Spirit Vision - the effect on the "Activate Spirit Vision" action, Use: Toggle (effects/toggle-effects.mjs), so
 *   using the action switches it on and off. Every pathway shares it:
 *     token.sight.visionMode                         lotmSpiritVision
 *     token.detectionModes.lotmSpiritSight.enabled   true
 *     token.detectionModes.lotmSpiritSight.range     its range in the scene's units, e.g. 30
 *   Death Vision - a passive effect of the Death pathway, always on:
 *     token.detectionModes.lotmDeathSight.enabled    true
 *     token.detectionModes.lotmDeathSight.range      e.g. 30
 *   With Death Sight on, a token always sees Ethereal and undead creatures (where there's light to see by), and
 *   when it uses Spirit Vision it gets the Death Vision look instead (visionModeFor). lotmDeathVision can also be
 *   set directly, e.g. in Token Config for testing.
 *
 * The player setting "Reduce Spirit Vision Effects" (saved per computer) turns off the colours and auras for
 * slower computers. Ethereal creatures are still revealed. Changing it reloads Foundry.
 *
 * registerSpiritVision() is called once from the init hook in lotm.mjs.
 */

import { SpiritVisionShader, DeathVisionShader, SpiritAuraFilter } from "./spirit-vision-shader.mjs";
import { auraGlowColor, auraReach, isWithinSpiritRange, VISION_KINDS } from "./spirit-aura.mjs";

const { VisionMode, DetectionMode } = foundry.canvas.perception;
const { Token } = foundry.canvas.placeables;

/** Vision mode ids: how the world looks. */
export const SPIRIT_VISION = "lotmSpiritVision";
export const DEATH_VISION = "lotmDeathVision";

/** Detection mode ids: which tokens can be seen, and how far. */
export const SPIRIT_SIGHT = "lotmSpiritSight";
export const DEATH_SIGHT = "lotmDeathSight";

/** For each vision mode: the spirit senses whose range is how far auras show, and the aura colours to use. */
const SENSES = {
  [SPIRIT_VISION]: { sights: [SPIRIT_SIGHT], kind: VISION_KINDS.SPIRIT },
  [DEATH_VISION]: { sights: [DEATH_SIGHT, SPIRIT_SIGHT], kind: VISION_KINDS.DEATH },
};

/** Foundry's ordinary senses, which can't see Ethereal tokens. */
const ORDINARY_SENSES = ["basicSight", "lightPerception", "seeInvisibility", "senseInvisibility", "feelTremor"];

/** The player setting (saved per computer) that turns the visuals off. */
const REDUCED_EFFECTS_SETTING = "reduceSpiritVisionEffects";

/** Read once when the world loads; changing the setting reloads Foundry, so it can't go stale. */
let effectsAreReduced = false;


/* -------------------------------------------- */
/*  Small helpers                                */
/* -------------------------------------------- */

/** True when this player turned off the Spirit / Death Vision visuals. Ethereal tokens are still revealed. */
export function areSpiritEffectsReduced() {
  return effectsAreReduced;
}


/**
 * Does this canvas object have the Ethereal status?
 * @param {PlaceableObject} placeable
 * @returns {boolean}
 */
export function isEthereal(placeable) {
  const id = CONFIG.specialStatusEffects.ETHEREAL;
  return Boolean(id) && (placeable instanceof Token) && placeable.document.hasStatusEffect(id);
}


/**
 * Is this actor undead? (Ticked on the NPC sheet header, or set by an Active Effect.)
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isUndead(actor) {
  return actor?.system?.spirit?.isUndead === true;
}


/** The system's aura glows are tagged, so the token can tell them apart from other glows (See Invisibility). */
export function markAsSpiritFilter(filter, kind = null) {
  filter.isLotmSpiritAura = true;
  filter.lotmAuraKind = kind;   // the senses' own glows say which aura colours they stand for ("spirit" / "death")
  return filter;
}

export function isSpiritFilter(filter) {
  return filter?.isLotmSpiritAura === true;
}

/**
 * Which aura colours a spirit sense's glow stands for: "spirit" (Spirit Sight), "death" (Death Sight), or null.
 * @param {PIXI.Filter|null} filter   A token's detection filter, as Foundry chose it.
 * @returns {string|null}
 */
export function spiritFilterKind(filter) {
  return isSpiritFilter(filter) ? (filter.lotmAuraKind ?? null) : null;
}


/* -------------------------------------------- */
/*  Auras                                        */
/* -------------------------------------------- */

/**
 * Is any token this player is looking through using Spirit or Death Vision, close enough to see this one's aura?
 * @param {Token} token   The token that might glow.
 * @returns {string|null}  "spirit" or "death" (VISION_KINDS), or null for no aura.
 */
export function viewerSpiritVision(token) {
  const visionSource = canvas.effects.visionSources.find((source) => canSeeAuraOf(source, token));
  return visionSource ? SENSES[visionSource.visionMode.id].kind : null;
}


/**
 * @param {PointVisionSource} visionSource
 * @param {Token} token
 * @returns {boolean}
 */
function canSeeAuraOf(visionSource, token) {
  const sense = SENSES[visionSource.visionMode?.id];
  const viewer = visionSource.object;
  if (!visionSource.active || !sense || !viewer) return false;   // not using Spirit / Death Vision

  // As far as its farthest spirit sense reaches (auraReach in spirit-aura.mjs).
  const detectionModes = viewer.document.detectionModes ?? {};
  const range = auraReach(sense.sights.map((id) => detectionModes[id]), viewer.document.sight.range);
  return isWithinSpiritRange({
    viewer: { x: visionSource.x ?? visionSource.data?.x ?? 0, y: visionSource.y ?? visionSource.data?.y ?? 0 },
    target: { x: token.center.x, y: token.center.y, size: Math.min(token.w, token.h) },
    range,
    distancePixels: canvas.dimensions.distancePixels,
  });
}


/**
 * The colour of a token's aura for one kind of vision.
 * @param {Token} token
 * @param {string} kind   "spirit" or "death" (VISION_KINDS)
 * @returns {number[]|null}   [r, g, b, a] for the glow filter, or null: no aura (a token with no actor has no spirit).
 */
export function spiritAuraColor(token, kind) {
  const actor = token.actor;
  if (!actor) return null;
  return auraGlowColor({
    vision: kind,
    hp: actor.system?.resources?.hp,
    isEthereal: isEthereal(token),
    isUndead: isUndead(actor),
    auraColor: actor.system?.spirit?.auraColor,
  });
}


/* -------------------------------------------- */
/*  Vision modes                                 */
/* -------------------------------------------- */

/**
 * Does this token have Death Sight on (the Death pathway's passive Death Vision)?
 * @param {TokenDocument} tokenDocument
 * @returns {boolean}
 */
export function hasDeathSight(tokenDocument) {
  return tokenDocument?.detectionModes?.[DEATH_SIGHT]?.enabled === true;
}


/**
 * The vision mode a token really uses. Spirit Vision looks like Death Vision for a token with Death Sight, so one
 * shared Spirit Vision ability works for every pathway. Used by LordOfTheMysteriesToken (token.mjs).
 * @param {TokenDocument} tokenDocument
 * @param {string} visionMode   The mode its sight is set to (token.sight.visionMode).
 * @returns {string}
 */
export function visionModeFor(tokenDocument, visionMode) {
  if (visionMode === SPIRIT_VISION && hasDeathSight(tokenDocument)) return DEATH_VISION;
  return visionMode;
}

/**
 * A Spirit / Death vision mode. They only differ in id, label and shader.
 * With reduced effects it still exists (so Active Effects can switch to it), but looks like normal vision.
 */
function createVisionMode(id, label, shader) {
  const defaults = { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 };
  if (effectsAreReduced) return new VisionMode({ id, label, tokenConfig: true, vision: { defaults } });

  return new VisionMode({
    id,
    label,
    tokenConfig: true, // listed in Token Config > Vision, handy for testing
    // The shader that puts the whole scene on screen (see spirit-vision-shader.mjs). It updates itself every frame.
    canvas: { shader, uniforms: {} },
    lighting: {
      // Lights normally redraw the scene's real colours inside their light, on top of the recolour. Stop that.
      background: { visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED },
    },
    vision: {
      darkness: { adaptive: true }, // you still need light to see the room itself
      defaults,
    },
  });
}


/* -------------------------------------------- */
/*  Detection modes                              */
/* -------------------------------------------- */

/**
 * What Spirit Sight and Death Sight share.
 *
 * Spirit Vision isn't darkvision: these senses only see where the token could see anyway, in light or within its
 * ordinary sight range (its basic sight). What they add is seeing what ordinary eyes can't (Ethereal creatures),
 * as far as their own range.
 *
 * Each sense says which creatures it sees (sees) and the colour of its glow (GLOW_COLOR).
 */
class SpiritSenseDetectionMode extends DetectionMode {
  /** [r, g, b, strength] of the aura on tokens only this sense can see (token.mjs swaps in the creature's own). */
  static GLOW_COLOR = [1, 1, 1, 1];

  /** Which aura colours this sense uses (VISION_KINDS), for creatures only it can see. */
  static AURA_KIND = VISION_KINDS.SPIRIT;

  static getDetectionFilter() {
    if (effectsAreReduced) return undefined; // still revealed, just without the glow
    // Each sense makes its own glow once. (hasOwn: Death Sight mustn't reuse Spirit Sight's, or the other way round.)
    if (!Object.hasOwn(this, "glow")) {
      this.glow = markAsSpiritFilter(SpiritAuraFilter.create({ auraColor: this.GLOW_COLOR }), this.AURA_KIND);
    }
    return this.glow;
  }

  /**
   * Does this sense see this creature at all? Overridden by each sense.
   * @param {Token} target   A token with an actor.
   * @returns {boolean}
   */
  sees(target) {
    return true;
  }

  _canDetect(visionSource, target, ...rest) {
    if (!(target instanceof Token) || !target.actor || !this.sees(target)) return false;
    return super._canDetect(visionSource, target, ...rest);
  }

  _testPoint(visionSource, mode, target, test) {
    // Line of sight, and within this sense's own range.
    if (!super._testPoint(visionSource, mode, target, test)) return false;
    // And somewhere the token could see anyway: in light, or within its ordinary sight range.
    return canvas.effects.testInsideLight(test.point) || this._isWithinOrdinarySight(visionSource, target, test);
  }

  /**
   * Is the point within the token's ordinary sight range (its basic sight, e.g. darkvision)?
   * @returns {boolean}   false when basic sight is off or has no range.
   */
  _isWithinOrdinarySight(visionSource, target, test) {
    const basicSight = visionSource.object?.document?.detectionModes?.basicSight;
    if (!basicSight?.enabled) return false;
    if (basicSight.range === null) return true; // no limit
    if (!(basicSight.range > 0)) return false;
    return this._testRange(visionSource, basicSight, target, test);
  }
}


/** Spirit Sight: anything with a spirit (any token with an actor), Ethereal ones included. */
class SpiritSightDetectionMode extends SpiritSenseDetectionMode {
  static GLOW_COLOR = [0.72, 0.85, 1, 1];
}


/**
 * Death Sight: Ethereal and undead creatures. The living still show up through ordinary sight.
 * The Death pathway has it on all the time (a passive effect); it also turns Spirit Vision into Death Vision.
 */
class DeathSightDetectionMode extends SpiritSenseDetectionMode {
  static GLOW_COLOR = [0.55, 1, 0.71, 1];
  static AURA_KIND = VISION_KINDS.DEATH;

  sees(target) {
    return isEthereal(target) || isUndead(target.actor);
  }
}


/**
 * Swap Foundry's ordinary senses for copies that can't see Ethereal tokens
 * (unless the one looking is Ethereal too: spirits see each other).
 */
function makeOrdinarySensesBlindToSpirits() {
  // Do the same thing once for each sense in the ORDINARY_SENSES list.
  for (const id of ORDINARY_SENSES) {
    const coreMode = CONFIG.Canvas.detectionModes[id];
    if (!coreMode) continue;

    const SpiritBlindMode = class extends coreMode.constructor {
      _canDetect(visionSource, target, ...rest) {
        if (isEthereal(target) && !isEthereal(visionSource.object)) return false;
        return super._canDetect(visionSource, target, ...rest);
      }
    };
    CONFIG.Canvas.detectionModes[id] = new SpiritBlindMode(coreMode.toObject());
  }
}


/* -------------------------------------------- */
/*  Registration                                 */
/* -------------------------------------------- */

/** Register the setting, vision modes and detection modes. Called once from the init hook in lotm.mjs. */
export function registerSpiritVision() {
  // "client" scope: saved on each computer, so every player chooses for themselves.
  game.settings.register("lotm", REDUCED_EFFECTS_SETTING, {
    name: "LORD_OF_THE_MYSTERIES.Settings.ReduceSpiritVisionEffects.Name",
    hint: "LORD_OF_THE_MYSTERIES.Settings.ReduceSpiritVisionEffects.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });
  effectsAreReduced = game.settings.get("lotm", REDUCED_EFFECTS_SETTING);

  // How the world looks.
  CONFIG.Canvas.visionModes[SPIRIT_VISION] = createVisionMode(SPIRIT_VISION, "LORD_OF_THE_MYSTERIES.Vision.SpiritVision", SpiritVisionShader);
  CONFIG.Canvas.visionModes[DEATH_VISION] = createVisionMode(DEATH_VISION, "LORD_OF_THE_MYSTERIES.Vision.DeathVision", DeathVisionShader);

  // What can be seen.
  CONFIG.Canvas.detectionModes[SPIRIT_SIGHT] = new SpiritSightDetectionMode({
    id: SPIRIT_SIGHT,
    label: "LORD_OF_THE_MYSTERIES.Vision.SpiritSight",
    type: DetectionMode.DETECTION_TYPES.SIGHT,
  });
  CONFIG.Canvas.detectionModes[DEATH_SIGHT] = new DeathSightDetectionMode({
    id: DEATH_SIGHT,
    label: "LORD_OF_THE_MYSTERIES.Vision.DeathSight",
    type: DetectionMode.DETECTION_TYPES.SIGHT,
  });

  // Ghosts are invisible to ordinary eyes.
  makeOrdinarySensesBlindToSpirits();

  // Aura colours follow Health and the actor's spirit fields: redraw a creature's aura when they change.
  // Not needed when this player has the effects turned off.
  if (effectsAreReduced) return;
  const refreshAuras = (tokens) => {
    for (const token of tokens) token.renderFlags.set({ refreshVisibility: true });
  };
  // Linked tokens (player characters): the actor changes.
  Hooks.on("updateActor", (actor, changes) => {
    if (changes.system) refreshAuras(actor.getActiveTokens());
  });
  // Unlinked tokens (NPCs): each token's own copy of the actor changes.
  Hooks.on("updateToken", (tokenDocument, changes) => {
    if (changes.delta && tokenDocument.object) refreshAuras([tokenDocument.object]);
  });
}
