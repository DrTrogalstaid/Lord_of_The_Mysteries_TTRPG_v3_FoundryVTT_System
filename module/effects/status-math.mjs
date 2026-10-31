/**
 * What an actor's statuses do to its Physical Defense and movement, as plain math.
 * Each status's settings are in STATUSES (effects/status-effects.mjs); data/actor/base-actor.mjs calls these while
 * it prepares the actor's data.
 *
 * Plain data in / data out (no `game` / `CONFIG` access) so it can be unit tested under Node
 * (tests/status-math.test.mjs).
 *
 * A "portion" is how much of a number still counts: "full", "half" (rounded up) or "none".
 */

/** The portions, from most to least. */
const PORTIONS = ["full", "half", "none"];


/**
 * The smaller of two portions: "none" beats "half", "half" beats "full". Two statuses that both change Agility
 * don't add up; the stronger one counts.
 * @param {string} [a="full"]
 * @param {string} [b="full"]
 * @returns {string}
 */
export function smallerPortion(a = "full", b = "full") {
  return PORTIONS[Math.max(PORTIONS.indexOf(a), PORTIONS.indexOf(b))] ?? "full";
}


/**
 * A number with a portion applied. Half is rounded up (Loss of Balance: "halved, rounded up").
 * @param {number} value
 * @param {string} [portion="full"]
 * @returns {number}
 */
export function applyPortion(value, portion = "full") {
  if (portion === "none") return 0;
  if (portion === "half") return Math.ceil(value / 2);
  return value;
}


/**
 * Combine the defense and movement settings of every status the actor has.
 * @param {{id: string, defense?: object|null, movement?: object|null}[]} rules   The statuses' rules (StatusRule).
 * @returns {{
 *   defense:  {agility: string, dodge: string, modifier: number, sources: string[]},
 *   movement: {agility: string, sources: string[]}
 * }}
 *   agility / dodge  the portion of each that still counts
 *   modifier         added to the Agility + Dodge part of Physical Defense (Disadvantage: -2)
 *   sources          ids of the statuses that changed it, for the sheet's tooltip
 */
export function combineStatusRules(rules = []) {
  const defense = { agility: "full", dodge: "full", modifier: 0, sources: [] };
  const movement = { agility: "full", sources: [] };

  for (const rule of rules) {
    if (rule.defense) {
      defense.agility = smallerPortion(defense.agility, rule.defense.agility);
      defense.dodge = smallerPortion(defense.dodge, rule.defense.dodge);
      defense.modifier += Number(rule.defense.modifier) || 0;
      defense.sources.push(rule.id);
    }
    if (rule.movement) {
      movement.agility = smallerPortion(movement.agility, rule.movement.agility);
      movement.sources.push(rule.id);
    }
  }
  return { defense, movement };
}


/**
 * Physical Defense: Agility + Armor + Dodge + 10, with the statuses' changes.
 *   - Agility and Dodge each count fully, halved or not at all (see combineStatusRules).
 *   - The modifier (Disadvantage's -2) lowers the Agility + Dodge part. When neither of them counts any more
 *     (Bound, Off Guard), there's nothing left for it to lower, so it's skipped.
 * With no statuses this is exactly the old formula.
 * @param {object} values
 * @param {number} values.agility   Agility total (after armor and carrying penalties).
 * @param {number} values.armor     Worn armor's points.
 * @param {number} values.dodge     The Dodge skill's bonus.
 * @param {object} [values.defense] combineStatusRules(...).defense
 * @returns {number}
 */
export function physicalDefense({ agility, armor, dodge, defense = {} }) {
  const agilityPortion = defense.agility ?? "full";
  const dodgePortion = defense.dodge ?? "full";
  const nothingLeft = agilityPortion === "none" && dodgePortion === "none";
  const evasion = applyPortion(agility, agilityPortion) + applyPortion(dodge, dodgePortion)
    + (nothingLeft ? 0 : (defense.modifier ?? 0));
  return evasion + armor + 10;
}


/**
 * The Agility used for movement (Strength + Agility, in meters), with the statuses' changes.
 * @param {number} agility           Agility total.
 * @param {object} [movement]        combineStatusRules(...).movement
 * @returns {number}
 */
export function movementAgility(agility, movement = {}) {
  return applyPortion(agility, movement.agility ?? "full");
}
