/**
 * Seeing spirits through walls: Spirit Sight and Death Sight see creatures through ONE wall less than 5 feet thick.
 *
 * Foundry's walls are lines, so a wall only has a thickness when both its faces are drawn (two parallel lines).
 * Along the line from the viewer to the creature:
 *   - a terrain wall (Limited sight) blocks, however thin
 *   - the other walls it crosses must all be within 5 feet of each other: one wall drawn as a single line, or the two
 *     faces of a wall thinner than 5 feet. Crossings 5 feet or more apart are a thicker wall, or two walls: blocked.
 *   - walls that don't block sight, and open doors, don't count; a one-way wall only counts from its blocking side
 *
 * Plain maths (no game / CONFIG / canvas), tested under Node (tests/spirit-vision.test.mjs).
 * Used by the spirit senses in spirit-vision.mjs, which read the scene's walls (sightWalls there).
 */

/** How thick a wall Spirit Sight and Death Sight can see through: less than this, in the scene's units (feet). */
export const SEE_THROUGH_THICKNESS = 5;

/** Foundry's wall sense types (CONST.WALL_SENSE_TYPES) and directions (CONST.WALL_DIRECTIONS). */
export const WALL_SIGHT = Object.freeze({ NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30, DISTANCE: 40 });
export const WALL_DIRECTION = Object.freeze({ BOTH: 0, LEFT: 1, RIGHT: 2 });


/**
 * Which side of the wall a → b the point is on, the way Foundry names it for one-way walls (Wall#orientPoint).
 * Only used when Foundry's own method isn't there (spirit-vision.mjs asks the wall first).
 * @returns {number}  WALL_DIRECTION.LEFT or RIGHT (BOTH when exactly on the line).
 */
export function sideOf(a, b, point) {
  const orientation = (a.y - point.y) * (b.x - point.x) - (a.x - point.x) * (b.y - point.y);
  if (orientation === 0) return WALL_DIRECTION.BOTH;
  return orientation < 0 ? WALL_DIRECTION.LEFT : WALL_DIRECTION.RIGHT;
}


/**
 * Where the line from `from` to `to` crosses the wall a–b, as a share of the way (0 at `from`, 1 at `to`).
 * @returns {number|null}  null when it doesn't cross (or runs along it).
 */
export function crossingAt(from, to, a, b) {
  const rx = to.x - from.x;
  const ry = to.y - from.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denominator = rx * sy - ry * sx;
  if (denominator === 0) return null;                      // parallel
  const t = ((a.x - from.x) * sy - (a.y - from.y) * sx) / denominator;   // along the sight line
  const u = ((a.x - from.x) * ry - (a.y - from.y) * rx) / denominator;   // along the wall
  if (t <= 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}


/**
 * Can a spirit sense see from `origin` to `point` through the walls in the way?
 * @param {object} options
 * @param {{x: number, y: number}} options.origin   The viewer (pixels).
 * @param {{x: number, y: number}} options.point    The point on the creature being checked (pixels).
 * @param {{a: {x: number, y: number}, b: {x: number, y: number}, sight: number, isOpenDoor?: boolean,
 *   isFacingAway?: boolean}[]} options.walls   isFacingAway: a one-way wall that lets sight through from the viewer's side.
 * @param {number} options.maxThickness             SEE_THROUGH_THICKNESS in pixels.
 * @returns {boolean}
 */
export function seesThroughWalls({ origin, point, walls, maxThickness }) {
  const length = Math.hypot(point.x - origin.x, point.y - origin.y);
  const crossings = [];   // pixels from the viewer

  for (const wall of walls) {
    if (wall.sight === WALL_SIGHT.NONE || wall.isOpenDoor || wall.isFacingAway) continue;
    const t = crossingAt(origin, point, wall.a, wall.b);
    if (t === null) continue;
    if (wall.sight === WALL_SIGHT.LIMITED) return false;   // terrain: never
    crossings.push(t * length);
  }

  if (!crossings.length) return true;
  return Math.max(...crossings) - Math.min(...crossings) < maxThickness;
}
