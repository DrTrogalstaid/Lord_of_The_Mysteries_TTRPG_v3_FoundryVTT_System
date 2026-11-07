/**
 * Check results: did a roll pass, did an attack hit, which defense does an attack go against.
 *
 * Plain data in / data out (no `game` / `CONFIG` access), so it can be unit tested under Node
 * (tests/check-results.test.mjs). The roll dialogs (apps/roll-dialog.mjs), the status checks
 * (effects/status-checks.mjs) and Burning Luck (helpers/luck.mjs) all use these, so every check is judged the same way.
 *
 * The table's rules:
 *   - a check passes when its total meets or beats the DC (15 passes DC 15)
 *   - an attack hits when its total meets or beats the target's defense
 *   - a natural 20 (Big Success) always passes / hits; a natural 1 (Big Failure) always fails / misses
 *   - sanity checks go the other way: roll at or under your current Sanity to pass. A natural 20 is a Big Failure
 *     (the most Sanity the check can take); there's no Big Success
 *   - promotion checks are sanity checks with no Big Success or Big Failure at all
 */

import { physicalDefense } from "../effects/status-math.mjs";


/**
 * The d20's own face on a roll ("natural 20"), before anything is added. null when the roll has no single d20
 * (a 2d20 roll, a damage roll, ...).
 * @param {Roll} roll   An evaluated roll.
 * @returns {number|null}
 */
export function naturalD20(roll) {
  const die = (roll?.dice ?? []).find((term) => term.faces === 20);
  if (!die) return null;
  const kept = (die.results ?? []).filter((result) => result.active !== false && !result.discarded);
  return kept.length === 1 ? kept[0].result : null;
}


/**
 * Whether a check against a DC passes. A natural 20 always passes, a natural 1 always fails.
 * @param {object} values
 * @param {number} values.total      The roll's total (with any Luck burned on it).
 * @param {number|null} [values.natural]  The d20's face (naturalD20).
 * @param {number} values.dc
 * @returns {boolean}
 */
export function checkSucceeds({ total, natural = null, dc }) {
  if (natural === 20) return true;
  if (natural === 1) return false;
  return Number(total) >= Number(dc);
}


/**
 * Whether an attack hits a target. The same rule as a check: meet or beat the defense, natural 20 / 1 decide on
 * their own.
 * @param {object} values
 * @param {number} values.total
 * @param {number|null} [values.natural]
 * @param {number} values.defense   The target's defense against this attack (defenseValue).
 * @returns {boolean}
 */
export function isAttackHit({ total, natural = null, defense }) {
  return checkSucceeds({ total, natural, dc: defense });
}


/**
 * Whether a sanity check passes: the roll (d20 plus any penalty) at or under the current Sanity.
 * A natural 20 is a Big Failure. With isPromotion there are no Big Successes or Failures (promotion checks).
 * @param {object} values
 * @param {number} values.total
 * @param {number|null} [values.natural]
 * @param {number} values.sanity          Current Sanity.
 * @param {boolean} [values.isPromotion]
 * @returns {boolean}
 */
export function sanityCheckSucceeds({ total, natural = null, sanity, isPromotion = false }) {
  if (!isPromotion && natural === 20) return false;
  return Number(total) <= Number(sanity);
}


/**
 * Which defenses an action or spell can go against (system.defenseTarget). "" = no hit check.
 *   physical             10 + Agility + Armor + Dodge
 *   physicalNoEvasion    too fast to dodge (firearms): 10 + Armor, unless the target can quick dodge
 *                        (system.isQuickDodgable), then full Physical Defense
 *   physicalUndodgeable  can't be dodged even with Quick Dodge (lightning, light): 10 + Armor
 *   physicalNoArmor      ignores armor (grapple): 10 + Agility + Dodge
 *   will                 10 + Will
 *   physique             10 + Physique
 * The labels are in CONFIG.LORD_OF_THE_MYSTERIES.defenseTargets.
 */
export const DEFENSE_TARGETS = ["physical", "physicalNoEvasion", "physicalUndodgeable", "physicalNoArmor", "will", "physique"];


/**
 * The defense an action or spell actually rolls against: its Defense Targeted, or for a gun shot left blank
 * (Uses ammo: Fire), "too fast to dodge". Guns made before Defense Targeted existed are all blank, and a shot is
 * always an attack, so they hit or miss without each one being edited. Anything else left blank has no hit check.
 * @param {{defenseTarget?: string, ammoUse?: string}} [system]   The action's or spell's system data.
 * @returns {string}  One of DEFENSE_TARGETS, or "".
 */
export function effectiveDefenseTarget(system) {
  if (system?.defenseTarget) return system.defenseTarget;
  return system?.ammoUse === "fire" ? "physicalNoEvasion" : "";
}


/**
 * Whether an attack card should tell the GM its action has no Defense Targeted: tokens were targeted, and the action
 * looks like an attack (an Attack action, or it has a damage formula), but there's nothing to check them against.
 * @param {{defenseTarget?: string, ammoUse?: string, actionType?: string, damageRollMacro?: string}} [system]
 * @param {number} targetCount   How many tokens the roller has targeted.
 * @returns {boolean}
 */
export function isMissingDefenseTarget(system, targetCount) {
  if (!system || !targetCount || effectiveDefenseTarget(system)) return false;
  const damage = String(system.damageRollMacro ?? "").trim().toLowerCase();
  return system.actionType === "attack" || (damage !== "" && damage !== "na");
}


/**
 * A creature's defense against one kind of attack.
 * Statuses still count (Off Guard, Bound, Disadvantage...): they're in system.statusModifiers (base-actor.mjs).
 * @param {object} system          The target actor's prepared system data.
 * @param {string} defenseTarget   One of DEFENSE_TARGETS.
 * @returns {number|null}          null for "" or an unknown defense (no hit check).
 */
export function defenseValue(system, defenseTarget) {
  if (!system) return null;
  const defenses = system.defenses ?? {};
  const statusDefense = system.statusModifiers?.defense ?? {};

  // Physical Defense worked out again with parts left out.
  const physical = ({ noEvasion = false, noArmor = false } = {}) => physicalDefense({
    agility: system.attributes?.agi?.total ?? 0,
    armor: noArmor ? 0 : (defenses.armor ?? 0),
    dodge: defenses.dodge ?? 0,
    defense: noEvasion ? { ...statusDefense, agility: "none", dodge: "none" } : statusDefense,
  });

  switch (defenseTarget) {
    case "physical":
      return defenses.physical ?? physical();
    case "physicalNoEvasion":
      return system.isQuickDodgable ? (defenses.physical ?? physical()) : physical({ noEvasion: true });
    case "physicalUndodgeable":
      return physical({ noEvasion: true });
    case "physicalNoArmor":
      return physical({ noArmor: true });
    case "will":
      return defenses.will ?? null;
    case "physique":
      return defenses.physique ?? null;
    default:
      return null;
  }
}


/**
 * A roll's total with Luck burned on it: the original total plus every amount burned (negative = lowered).
 * @param {number} total
 * @param {number[]} [burns]
 * @returns {number}
 */
export function totalWithLuck(total, burns = []) {
  return Number(total) + burns.reduce((sum, amount) => sum + (Number(amount) || 0), 0);
}
