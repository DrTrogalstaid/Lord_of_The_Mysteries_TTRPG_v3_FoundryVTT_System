/**
 * What statuses add to a roll dialog (apps/roll-dialog.mjs): modifiers, as rows the player can take out for this
 * roll, and notes shown in the dialog and on the chat card.
 *
 * From the roller's own statuses:
 *   Angry/Taunted  -4 on skill and attribute checks (-2 after Meditation (Half))
 *   Fear           -4 on checks against its source
 *   Advantage      +2 on checks against its source (the enemy it has the advantage over)
 *   Blind          note on action rolls: an Inspiration check (DC 15) first, no critical strikes
 *   Deaf           note on Listen checks: hearing checks fail
 * From the targets' statuses (the tokens the roller has targeted):
 *   Helpless       +2 on attacks against it (Advantage), unless the roller already has Advantage against it
 *   Invisible      note: find it first with Spot / Listen against its Stealth
 *   Bound          note: Vital Strike isn't at a disadvantage against it
 * The settings are in STATUSES (status-effects.mjs); the rules for each are in StatusRule (status-rule.mjs).
 */

import { statusRule, withImpliedStatuses } from "./status-effects.mjs";

/**
 * Each active effect on an actor with the rules of its statuses (including implied ones), each status once per effect.
 * @param {Actor} actor
 * @returns {{effect: ActiveEffect, rule: import("./status-rule.mjs").default}[]}
 */
function activeRules(actor) {
  const pairs = [];
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!effect.active) continue;
    for (const id of withImpliedStatuses(new Set(effect.statuses))) {
      const rule = statusRule(id);
      if (rule) pairs.push({ effect, rule });
    }
  }
  return pairs;
}


/**
 * The status modifiers and notes for one roll.
 * @param {object} context
 * @param {Actor} context.actor              Who's rolling.
 * @param {string} context.kind              "skill", "attribute" or "action".
 * @param {string} [context.skillUuid]       For skill checks: the skill's UUID (Deaf only notes Listen checks).
 * @param {Actor[]} [context.targets]        The actors of the roller's targeted tokens.
 * @returns {{modifiers: {key: string, label: string, value: number}[], notes: string[]}}
 *   notes are HTML (escaped).
 */
export function statusRollExtras({ actor, kind, skillUuid = null, targets = [] }) {
  const modifiers = new Map();   // key -> modifier, so the same status isn't added twice
  const notes = new Set();
  const context = { kind, skillUuid, targets };

  // The roller's own statuses.
  for (const { effect, rule } of activeRules(actor)) {
    const modifier = rule.rollModifier(actor, effect, context);
    if (modifier && !modifiers.has(modifier.key)) modifiers.set(modifier.key, modifier);
    const note = rule.rollNote(actor, effect, context);
    if (note) notes.add(note);
  }

  // The targets' statuses. Attacking a Helpless creature gives Advantage, so it isn't added on top of Advantage.
  const hasAdvantage = [...modifiers.keys()].some((key) => key.split(":")[0] === "advantage");
  for (const target of targets) {
    for (const { effect, rule } of activeRules(target)) {
      const modifier = rule.targetRollModifier(target, effect, context);
      if (modifier && !modifiers.has(modifier.key) && !(hasAdvantage && rule.id === "helpless")) {
        modifiers.set(modifier.key, modifier);
      }
      const note = rule.targetRollNote(target, effect, context);
      if (note) notes.add(note);
    }
  }

  return { modifiers: [...modifiers.values()], notes: [...notes] };
}


/**
 * The actors of the tokens the current user has targeted.
 * @returns {Actor[]}
 */
export function targetedActors() {
  return [...(game.user?.targets ?? [])].map((token) => token.actor).filter(Boolean);
}
