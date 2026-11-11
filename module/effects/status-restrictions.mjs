/**
 * Statuses that stop an action or spell: a warning before it's used, with Use Anyway.
 *
 * Nothing is blocked outright: the rules have exceptions (a bound character may squirm along, a dying one may force
 * an action with a Will check), so the warning gives the GM and players the chance to talk it over. When it's used
 * anyway, the chat says so ("Used despite: Bound").
 *
 * Checked wherever an action is used: its attack roll (rollActionAttack, helpers/action-roll.mjs), the Spend N
 * Spirituality button (useActionSpirituality, helpers/spirituality.mjs), a Fire button (fireWithoutRoll,
 * helpers/firearms.mjs), and the gun's Reload / Chamber / Rotate / Unload buttons (GunHandling, helpers/gun-handling.mjs:
 * it has an Action Type like an action, so it's checked the same way).
 *
 * What each status stops is its `restrict` setting (status-effects.mjs), or its own restriction() (Dying).
 *   Loss of Balance  movement actions             Bound    movement actions, grapples and parries
 *   Off Guard        reactions                    Silence  speech (language-related actions and spells)
 *   Blind            anything aimed at someone (an Inspiration check, DC 15, first)
 *   Dying            anything but free and quick actions (unless physically improved)
 *   Dead             everything
 */

import { statusRule, withImpliedStatuses } from "./status-effects.mjs";
import { statusChat } from "./status-checks.mjs";
import { renderTemplateSync } from "../helpers/render.mjs";

/**
 * Why the actor's statuses stop it using this action or spell right now. Each status at most once.
 * @param {Actor} actor
 * @param {Item} item    The action or spell.
 * @returns {{statusId: string, name: string, reason: string}[]}
 */
export function statusRestrictions(actor, item) {
  const found = new Map();
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!effect.active) continue;
    for (const id of withImpliedStatuses(new Set(effect.statuses))) {
      const rule = statusRule(id);
      if (!rule || found.has(id)) continue;
      const reason = rule.restriction(item, actor, effect);
      if (reason) found.set(id, { statusId: id, name: game.i18n.localize(rule.name), reason });
    }
  }
  return [...found.values()];
}


/**
 * Before an action or spell is used: if a status stops it, ask the user. Nothing to warn about: goes ahead.
 * @param {Actor} actor
 * @param {Item} item
 * @returns {Promise<{proceed: boolean, note: string}>}
 *   proceed  false when the user cancelled
 *   note     HTML for the chat card when it was used anyway ("Used despite: Bound"), otherwise ""
 */
export async function confirmStatusRestrictions(actor, item) {
  const found = statusRestrictions(actor, item);
  if (!found.length) return { proceed: true, note: "" };

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Restrictions.Title", { name: item.name }) },
    content: renderTemplateSync("systems/lotm/templates/dialogs/status-restrictions.hbs", {
      actorName: actor.name, itemName: item.name, reasons: found.map((entry) => entry.reason),
    }),
    buttons: [
      { action: "use", label: "LORD_OF_THE_MYSTERIES.Status.Restrictions.UseAnyway", icon: "fa-solid fa-triangle-exclamation" },
      { action: "cancel", label: "LORD_OF_THE_MYSTERIES.Status.Restrictions.Cancel", icon: "fa-solid fa-xmark", default: true },
    ],
    rejectClose: false,
    modal: true,
  });
  if (choice !== "use") return { proceed: false, note: "" };

  return {
    proceed: true,
    note: renderTemplateSync("systems/lotm/templates/chat/used-despite.hbs", {
      statuses: found.map((entry) => entry.name).join(", "),
    }),
  };
}


/**
 * For uses with no roll card of their own (Spend Spirituality, Reload): say in chat that it was used anyway.
 * Seen by everyone, like the action itself.
 * @param {Actor} actor
 * @param {Item} item
 * @param {string} note    From confirmStatusRestrictions. Empty: nothing is posted.
 * @returns {Promise<void>}
 */
export async function postUsedDespite(actor, item, note) {
  if (!note) return;
  await statusChat(actor, renderTemplateSync("systems/lotm/templates/chat/item-note.hbs", { name: item.name, note }), { isPublic: true });
}
