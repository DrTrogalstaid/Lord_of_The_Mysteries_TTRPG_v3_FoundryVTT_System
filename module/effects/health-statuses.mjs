/**
 * The statuses Health turns on and off by itself (rulebook: Bloodbath, Dying/Dead).
 *
 *   Bloodbath  Health below half its maximum, rounded up (12 max: 5 or less).
 *              Off again when healed back up. Starting it also starts Bleeding (BloodbathRule, rules/bloodbath.mjs),
 *              which carries on after Bloodbath ends, until it's treated.
 *   Dying      Health 0 or less. Off again when healed above 0.
 *   Dead       Health below minus the Physique total (the "critical point"); for a Beyonder, below twice that.
 *              Never taken off automatically: the GM decides.
 *
 * syncHealthStatuses() runs after any change to Health (data/actor/base-actor.mjs _onUpdate), on the client that
 * made the change: the Damage / Heal buttons, Bleeding, typing on the sheet, the token's bar.
 *
 * wantedHealthStatuses() is plain math (no `game` / `CONFIG` access), tested under Node (tests/health-statuses.test.mjs).
 */

/**
 * Which Health statuses an actor should have.
 * @param {object} values
 * @param {number} values.hp            Health now (can be below 0).
 * @param {number} values.max           Maximum Health.
 * @param {number} values.physique      Physique total: the death point is minus this.
 * @param {boolean} values.isBeyonder   A Beyonder dies at twice the death point.
 * @param {boolean} [values.isDead]     Already Dead (then Dying isn't added).
 * @returns {{bloodbath: boolean, dying: boolean, dead: boolean, deathPoint: number}}
 *   dead       true when Health is past the death point (Dead should be added)
 *   deathPoint the lowest Health that doesn't kill, e.g. -4 for Physique 4 (-8 for a Beyonder)
 */
export function wantedHealthStatuses({ hp, max, physique, isBeyonder, isDead = false }) {
  const health = Number(hp) || 0;
  const maximum = Number(max) || 0;
  const critical = Math.max(0, Number(physique) || 0);
  const deathPoint = -(isBeyonder ? 2 * critical : critical);

  const dead = health < deathPoint;
  return {
    bloodbath: maximum > 0 && health < Math.ceil(maximum / 2),
    dying: health <= 0 && !dead && !isDead,
    dead,
    deathPoint,
  };
}


/**
 * Turn the Health statuses on or off to match the actor's Health now.
 * Each is only changed when it's different, so this can run after every Health change.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function syncHealthStatuses(actor) {
  const system = actor?.system;
  const hp = system?.resources?.hp;
  if (!hp) return;

  const has = (id) => actor.statuses?.has(id) ?? false;
  const wanted = wantedHealthStatuses({
    hp: hp.value,
    max: hp.max,
    physique: system.attributes?.phy?.total,
    isBeyonder: system.isBeyonder,
    isDead: has("dead"),
  });

  // Dead first, so Dying isn't added on the way down.
  if (wanted.dead && !has("dead")) await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  if (wanted.dying !== has("dying")) await actor.toggleStatusEffect("dying", { active: wanted.dying });
  if (wanted.bloodbath !== has("bloodbath")) await actor.toggleStatusEffect("bloodbath", { active: wanted.bloodbath });
}
