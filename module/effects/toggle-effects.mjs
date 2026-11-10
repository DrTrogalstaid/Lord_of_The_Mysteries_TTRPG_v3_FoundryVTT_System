/**
 * Toggled effects: an effect on an action or spell whose Use is "Toggle". Using the action switches the effect on
 * (a copy goes on the user), and using it again switches it off (the copy is removed). For abilities that are kept
 * up, like Spirit Vision: the "Activate Spirit Vision" action carries the Spirit Vision effect, set to Toggle.
 *
 * Where it's switched from:
 *   - the On / Off button on the action's row on the character sheet (useToggleAction). Switching on checks the
 *     user's statuses first (Silence, Bound...) and spends the action's Spirituality Cost; switching off is free.
 *   - the effect's button on the action's attack card in chat (toggleEffect, through applyItemEffect in
 *     effect-application.mjs). The roll already spent any Spirituality.
 *
 * Keeping it up: an effect can cost Spirituality every round while it's on (its "Spirituality per round", system.upkeep,
 * set on the effect's LotM tab). It's paid at the start of each of the owner's turns in combat (payUpkeep, called by
 * LordOfTheMysteriesCombat in documents/combat.mjs). Not enough Spirituality: the effect switches off. Out of combat
 * there are no rounds, so nothing is charged. Spirit Vision: Spirituality Cost 1 to switch on, 1 per round after.
 *
 * Each copy remembers the effect it came from (flags.lotm.toggledFrom = that effect's UUID), which is how using the
 * action again finds it. Deleting the copy by hand on the Effects tab switches it off too.
 */

import { createEffectsOn, deleteEffectsOn, effectCopyData, effectUse } from "./effect-application.mjs";
import { postEffectLine } from "./effect-chat.mjs";
import { confirmStatusRestrictions, postUsedDespite } from "./status-restrictions.mjs";
import { currentSpirituality, spendSpirituality, spiritualityCost, spiritualityNote } from "../helpers/spirituality.mjs";
import { recordActionUse } from "./action-expiry.mjs";

/** The effect Use (system.application.mode) for effects that are switched on and off. */
export const TOGGLE_USE = "toggle";



/* -------------------------------------------- */
/*  What's on                                    */
/* -------------------------------------------- */

/**
 * The effects an action or spell switches on and off.
 * @param {Item} item
 * @returns {ActiveEffect[]}
 */
export function toggleEffectsOf(item) {
  return (item?.effects?.contents ?? []).filter((effect) => effectUse(effect) === TOGGLE_USE);
}


/**
 * The copies of a toggled effect on an actor: there are some while it's switched on.
 * @param {Actor} actor
 * @param {ActiveEffect} effect   The effect on the action.
 * @returns {ActiveEffect[]}
 */
export function copiesOn(actor, effect) {
  return (actor?.effects?.contents ?? []).filter((copy) => copy.flags?.lotm?.toggledFrom === effect.uuid);
}


/**
 * Is this action switched on for this actor (any of its toggled effects)?
 * @param {Actor} actor
 * @param {Item} item
 * @returns {boolean}
 */
export function isToggledOn(actor, item) {
  return toggleEffectsOf(item).some((effect) => copiesOn(actor, effect).length > 0);
}


/**
 * The data for a copy of a toggled effect: a normal copy (effectCopyData) that remembers where it came from.
 * @param {ActiveEffect} effect
 * @returns {object}
 */
export function toggledCopyData(effect) {
  const data = effectCopyData(effect);
  data.flags = { ...(data.flags ?? {}), lotm: { ...(data.flags?.lotm ?? {}), toggledFrom: effect.uuid } };
  return data;
}


/* -------------------------------------------- */
/*  Switching                                    */
/* -------------------------------------------- */

/**
 * The On / Off button on an action's row: switch its toggled effects on or off for the actor, and say so in chat.
 *   on -> off   removes the copies. Free.
 *   off -> on   checks statuses (warns, with Use Anyway), spends the Spirituality Cost (not enough: nothing
 *               happens), then puts a copy of each toggled effect on the actor.
 * @param {Actor} actor
 * @param {Item} action   An action or spell.
 * @returns {Promise<boolean|null>}  true = switched on, false = switched off, null = nothing changed.
 */
export async function useToggleAction(actor, action) {
  const effects = toggleEffectsOf(action);
  if (!actor || !effects.length) return null;
  // Chat names the effect ("Spirit Vision") when there's one, the action when there are several.
  const named = effects.length === 1 ? effects[0] : action;

  if (isToggledOn(actor, action)) {
    const ids = effects.flatMap((effect) => copiesOn(actor, effect).map((copy) => copy.id));
    if (!(await deleteEffectsOn(actor, ids))) return null;
    await postSwitched(actor, named, false);
    return false;
  }

  const { proceed, note } = await confirmStatusRestrictions(actor, action);
  if (!proceed) return null;

  // Check the cost first, so nothing is switched on that can't be paid for (spendSpirituality warns).
  const cost = spiritualityCost(action);
  if (cost > currentSpirituality(actor).value) {
    await spendSpirituality(actor, cost, { reason: action.name, chat: false });
    return null;
  }
  // Switching on is a use (effects/action-expiry.mjs). Counted before the copies go on, so they don't count it.
  await recordActionUse(actor, action);
  if (!(await createEffectsOn(actor, effects.map(toggledCopyData)))) return null;
  const spent = cost > 0 ? await spendSpirituality(actor, cost, { reason: action.name, chat: false }) : null;

  await postSwitched(actor, named, true, spiritualityNote(spent));
  await postUsedDespite(actor, action, note);
  return true;
}


