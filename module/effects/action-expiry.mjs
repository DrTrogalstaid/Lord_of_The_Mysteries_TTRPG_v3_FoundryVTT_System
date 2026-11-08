/**
 * "Action Used" expiry: an Active Effect that ends after an action has been used some number of times.
 *
 * An effect's system.expiryEvents is a list of ways it can end, on top of Foundry's own Duration:
 *   { type: "actionUsed", actionUuid, uses, used }
 *     actionUuid  the action (or spell) to count. Blank: any action the effect grants (system.actionList), or any
 *                 action at all if it grants none.
 *     uses        how many uses it lasts.
 *     used        how many so far (counted here; the GM can change it on the effect sheet).
 * The effect ends at whichever comes first: Foundry's duration (Duration tab: "1 hour", "3 rounds"...) or any one of
 * the rows. So "1 hour, or until Smite is used once" is a 1-hour duration plus one Action Used row. Foundry's own
 * Expiry event only ends an effect when *both* the duration and the event are reached, so it can't do "whichever
 * comes first", which is why these are a list of their own.
 *
 * What counts as using an action (each calls recordActionUse after the use went through):
 *   - rolling its attack, or casting a spell (rollActionAttack in helpers/action-roll.mjs), including a special
 *     bullet's spell
 *   - firing a gun without an attack roll (fireWithoutRoll in helpers/firearms.mjs)
 *   - its "Spend N" button (useActionSpirituality in helpers/spirituality.mjs)
 *   - switching its toggle on (useToggleAction in effects/toggle-effects.mjs), counted before its effects are put
 *     on, so a toggled effect doesn't count the use that switched it on. Switching off isn't a use.
 * Cancelled rolls, closed dialogs, a gun that clicks empty and a "Use Anyway" warning that's cancelled don't count.
 *
 * Only active effects count (turned on, and not suppressed: stowed gear's effects don't). An action matches by its
 * UUID, or by the compendium entry it was made from, so a row with the compendium's Smite also counts an owned copy.
 *
 * When a row reaches its uses:
 *   - an effect on the actor is deleted (like Foundry's own expiry, CONFIG.ActiveEffect.expiryAction = "delete")
 *   - an effect on an Item (a gear's or ability's passive effect, or a granted ability's copy) is turned off and
 *     its counts reset, so the Item keeps it: turning it back on gives it its uses again
 * and chat says "Blessing ends: Smite was used 1 time."
 *
 * Plain data in / data out at the top (no game / CONFIG), unit tested in tests/action-expiry.test.mjs.
 */


/* -------------------------------------------- */
/*  Counting (pure)                              */
/* -------------------------------------------- */

/** The expiry event types there are. Only Action Used for now. */
export const EXPIRY_EVENT_TYPES = ["actionUsed"];


/**
 * The UUIDs an action is known by: its own, and the compendium entry it was made from (old and new field names).
 * @param {Item|object} action
 * @returns {Set<string>}
 */
export function actionKeys(action) {
  const keys = new Set();
  for (const key of [action?.uuid, action?._stats?.compendiumSource, action?.flags?.core?.sourceId]) {
    if (key) keys.add(key);
  }
  return keys;
}


/**
 * Whether one Action Used row counts this use.
 * @param {{type?: string, actionUuid?: string}} row
 * @param {ActiveEffect|object} effect   The effect the row is on (for its granted actions).
 * @param {Set<string>} keys             actionKeys(action) of the action that was used.
 * @returns {boolean}
 */
export function rowCountsUse(row, effect, keys) {
  if ((row?.type ?? "actionUsed") !== "actionUsed") return false;
  if (row.actionUuid) return keys.has(row.actionUuid);
  const granted = (effect?.system?.actionList ?? []).filter(Boolean);
  return granted.length ? granted.some((uuid) => keys.has(uuid)) : true;
}


/**
 * One use of an action, against one effect's expiry rows.
 * @param {ActiveEffect|object} effect
 * @param {Set<string>} keys   actionKeys(action)
 * @returns {{changed: boolean, expired: boolean, events: object[], ended: object|null}}
 *   events: the rows with their new counts. ended: the first row that reached its uses (for the chat line).
 */
export function countActionUse(effect, keys) {
  const rows = effect?.system?.expiryEvents ?? [];
  let changed = false;
  let ended = null;
  const events = rows.map((row) => {
    const copy = { ...row };
    if (!rowCountsUse(row, effect, keys)) return copy;
    copy.used = Math.max(0, Number(row.used) || 0) + 1;
    changed = true;
    if (!ended && copy.used >= Math.max(1, Number(row.uses) || 1)) ended = copy;
    return copy;
  });
  return { changed, expired: !!ended, events, ended };
}


/**
 * The rows with their counts back at 0 (a fresh copy of an effect, or one an Item turned off when it ran out).
 * @param {object[]} [rows]
 * @returns {object[]}
 */
export function resetExpiryEvents(rows = []) {
  return (rows ?? []).map((row) => ({ ...row, used: 0 }));
}


/**
 * How many uses a row has left.
 * @param {{uses?: number, used?: number}} row
 * @returns {number}
 */
export function usesLeft(row) {
  return Math.max(0, Math.max(1, Number(row?.uses) || 1) - Math.max(0, Number(row?.used) || 0));
}


/* -------------------------------------------- */
/*  Using an action                              */
/* -------------------------------------------- */

/**
 * Someone used an action: count it on every active effect of the actor with an Action Used row that matches, and end
 * the effects that ran out (see the top of this file). Call it once the use has gone through.
 * @param {Actor} actor
 * @param {Item} action   The action or spell that was used.
 * @returns {Promise<string[]>}  The names of the effects that ended.
 */
export async function recordActionUse(actor, action) {
  if (!actor || !action) return [];
  const keys = actionKeys(action);
  const ended = [];

  // Collected first, so ending one effect doesn't disturb the loop over the others.
  const counted = [];
  for (const effect of actor.allApplicableEffects?.() ?? []) {
    if (!effect.system?.expiryEvents?.length) continue;
    const isActive = typeof effect.active === "boolean" ? effect.active : !effect.disabled && !effect.isSuppressed;
    if (!isActive) continue;
    const result = countActionUse(effect, keys);
    if (result.changed) counted.push({ effect, result });
  }

  for (const { effect, result } of counted) {
    try {
      if (!result.expired) {
        await effect.update({ "system.expiryEvents": result.events });
        continue;
      }
      const onItem = effect.parent?.documentName === "Item";
      if (onItem) await effect.update({ disabled: true, "system.expiryEvents": resetExpiryEvents(result.events) });
      else await effect.delete();
      ended.push(effect.name);
      await postEnded(actor, effect, action, result.ended);
    } catch (error) {
      console.error(`lotm | Couldn't count the use of ${action.name} on the effect ${effect.name}`, error);
    }
  }
  return ended;
}


/**
 * Chat: "Blessing ends: Smite was used 1 time." Posted as the actor.
 * @param {Actor} actor
 * @param {ActiveEffect} effect
 * @param {Item} action   The action that was used.
 * @param {{uses: number}} row   The row that ran out.
 */
async function postEnded(actor, effect, action, row) {
  const escape = (text) => Handlebars.escapeExpression(text ?? "");
  const text = game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Expiry.Ended", {
    effect: escape(effect.name),
    action: escape(action.name),
    count: Math.max(1, Number(row?.uses) || 1),
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="lotm chat-effect-applied"><img src="${escape(effect.img)}" alt="" width="24" height="24"><span>${text}</span></div>`,
  });
}
