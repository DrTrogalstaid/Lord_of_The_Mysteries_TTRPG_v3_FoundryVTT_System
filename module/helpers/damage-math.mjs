/**
 * Damage taken from one hit, after damage resistance, immunity and damage reduction (rulebook, Chapter 6:
 * Defense and Dodge Types).
 *
 * Plain data in / data out (no `game` / `CONFIG` access), so it can be unit tested under Node
 * (tests/damage-math.test.mjs). helpers/action-roll.mjs uses it when the Damage button is clicked.
 *
 * The rules, in order:
 *   1. Immunity: a type the creature is immune to does no damage.
 *   2. Resistance: each type's resistance takes that type's damage down, all the way to 0 if it's big enough.
 *   3. Reduction: taken off ONCE per hit, however many dice or damage types the hit has. The rulebook's examples:
 *      a destruction potion's 2d6 acid + 2d6 poison + 2d6 fire is one hit, reduced once; a blade's 1d5 + 2d12 + 1d8
 *      is one hit, reduced once; 50 air cannons are 50 hits, each reduced. A roll of the Damage button is one hit;
 *      an ability that counts as several attacks (Thunderstorm: "regarded as 3 attacks") rolls damage once per hit.
 *      When the hit has more than one type, the biggest reduction among its types is used, but never more than
 *      that type's own damage (fire reduction can't soak up the physical part of a hit).
 *   4. Reduction never takes a hit below 1 damage. (Resistance and immunity can take it to 0.)
 */


/**
 * A damage type as its key ("physical"), whatever older data saved: the key itself, the sheet's old choice
 * ("Physical", the language key's last part), or the full language key ("LORD_OF_THE_MYSTERIES.DamageTypes.Physical").
 * "all" / "All" is the damage reduction rows' "all damage". Anything else comes back as it was.
 * @param {string} type
 * @param {Record<string, string>} damageTypes   CONFIG.LORD_OF_THE_MYSTERIES.damageTypes ({ physical: "<language key>" }).
 * @returns {string|null}  null for nothing.
 */
export function normalizeDamageType(type, damageTypes = {}) {
  if (!type) return null;
  if (type in damageTypes) return type;
  const lower = String(type).toLowerCase();
  if (lower === "all") return "all";
  return Object.keys(damageTypes).find((key) =>
    key === lower
    || damageTypes[key] === type
    || String(damageTypes[key]).split(".").pop().toLowerCase() === lower
  ) ?? type;
}


/**
 * One hit's damage after the target's defenses.
 * @param {Record<string, number>} types   Incoming damage per type, e.g. { physical: 5, fire: 6 } ("" = untyped).
 * @param {object} [defenses]
 * @param {Record<string, number>} [defenses.reduction]   Reduction per type (actor.system.damageReduction). Its "all"
 *                                                        value is used for untyped damage.
 * @param {Record<string, number>} [defenses.resistance]  Resistance per type (actor.system.damageResistance).
 * @param {string[]} [defenses.immunities]                Types that do no damage (actor.system.damageImmunities).
 * @returns {{incoming: number, resisted: number, reduced: number, total: number,
 *            parts: {type: string, amount: number, resisted: number, reduced: number, reduction: number, taken: number}[]}}
 *   incoming  damage before anything; resisted  taken off by resistance and immunity; reduced  taken off by
 *   reduction; total  damage taken. Per part, reduction = resisted + reduced (what the chat table shows).
 */
export function reduceHit(types, { reduction = {}, resistance = {}, immunities = [] } = {}) {
  const immune = new Set(immunities ?? []);

  // 1-2. Immunity and resistance, type by type.
  const parts = Object.entries(types ?? {}).map(([type, value]) => {
    const amount = Number(value) || 0;
    let resisted = 0;
    if (amount > 0 && type) {
      resisted = immune.has(type) ? amount : Math.min(amount, Math.max(0, Number(resistance?.[type]) || 0));
    }
    return { type, amount, resisted, reduced: 0, taken: amount - resisted };
  });

  // 3. Reduction, once for the whole hit: the type it does the most against.
  let reducedPart = null;
  let reducedBy = 0;
  for (const part of parts) {
    if (part.taken <= 0) continue;
    // A type with no reduction of its own (untyped, or typed as free text like "piercing") gets the "all" reduction.
    const against = Math.max(0, Number(reduction?.[part.type || "all"] ?? reduction?.all) || 0);
    const value = Math.min(against, part.taken);
    if (value > reducedBy) {
      reducedPart = part;
      reducedBy = value;
    }
  }
  if (reducedPart) {
    reducedPart.reduced = reducedBy;
    reducedPart.taken -= reducedBy;
  }

  // 4. Reduction leaves at least 1 damage.
  let total = parts.reduce((sum, part) => sum + part.taken, 0);
  if (reducedPart && total < 1) {
    const giveBack = Math.min(reducedPart.reduced, 1 - total);
    reducedPart.reduced -= giveBack;
    reducedPart.taken += giveBack;
    total += giveBack;
  }

  for (const part of parts) part.reduction = part.resisted + part.reduced;
  const incoming = parts.reduce((sum, part) => sum + part.amount, 0);
  const resisted = parts.reduce((sum, part) => sum + part.resisted, 0);
  const reduced = parts.reduce((sum, part) => sum + part.reduced, 0);
  return { incoming, resisted, reduced, total: Math.max(0, total), parts };
}


/**
 * Big Success damage (rulebook, Chapter 2): never less than half the damage formula's highest result, rounded up.
 * 1d8+5 can roll at most 13, so a Big Success does at least 7.
 * @param {number} rolled    What the damage roll came to.
 * @param {number} maximum   The formula's highest possible result.
 * @returns {{minimum: number, amount: number, isRaised: boolean}}
 */
export function bigSuccessDamage(rolled, maximum) {
  const minimum = Math.ceil(Number(maximum) / 2);
  const isRaised = Number(rolled) < minimum;
  return { minimum, amount: isRaised ? minimum : Number(rolled), isRaised };
}


/**
 * Raise a damage roll's parts to the Big Success minimum, keeping each damage type: each type gets half its own
 * highest result (rounded down), and whatever is left to reach the minimum goes on the biggest part.
 * @param {{type: string, amount: number}[]} maximumParts   Each type's highest result (damageByType of a maximized roll).
 * @param {number} minimum                                  bigSuccessDamage(...).minimum
 * @returns {{type: string, amount: number}[]}              Adds up to `minimum`.
 */
export function splitBigSuccess(maximumParts, minimum) {
  const parts = maximumParts.map((part) => ({ ...part, amount: Math.floor(part.amount / 2) }));
  if (!parts.length) return parts;
  const rest = minimum - parts.reduce((sum, part) => sum + part.amount, 0);
  const biggest = parts.reduce((best, part) => (part.amount > best.amount ? part : best), parts[0]);
  biggest.amount += rest;
  return parts;
}
