/**
 * Spirit auras: the glow a creature has when someone looks at it with Spirit Vision or Death Vision.
 *
 *   Spirit Vision  The actor's aura colour (system.spirit.auraColor: set on the NPC sheet header, or by an
 *                  Active Effect, e.g. red while Angry) when it has one. Otherwise Health: warm gold when healthy,
 *                  sliding to deep red as Health drops. Ethereal creatures with no aura colour: pale blue.
 *   Death Vision   Pale green. Full strength for Ethereal and undead creatures (system.spirit.isUndead); faint for
 *                  the living, and brighter the closer they are to death.
 *
 * Auras reach as far as the viewer's Spirit Sight / Death Sight range (isWithinSpiritRange).
 *
 * Plain maths (no game / CONFIG / canvas), tested under Node (tests/spirit-vision.test.mjs).
 * Used by canvas/spirit-vision.mjs and canvas/token.mjs.
 */

/** The aura colours. Any "#rrggbb" colour works. */
export const AURA_COLORS = {
  healthy: "#ffd98a", // warm gold
  hurt: "#c4142c",    // deep red: the Spirit Vision aura slides towards this as Health drops
  spirit: "#b8d8ff",  // pale blue-white: ghosts, wraiths, spirit bodies
  death: "#8cffb4",   // the Death pathway's pale green
};

/** Which vision is looking: "spirit" (Spirit Vision) or "death" (Death Vision). */
export const VISION_KINDS = Object.freeze({ SPIRIT: "spirit", DEATH: "death" });

/** How bright a living creature's Death Vision aura is at full Health, and at 0 Health or less. */
const DEATH_AURA_FULL_HEALTH = 0.2;
const DEATH_AURA_NO_HEALTH = 1;


/**
 * A colour as red, green, blue from 0 to 1.
 * @param {string} hex   "#rrggbb" or "#rgb" (the # is optional).
 * @returns {number[]|null}   null when it isn't a colour (an empty aura colour, a typo).
 */
export function hexToRgb(hex) {
  let digits = String(hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(digits)) digits = [...digits].map((d) => d + d).join("");
  if (!/^[0-9a-f]{6}$/i.test(digits)) return null;
  const value = parseInt(digits, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
}


/**
 * Health from 0 (none left, or below 0) to 1 (full).
 * @param {{value: number, max: number}} [hp]   system.resources.hp
 * @returns {number}   1 when there's no maximum (an actor with no Health set up counts as healthy).
 */
export function healthRatio(hp) {
  const max = Number(hp?.max) || 0;
  if (max <= 0) return 1;
  const ratio = (Number(hp.value) || 0) / max;
  return Math.min(1, Math.max(0, ratio));
}


/**
 * The colour of a creature's aura, ready for the aura filter (SpiritAuraFilter).
 * @param {object} creature
 * @param {string} creature.vision        One of VISION_KINDS.
 * @param {{value: number, max: number}} [creature.hp]   Its Health (system.resources.hp).
 * @param {boolean} [creature.isEthereal] It has the Ethereal status.
 * @param {boolean} [creature.isUndead]   system.spirit.isUndead
 * @param {string} [creature.auraColor]   system.spirit.auraColor ("" = none)
 * @returns {number[]|null}   [red, green, blue, strength], each 0 to 1; null for an unknown vision.
 */
export function auraGlowColor({ vision, hp, isEthereal = false, isUndead = false, auraColor = "" }) {
  if (vision === VISION_KINDS.DEATH) {
    const death = hexToRgb(AURA_COLORS.death);
    if (isEthereal || isUndead) return [...death, 1];
    // The same pale green, just fainter.
    const strength = DEATH_AURA_FULL_HEALTH + (DEATH_AURA_NO_HEALTH - DEATH_AURA_FULL_HEALTH) * (1 - healthRatio(hp));
    return [...death, strength];
  }

  if (vision === VISION_KINDS.SPIRIT) {
    const own = hexToRgb(auraColor);
    if (own) return [...own, 1];
    if (isEthereal) return [...hexToRgb(AURA_COLORS.spirit), 1];
    const hurt = hexToRgb(AURA_COLORS.hurt);
    const healthy = hexToRgb(AURA_COLORS.healthy);
    const ratio = healthRatio(hp);
    return [...hurt.map((channel, i) => channel + (healthy[i] - channel) * ratio), 1];
  }

  return null;
}


/**
 * Is a creature close enough to see its aura?
 * @param {object} options
 * @param {{x: number, y: number}} options.viewer   Centre of the token looking (pixels).
 * @param {{x: number, y: number, size: number}} options.target   Centre and size (the smaller side) of the creature.
 * @param {number|null} options.range               The sense's range in scene units (feet, metres); null = no limit.
 * @param {number} options.distancePixels           Pixels per scene unit (canvas.dimensions.distancePixels).
 * @returns {boolean}   The range reaches the creature's edge, not just its centre.
 */
export function isWithinSpiritRange({ viewer, target, range, distancePixels }) {
  if (range === null || range === undefined) return true;
  const reach = (Number(range) * distancePixels) + (target.size / 2);
  return Math.hypot(target.x - viewer.x, target.y - viewer.y) <= reach;
}


/**
 * How far a token's auras reach: as far as its farthest spirit sense that's on (Spirit Sight, Death Sight), or its
 * sight range when none of them is.
 * @param {({enabled: boolean, range: number|null}|undefined)[]} senses   The token's detection modes to consider.
 * @param {number|null} sightRange   The token's sight range (token.sight.range).
 * @returns {number|null|undefined}  In the scene's units; null (or undefined) = no limit.
 */
export function auraReach(senses, sightRange) {
  const active = senses.filter((sense) => sense?.enabled);
  if (!active.length) return sightRange;
  if (active.some((sense) => sense.range === null || sense.range === undefined)) return null;
  return Math.max(...active.map((sense) => Number(sense.range) || 0));
}
