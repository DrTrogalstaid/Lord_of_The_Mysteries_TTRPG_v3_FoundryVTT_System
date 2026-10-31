/**
 * The system's statuses (the rulebook's "Status Effects"), their rules, and registering them with Foundry.
 *
 * Every status is one entry in STATUSES below, and gets a StatusRule (status-rule.mjs) built from it.
 * registerStatusEffects() replaces Foundry's own status list (Prone, Poisoned, ...) with these, so the Token HUD
 * and the Effects tab show the same list.
 *
 * Adding a status: add an entry below and its name to lang/en.json (LORD_OF_THE_MYSTERIES.Status.Names).
 * A status that needs its own code (rolls, start-of-turn rules) gets a StatusRule subclass in its `rule` setting.
 */

import StatusRule from "./status-rule.mjs";

/** Foundry's own icons, until the system has its own art. */
const ICONS = "icons/svg";

/**
 * Every status, in the order the Token HUD and the Effects tab show them. Settings (all optional):
 *   img        Its icon.
 *   page       Its page id in the LOTM Rules > Status Effects journal (the Rules button on the Effects tab).
 *   implies    Statuses that come with it: Helpless brings Bound. Each gets its own linked effect on the actor
 *              (the token shows its icon), removed again with the effect that brought it.
 *   defense    Physical Defense: agility "half" (rounded up) or "none", dodge "none",
 *              modifier added to the Agility + Dodge part (see effects/status-math.mjs).
 *   movement   Movement: agility "half" or "none".
 *   endButton  A button on its Effects tab row that ends it: label, icon, and a chat line ({name} = the actor).
 *   rule       A StatusRule subclass, for a status with its own code. Default: StatusRule.
 * Advantage and Disadvantage share one rules page, as do Dying and Dead.
 */
const STATUSES = {
  lossOfBalance: {
    img: `${ICONS}/falling.svg`,
    page: "dlTI58Stc85NPx2c",
    defense: { agility: "half" },
    movement: { agility: "half" },
    endButton: {
      label: "LORD_OF_THE_MYSTERIES.Status.Buttons.StandUp",
      icon: "fa-solid fa-person-arrow-up-from-line",
      chat: "LORD_OF_THE_MYSTERIES.Status.Chat.StoodUp",
    },
  },
  offGuard: {
    img: `${ICONS}/target.svg`,
    page: "0lDCV0NPovGsVpuo",
    defense: { agility: "none", dodge: "none" },
  },
  helpless: {
    img: `${ICONS}/unconscious.svg`,
    page: "isNdxAmKglOLYL6b",
    implies: ["bound"],
  },
  bound: {
    img: `${ICONS}/net.svg`,
    page: "l3r635tKgr7cILRL",
    defense: { agility: "none", dodge: "none" },
  },
  advantage: {
    img: `${ICONS}/upgrade.svg`,
    page: "1HY7jhTwh5hqhKW1",
  },
  disadvantage: {
    img: `${ICONS}/downgrade.svg`,
    page: "1HY7jhTwh5hqhKW1",
    defense: { modifier: -2 },
  },
  bloodbath: {
    img: `${ICONS}/degen.svg`,
    page: "xOuGan91ZbOexD9O",
  },
  bleeding: {
    img: `${ICONS}/blood.svg`,
    page: "RJJ6FFIcAIetLCAZ",
  },
  dying: {
    img: `${ICONS}/bones.svg`,
    page: "Ae5VsAdAb7tiuTNC",
  },
  dead: {
    img: `${ICONS}/skull.svg`,
    page: "Ae5VsAdAb7tiuTNC",
  },
  fear: {
    img: `${ICONS}/terror.svg`,
    page: "eTPMolBoiW99BRAH",
  },
  angry: {
    img: `${ICONS}/fire.svg`,
    page: "fayzjgNXjFZvBV1B",
  },
  silence: {
    img: `${ICONS}/silenced.svg`,
    page: "WStitnA2uoXTsLrw",
  },
  invisible: {
    img: `${ICONS}/invisible.svg`,
    page: "pUHQzg0XGTg1OKhM",
  },
  blind: {
    img: `${ICONS}/blind.svg`,
    page: "Y4uaYfoMn45r6p3l",
  },
  deaf: {
    img: `${ICONS}/deaf.svg`,
    page: "LnKIsSLeDHsM9uoB",
  },
  shock: {
    img: `${ICONS}/daze.svg`,
    page: "lqrqCDHweAGmyaih",
  },
};

/**
 * The rule for every status, by id.
 * @type {Record<string, StatusRule>}
 */
export const STATUS_RULES = Object.fromEntries(Object.entries(STATUSES).map(([id, config], order) => {
  const Rule = config.rule ?? StatusRule;
  return [id, new Rule(id, { ...config, order })];
}));


/**
 * The rule for one status.
 * @param {string} id
 * @returns {StatusRule|null}   null for a status the system doesn't know (another module's, or Foundry's old ones).
 */
export function statusRule(id) {
  return STATUS_RULES[id] ?? null;
}


/**
 * A set of status ids, plus every status they imply (Helpless adds Bound). Changes and returns the same Set.
 * @param {Set<string>} ids
 * @returns {Set<string>}
 */
export function withImpliedStatuses(ids) {
  const queue = [...ids];
  while (queue.length) {
    for (const extra of STATUS_RULES[queue.pop()]?.implies ?? []) {
      if (ids.has(extra)) continue;
      ids.add(extra);
      queue.push(extra);
    }
  }
  return ids;
}


/**
 * Every status the actor has right now: from its own effects and the ones its Items lend it (a worn charm),
 * skipping effects that are turned off or suppressed (gear that's stowed), plus the statuses those imply.
 *
 * Read straight from the effects rather than from Foundry's actor.statuses, so it gives the right answer at any
 * point while the actor's data is being prepared.
 * @param {Actor} actor
 * @returns {Set<string>}
 */
export function activeStatusIds(actor) {
  const ids = new Set();
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!effect.active) continue;
    for (const id of effect.statuses ?? []) ids.add(id);
  }
  return withImpliedStatuses(ids);
}


/**
 * The rules of every status the actor has right now (see activeStatusIds), in status-list order.
 * @param {Actor} actor
 * @returns {StatusRule[]}
 */
export function activeStatusRules(actor) {
  const ids = activeStatusIds(actor);
  return Object.values(STATUS_RULES).filter((rule) => ids.has(rule.id));
}


/**
 * Give Foundry the system's statuses. Called once from the init hook in lotm.mjs.
 * @param {object} options
 * @param {boolean} options.invisibleHidesToken  The world setting: Invisible works like Foundry's own invisibility
 *                                               (the token is hidden from anyone who can't see invisible things).
 */
export function registerStatusEffects({ invisibleHidesToken = false } = {}) {
  CONFIG.statusEffects = Object.fromEntries(Object.values(STATUS_RULES).map((rule) => [rule.id, rule.toStatusEffect()]));

  // Statuses Foundry itself reacts to.
  CONFIG.specialStatusEffects.DEFEATED = "dead";      // the combat tracker's Defeated marker
  CONFIG.specialStatusEffects.BLIND = "blind";        // the token can't see
  CONFIG.specialStatusEffects.INVISIBLE = invisibleHidesToken ? "invisible" : null;
}
