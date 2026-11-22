/**
 * NPC stat overrides: the GM types a number over one of the sidebar's worked-out stats (Health maximum, Movement...)
 * and that number is used instead of the calculated one. Clearing it goes back to the calculated number.
 *
 *   Saved in    system.statOverrides (data/actor/actor-npc.mjs): one number per stat, null = use the calculated one.
 *   Applied in  LordOfTheMysteriesNPC.prepareDerivedData, after everything else is worked out (Sequences, armor...).
 *   Shown in    the sidebar (templates/actor/parts/stat-input.hbs), typed in there (sheets/base-actor-sheet.mjs).
 *
 * Statuses still count on an overridden Physical Defense or Movement: they change it by as much as they change the
 * calculated number (Loss of Balance taking 6 ft off a calculated 24 ft also takes 6 ft off an override of 60 ft).
 * Everything else that goes into the calculated number (attributes, Sequences, armor) is replaced by the override.
 *
 * Plain data in / data out (no `game` / `CONFIG` access), tested under Node (tests/stat-overrides.test.mjs).
 */

/**
 * The stats that can be overridden, in sidebar order.
 *   key               its key in system.statOverrides (and in the prepared info, see applyStatOverrides)
 *   path              where the number is in the actor's system data
 *   hasStatusChange   statuses change it (effects/status-math.mjs); they still do when it's overridden
 * @type {{key: string, path: string, hasStatusChange?: boolean}[]}
 */
export const OVERRIDABLE_STATS = [
  { key: "hpMax", path: "resources.hp.max" },
  { key: "rpMax", path: "resources.rp.max" },
  { key: "physicalDefense", path: "defenses.physical", hasStatusChange: true },
  { key: "physiqueDefense", path: "defenses.physique" },
  { key: "willDefense", path: "defenses.will" },
  { key: "movement", path: "movement", hasStatusChange: true },
  { key: "sppMax", path: "resources.spp.max" },
  { key: "lpMax", path: "resources.lp.max" },
];


/**
 * An override as a number, or null when there's none. Blank, null and anything that isn't a number count as none.
 * @param {*} value
 * @returns {number|null}
 */
export function overrideValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}


/**
 * A number in an object by its dotted path ("resources.hp.max").
 * @param {object} object
 * @param {string} path
 * @returns {*}
 */
function getPath(object, path) {
  return path.split(".").reduce((value, part) => value?.[part], object);
}


/**
 * Set a number in an object by its dotted path. The objects along the path must already be there.
 * @param {object} object
 * @param {string} path
 * @param {number} value
 */
function setPath(object, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  const parent = parts.reduce((current, part) => current?.[part], object);
  if (parent) parent[last] = value;
}


/**
 * Put the GM's overrides on a prepared actor's stats. Call it after everything else is worked out.
 * Stats with no override are left as they are.
 *
 * @param {object} system          The actor's prepared system data. Changed in place.
 * @param {object} [overrides]     system.statOverrides, e.g. { hpMax: 40, movement: null }.
 * @param {object} [statusChanges] How much statuses changed each stat, e.g. { movement: -6, physicalDefense: 0 }
 *                                 (0 or less, worked out in data/actor/base-actor.mjs).
 * @returns {Record<string, {calculated: number, base: number, value: number, statusChange: number, isOverridden: boolean}>}
 *   By stat key. For the sheet's boxes (display only):
 *     calculated    the system's number, before statuses
 *     base          the number the GM sets: the override, or the calculated number when there's none
 *     value         the number now, statuses included (what the actor uses)
 *     statusChange  what statuses add to base to make value (0 or less)
 *     isOverridden  the GM has set an override
 */
export function applyStatOverrides(system, overrides = {}, statusChanges = {}) {
  const info = {};
  for (const stat of OVERRIDABLE_STATS) {
    const current = Number(getPath(system, stat.path)) || 0;
    const statusChange = stat.hasStatusChange ? (Number(statusChanges?.[stat.key]) || 0) : 0;
    const calculated = current - statusChange;
    const override = overrideValue(overrides?.[stat.key]);

    let value = current;
    if (override !== null) {
      // Statuses can take an override down to 0, never below.
      value = Math.max(0, override + statusChange);
      setPath(system, stat.path, value);
    }

    info[stat.key] = {
      calculated,
      base: override ?? calculated,
      value,
      statusChange,
      isOverridden: override !== null,
    };
  }
  return info;
}