/**
 * One toggled effect's button on an attack card in chat (applyItemEffect): switch it on or off for the caster.
 * No Spirituality here: rolling the attack already spent it.
 * @param {ActiveEffect} effect
 * @param {Actor} caster
 * @returns {Promise<string[]>}  The caster's name when it changed, as the other uses return who got it.
 */
export async function toggleEffect(effect, caster) {
  const copies = copiesOn(caster, effect);
  const isOn = copies.length === 0;
  const changed = isOn
    ? await createEffectsOn(caster, [toggledCopyData(effect)])
    : await deleteEffectsOn(caster, copies.map((copy) => copy.id));
  if (!changed) return [];
  await postSwitched(caster, effect, isOn);
  return [caster.name];
}


/**
 * What an effect costs to keep up each round (system.upkeep), in whole Spirituality.
 * @param {ActiveEffect} effect
 * @returns {number}
 */
export function upkeepOf(effect) {
  return Math.max(0, Math.floor(Number(effect?.system?.upkeep) || 0));
}


/**
 * The start of the actor's turn in combat: pay to keep up each toggled effect that's on and costs Spirituality per
 * round. One that can't be paid for switches off. Each payment, or switch-off, is said in chat.
 * Runs on the active GM's client (LordOfTheMysteriesCombat).
 * @param {Actor} actor
 * @returns {Promise<{kept: string[], ended: string[]}>}   The names of the effects kept up, and switched off.
 */
export async function payUpkeep(actor) {
  const result = { kept: [], ended: [] };
  const upkept = (actor?.effects?.contents ?? []).filter((effect) => effect.flags?.lotm?.toggledFrom
    && (effect.active ?? !effect.disabled) && upkeepOf(effect) > 0);

  for (const effect of upkept) {
    const cost = upkeepOf(effect);
    if (cost > currentSpirituality(actor).value) {
      await deleteEffectsOn(actor, [effect.id]);
      await postRanOut(actor, effect);
      result.ended.push(effect.name);
      continue;
    }
    // "Klein spends 1 Spirituality on Spirit Vision."
    await spendSpirituality(actor, cost, { reason: effect.name });
    result.kept.push(effect.name);
  }
  return result;
}


/**
 * The chat line when an effect switches off for lack of Spirituality.
 * @param {Actor} actor
 * @param {ActiveEffect} effect
 */
async function postRanOut(actor, effect) {
  await postEffectLine({
    speaker: ChatMessage.getSpeaker({ actor }),
    img: effect.img,
    key: "LORD_OF_THE_MYSTERIES.Effects.Toggle.RanOut",
    data: { name: actor.name, effect: effect.name },
  });
}


/**
 * The chat line: "Klein switches on Spirit Vision." / "Klein switches off Spirit Vision."
 * @param {Actor} actor
 * @param {ActiveEffect|Item} named   What's named: the effect, or the action.
 * @param {boolean} isOn
 * @param {string} [extra]            More HTML after the line ("-1 Spirituality").
 */
async function postSwitched(actor, named, isOn, extra = "") {
  const key = isOn ? "LORD_OF_THE_MYSTERIES.Effects.Toggle.ChatOn" : "LORD_OF_THE_MYSTERIES.Effects.Toggle.ChatOff";
  await postEffectLine({
    speaker: ChatMessage.getSpeaker({ actor }),
    img: named.img,
    key,
    data: { name: actor.name, effect: named.name },
    extra,
  });
}


/* -------------------------------------------- */
/*  The sheet's button                           */
/* -------------------------------------------- */

/**
 * The On / Off button for an action's row on the character sheet (entry-rolls.hbs).
 * @param {Actor} actor
 * @param {Item} action
 * @returns {{isOn: boolean, label: string, tooltip: string}|null}   null when the action has nothing to switch.
 */
export function toggleButton(actor, action) {
  const effects = toggleEffectsOf(action);
  if (!effects.length) return null;
  const isOn = isToggledOn(actor, action);
  const cost = spiritualityCost(action);
  const upkeep = effects.reduce((total, effect) => total + upkeepOf(effect), 0);
  let tooltip;
  if (isOn) tooltip = game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipOn", { name: action.name });
  else if (cost > 0) tooltip = game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipOffCost", { name: action.name, cost });
  else tooltip = game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipOff", { name: action.name });
  if (upkeep > 0) tooltip += ` ${game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipUpkeep", { upkeep })}`;
  return {
    isOn,
    label: game.i18n.localize(isOn ? "LORD_OF_THE_MYSTERIES.Effects.Toggle.On" : "LORD_OF_THE_MYSTERIES.Effects.Toggle.Off"),
    tooltip,
  };
}
