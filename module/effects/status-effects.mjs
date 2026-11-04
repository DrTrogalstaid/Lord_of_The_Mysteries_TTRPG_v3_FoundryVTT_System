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
import AngryRule from "./rules/angry.mjs";
import BleedingRule from "./rules/bleeding.mjs";
import BloodbathRule from "./rules/bloodbath.mjs";
import DyingRule from "./rules/dying.mjs";
import FearRule from "./rules/fear.mjs";

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
 *   turnStartNote  A line on the creature's start-of-turn card while it has the status (effects/turn-start.mjs).
 *   roll       A modifier on the creature's own rolls: { modifier, kinds, scope } (scope "source": only against
 *              the effect's source). kinds: "skill", "attribute", "action"; default all.
 *   targetRoll A modifier on rolls made against the creature: { modifier, kinds, label }.
 *   note       A note on the creature's own rolls: { key, kinds, skill } (skill: only that skill's checks).
 *   targetNote A note on rolls made against the creature: { key, kinds }.
 *   restrict   What it stops the creature doing: { actionTypes, traits, all, reason }. Using it warns first,
 *              with Use Anyway (effects/status-restrictions.mjs). Traits are in CONFIG.LORD_OF_THE_MYSTERIES.actionTraits.
 *   rule       A StatusRule subclass, for a status with its own code (effects/rules/). Default: StatusRule.
 * Advantage and Disadvantage share one rules page, as do Dying and Dead.
 */
const STATUSES = {
  lossOfBalance: {
    img: `${ICONS}/falling.svg`,
    page: "dlTI58Stc85NPx2c",
    defense: { agility: "half" },
    movement: { agility: "half" },
    restrict: { actionTypes: ["move"], reason: "LORD_OF_THE_MYSTERIES.Status.Restrictions.lossOfBalance" },
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
    restrict: { traits: ["reaction"], reason: "LORD_OF_THE_MYSTERIES.Status.Restrictions.offGuard" },
  },
  helpless: {
    img: `${ICONS}/unconscious.svg`,
    page: "isNdxAmKglOLYL6b",
    implies: ["bound"],
    // Attacking a Helpless creature gives Advantage (+2).
    targetRoll: { modifier: 2, kinds: ["action"], label: "LORD_OF_THE_MYSTERIES.Status.Rolls.HelplessTarget" },
  },
  bound: {
    img: `${ICONS}/net.svg`,
    page: "l3r635tKgr7cILRL",
    defense: { agility: "none", dodge: "none" },
    restrict: { actionTypes: ["move"], traits: ["grapple", "parry"], reason: "LORD_OF_THE_MYSTERIES.Status.Restrictions.bound" },
    targetNote: { key: "LORD_OF_THE_MYSTERIES.Status.Notes.TargetBound", kinds: ["action"] },
  },
  advantage: {
    img: `${ICONS}/upgrade.svg`,
    page: "1HY7jhTwh5hqhKW1",
    // +2 to skill and attribute checks against the enemy (the effect's source).
    roll: { modifier: 2, scope: "source" },
  },
  disadvantage: {
    img: `${ICONS}/downgrade.svg`,
    page: "1HY7jhTwh5hqhKW1",
    defense: { modifier: -2 },
  },
  bloodbath: {
    rule: BloodbathRule,
    img: `${ICONS}/degen.svg`,
    page: "xOuGan91ZbOexD9O",
  },
  bleeding: {
    rule: BleedingRule,
    img: `${ICONS}/blood.svg`,
    page: "RJJ6FFIcAIetLCAZ",
    endButton: {
      label: "LORD_OF_THE_MYSTERIES.Status.Buttons.Treated",
      icon: "fa-solid fa-kit-medical",
      chat: "LORD_OF_THE_MYSTERIES.Status.Chat.Treated",
    },
  },
  dying: {
    rule: DyingRule,
    img: `${ICONS}/bones.svg`,
    page: "Ae5VsAdAb7tiuTNC",
  },
  dead: {
    img: `${ICONS}/skull.svg`,
    page: "Ae5VsAdAb7tiuTNC",
    restrict: { all: true, reason: "LORD_OF_THE_MYSTERIES.Status.Restrictions.dead" },
  },
  fear: {
    rule: FearRule,
    img: `${ICONS}/terror.svg`,
    page: "eTPMolBoiW99BRAH",
    // -4 to checks related to the source of the fear.
    roll: { modifier: -4, scope: "source" },
  },
  angry: {
    rule: AngryRule,
    img: `${ICONS}/fire.svg`,
    page: "fayzjgNXjFZvBV1B",
    // -4 to every skill and attribute check (-2 after Meditation (Half), see rules/angry.mjs).
    roll: { modifier: -4 },
  },
  silence: {
    img: `${ICONS}/silenced.svg`,
    page: "WStitnA2uoXTsLrw",
    restrict: { traits: ["speech"], reason: "LORD_OF_THE_MYSTERIES.Status.Restrictions.silence" },
  },
  invisible: {
    img: `${ICONS}/invisible.svg`,
    page: "pUHQzg0XGTg1OKhM",
    targetNote: { key: "LORD_OF_THE_MYSTERIES.Status.Notes.TargetInvisible", kinds: ["action", "skill"] },
  },
  // Ghosts, wraiths and other spirit bodies: only Spirit Sight and Death Sight can see the token
  // (canvas/spirit-vision.mjs). No rules page yet.
  ethereal: {
    img: `${ICONS}/aura.svg`,
  },
  blind: {
    img: `${ICONS}/blind.svg`,
    page: "Y4uaYfoMn45r6p3l",
    restrict: { traits: ["aimed"], reason: "LORD_OF_THE_MYSTERIES.Status.Restrictions.blind" },
    note: { key: "LORD_OF_THE_MYSTERIES.Status.Notes.Blind", kinds: ["action"] },
  },
  deaf: {
    img: `${ICONS}/deaf.svg`,
    page: "LnKIsSLeDHsM9uoB",
    // Only on Listen checks (the skill in CONFIG.LORD_OF_THE_MYSTERIES.listenSkillUuid).
    note: { key: "LORD_OF_THE_MYSTERIES.Status.Notes.Deaf", kinds: ["skill"], skill: "Compendium.lotm.skills_compendium.Item.NLLyOSb3OqhMvLVP" },
  },
  shock: {
    img: `${ICONS}/daze.svg`,
    page: "lqrqCDHweAGmyaih",
    turnStartNote: "LORD_OF_THE_MYSTERIES.Status.TurnStart.Shock",
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
  // Not one of Foundry's: the system's own senses check it (canvas/spirit-vision.mjs).
  CONFIG.specialStatusEffects.ETHEREAL = "ethereal";   // only Spirit Sight and Death Sight see the token
}
