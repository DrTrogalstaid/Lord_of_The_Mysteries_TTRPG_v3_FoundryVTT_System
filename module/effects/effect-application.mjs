/**
 * Handing out the effects stored on spells, actions, abilities and gear.
 *
 * An effect on an Item is used in one of these ways (its "use"; set on the effect sheet's LotM tab):
 *   passive   it lends itself to the Item's owner while the Item is owned (core's transfer). Nothing to hand out.
 *   targets   a copy goes on every token the user has targeted. Source: the caster.
 *   self      a copy goes on the caster. Source: the one token the user has targeted, if exactly one
 *             (Raid: Advantage over that enemy), otherwise none.
 *   area      the user places a shape on the scene; everyone inside gets a copy, once, after a confirm list
 *             (effect-areas.mjs). Source: the caster.
 *   zone      a shape stays on the scene; tokens have a copy while inside it (effect-areas.mjs). Source: the caster.
 *   toggle    switched on and off: using it puts a copy on the caster, using it again removes it
 *             (toggle-effects.mjs). For abilities that are kept up, like Spirit Vision.
 *
 * Where it's handed out from:
 *   - the Apply buttons on an action's or spell's attack card in chat (effectButtonsHTML / applyEffectFromMessage)
 *   - the Apply button on the item sheet's Effects tab (sheets/base-item-sheet.mjs)
 *   - dragging the effect onto a token (Foundry does that itself; LotmActiveEffect#_preCreate fills in the source)
 *
 * Players can't change actors they don't own, so a copy for someone else's actor (an enemy) is made by the GM:
 * the player's client asks the active GM through a query ("lotm.createEffects" / "lotm.deleteEffects",
 * registerEffectQueries below; askGM). That needs a GM logged in.
 *
 * Each copy is a fresh effect: its clock starts when it's made, and resisted / halved marks start cleared.
 */

import { resetExpiryEvents } from "./action-expiry.mjs";

/** Item types whose new effects start as passive (they lend themselves to the owner). Others start as "targets". */
const PASSIVE_ITEM_TYPES = ["ability", "sequence", "gear"];

/** The queries a player's client sends the GM to put effects on, or take them off, an actor the player doesn't own. */
const CREATE_EFFECTS_QUERY = "lotm.createEffects";
const DELETE_EFFECTS_QUERY = "lotm.deleteEffects";

const localize = (key) => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = (text) => Handlebars.escapeExpression(text ?? "");


/* -------------------------------------------- */
/*  What an effect is for                        */
/* -------------------------------------------- */

/**
 * How an effect is used: "passive" (an Item lends it to its owner), or how it's handed out
 * ("targets", "self", "area", "zone", "toggle").
 * @param {ActiveEffect} effect
 * @returns {string}
 */
export function effectUse(effect) {
  if (effect.parent?.documentName === "Item" && effect.transfer) return "passive";
  return effect.system?.application?.mode ?? "targets";
}


/**
 * What a new effect on this type of Item starts as.
 * @param {string} itemType
 * @returns {"passive"|"targets"}
 */
export function defaultUseFor(itemType) {
  return PASSIVE_ITEM_TYPES.includes(itemType) ? "passive" : "targets";
}


/**
 * The data that makes an effect start as `use`: { transfer, "system.application.mode" }.
 * @param {string} use   "passive", "targets", "self", "area" or "zone".
 * @returns {object}
 */
export function useData(use) {
  if (use === "passive") return { transfer: true };
  return { transfer: false, "system.application.mode": use };
}


/**
 * A short label for how an effect is used, e.g. "Passive", "Targets", "Area (once): Circle, 10 ft".
 * @param {ActiveEffect} effect
 * @returns {string}
 */
export function useLabel(effect) {
  const use = effectUse(effect);
  if (use === "passive") return localize("LORD_OF_THE_MYSTERIES.Effects.Use.passive");
  const label = localize(CONFIG.LORD_OF_THE_MYSTERIES.effectApplicationModes[use] ?? use);
  if (use !== "area" && use !== "zone") return label;

  const { shape, size } = effect.system.application;
  const units = canvas?.scene?.grid?.units ?? game.system?.grid?.units ?? "";
  const shapeName = localize(CONFIG.LORD_OF_THE_MYSTERIES.effectAreaShapes[shape] ?? shape);
  return `${label}: ${shapeName}, ${size}${units ? ` ${units}` : ""}`;
}


/* -------------------------------------------- */
/*  Copies                                       */
/* -------------------------------------------- */

/**
 * The data for one copy of an effect, ready to create on an actor.
 *   - a new effect, not a link: no id, and no start time, so its duration starts when it's made
 *   - origin: the Item it's handed out from (or what the effect itself named)
 *   - system.source: who it's about (see the "use" list at the top)
 *   - marks from the original's own life are cleared: resisted, halved, turn-start buttons, linked-effect id
 * @param {ActiveEffect} effect
 * @param {object} [options]
 * @param {string|null} [options.source]   Actor UUID for system.source.
 * @param {string|null} [options.origin]   Overrides the origin. Default: the effect's Item, or its own origin.
 * @returns {object}
 */
export function effectCopyData(effect, { source = null, origin = null } = {}) {
  const data = effect.toObject();
  delete data._id;

  // The copy's clock starts when it's created (Foundry fills these in). Older and newer field names both.
  delete data.start;
  if (data.duration) {
    for (const key of ["startTime", "startRound", "startTurn", "combat"]) delete data.duration[key];
  }

  data.transfer = false;
  data.disabled = false;
  const fromItem = effect.parent?.documentName === "Item" ? effect.parent.uuid : null;
  data.origin = origin ?? fromItem ?? data.origin ?? null;

  data.system = {
    ...(data.system ?? {}),
    source,
    hasResisted: false,
    isPenaltyHalved: false,
    impliedBy: "",
    turnChecks: [],
    grantedFrom: null,
    // A fresh copy has all its uses (effects/action-expiry.mjs).
    expiryEvents: resetExpiryEvents(data.system?.expiryEvents),
  };

  if (data._stats) {
    data._stats.duplicateSource = effect.uuid ?? null;
    data._stats.exportSource = null;
  }
  return data;
}


/* -------------------------------------------- */
/*  Handing it out                               */
/* -------------------------------------------- */

/**
 * The tokens the current user has targeted, as { name, actor } (one per token; tokens with no actor left out).
 * @returns {{name: string, actor: Actor}[]}
 */
export function targetedTokens() {
  return [...(game.user?.targets ?? [])]
    .filter((token) => token.actor)
    .map((token) => ({ name: token.document?.name ?? token.name ?? token.actor.name, actor: token.actor }));
}


/**
 * Hand out an effect stored on an Item, the way its use says (see the top of this file).
 * @param {ActiveEffect} effect      An effect on a spell, action, ability or gear.
 * @param {object} [options]
 * @param {Actor} [options.caster]   Who's using it. Default: the Item's owner.
 * @returns {Promise<string[]|null>} The names of the tokens that got it, or null when nothing was handed out.
 */
export async function applyItemEffect(effect, { caster = null } = {}) {
  const use = effectUse(effect);
  if (use === "passive") {
    ui.notifications.info(format("LORD_OF_THE_MYSTERIES.Effects.Apply.Passive", { name: effect.name }));
    return null;
  }

  caster ??= effect.parent?.actor ?? null;
  if (!caster) {
    ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Apply.NoCaster", { name: effect.name }));
    return null;
  }

  const targets = targetedTokens();
  switch (use) {
    case "targets": {
      if (!targets.length) {
        ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Apply.NoTargets", { name: effect.name }));
        return null;
      }
      return giveEffect(effect, targets, { caster, source: caster.uuid });
    }

    case "self": {
      // Exactly one target: the effect is about that creature (Advantage over this enemy).
      const only = targets.length === 1 ? targets[0].actor : null;
      const source = only && only.uuid !== caster.uuid ? only.uuid : null;
      return giveEffect(effect, [{ name: caster.name, actor: caster }], { caster, source });
    }

    // Shapes on the scene (loaded when needed, so this file works without the canvas code).
    case "area": {
      const { applyArea } = await import("./effect-areas.mjs");
      return applyArea(effect, { caster });
    }
    case "zone": {
      const { createZone } = await import("./effect-areas.mjs");
      return createZone(effect, { caster });
    }

    // On the caster until used again (loaded when needed, like the shapes).
    case "toggle": {
      const { toggleEffect } = await import("./toggle-effects.mjs");
      return toggleEffect(effect, caster);
    }

    default:
      return null;
  }
}


/**
 * Put a copy of the effect on each of these tokens' actors (once per actor), then say so in chat.
 * @param {ActiveEffect} effect
 * @param {{name: string, actor: Actor}[]} recipients
 * @param {object} options
 * @param {Actor} options.caster
 * @param {string|null} options.source   Actor UUID for the copies' system.source.
 * @returns {Promise<string[]>}  The names of those that got it.
 */
export async function giveEffect(effect, recipients, { caster, source }) {
  const data = effectCopyData(effect, { source });
  const seen = new Set();
  const given = [];
  for (const { name, actor } of recipients) {
    if (seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    if (await createEffectsOn(actor, [data])) given.push(name);
  }
  if (given.length) await postApplied(caster, effect, given);
  return given;
}


/**
 * Create effects on an actor: straight away when the user owns it, otherwise through the GM.
 * @param {Actor} actor
 * @param {object[]} effects   Effect data.
 * @returns {Promise<boolean>} Whether they were created.
 */
export async function createEffectsOn(actor, effects) {
  if (actor.isOwner) {
    await actor.createEmbeddedDocuments("ActiveEffect", effects);
    return true;
  }
  return !!(await askGM(CREATE_EFFECTS_QUERY, { actorUuid: actor.uuid, effects }, actor.name));
}


/**
 * Delete effects from an actor: straight away when the user owns it, otherwise through the GM.
 * Effects already gone are skipped.
 * @param {Actor} actor
 * @param {string[]} ids   Effect ids on that actor.
 * @returns {Promise<boolean>} Whether anything was deleted.
 */
export async function deleteEffectsOn(actor, ids) {
  const present = ids.filter((id) => actor.effects?.has?.(id) ?? true);
  if (!present.length) return false;
  if (actor.isOwner) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", present);
    return true;
  }
  return !!(await askGM(DELETE_EFFECTS_QUERY, { actorUuid: actor.uuid, ids: present }, actor.name));
}


/**
 * Ask the active GM's client to do something the user isn't allowed to (one of the system's queries).
 * Warns, and returns null, when no GM is logged in or the GM's client couldn't do it.
 * @param {string} query     The query name, e.g. "lotm.createEffects".
 * @param {object} data
 * @param {string} name      What it's for, for the warning (an actor's name).
 * @returns {Promise<any|null>}  What the GM's handler returned.
 */
export async function askGM(query, data, name) {
  const gm = game.users.activeGM;
  if (!gm) {
    ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Apply.NoGM", { name }));
    return null;
  }
  try {
    return await gm.query(query, data, { timeout: 15000 });
  } catch (error) {
    console.error(`lotm | The GM's client couldn't do "${query}"`, error);
    ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Apply.GMFailed", { name }));
    return null;
  }
}


/**
 * The chat line everyone sees: "Klein applies Terrified to Goblin, Goblin 2."
 * @param {Actor} caster
 * @param {ActiveEffect} effect
 * @param {string[]} names
 */
async function postApplied(caster, effect, names) {
  const text = format("LORD_OF_THE_MYSTERIES.Effects.Apply.Chat", {
    name: escape(caster.name),
    effect: escape(effect.name),
    targets: names.map(escape).join(", "),
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caster }),
    content: `<div class="lotm chat-effect-applied"><img src="${escape(effect.img)}" alt="" width="24" height="24"><span>${text}</span></div>`,
  });
}


/**
 * The chat line for an effect nobody cast (an @Effect button, a Roll Table result): "Cursed is applied to Klein."
 * @param {{name: string, img: string}} effect
 * @param {string[]} names    Who got it.
 * @param {Actor|null} [speaker]  Posted as this character (the first one who got it).
 */
export async function postEffectGiven(effect, names, speaker = null) {
  const text = format("LORD_OF_THE_MYSTERIES.Effects.Apply.ChatNoCaster", {
    effect: escape(effect.name),
    targets: names.map(escape).join(", "),
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(speaker ? { actor: speaker } : {}),
    content: `<div class="lotm chat-effect-applied"><img src="${escape(effect.img)}" alt="" width="24" height="24"><span>${text}</span></div>`,
  });
}


/* -------------------------------------------- */
/*  Chat card buttons                            */
/* -------------------------------------------- */

/**
 * Apply buttons for an action's or spell's attack card: one per effect it hands out (not the passive ones).
 * Empty when it has none.
 * @param {Item} item
 * @returns {string}  HTML
 */
export function effectButtonsHTML(item) {
  const effects = (item?.effects?.contents ?? []).filter((effect) => effectUse(effect) !== "passive");
  if (!effects.length) return "";
  const buttons = effects.map((effect) => {
    const labelKey = effectUse(effect) === "toggle" ? "LORD_OF_THE_MYSTERIES.Effects.Toggle.Button" : "LORD_OF_THE_MYSTERIES.Effects.Apply.Button";
    const label = format(labelKey, { name: escape(effect.name) });
    const hint = escape(useLabel(effect));
    return `<button type="button" class="lotm-apply-effect" data-lotm-apply-effect="${effect.id}" data-tooltip="${hint}">`
      + `<img src="${escape(effect.img)}" alt="" width="16" height="16"> ${label}</button>`;
  }).join("");
  return `<div class="lotm-effect-buttons">${buttons}</div>`;
}


/**
 * An Apply button on an attack card was clicked: hand out that effect, with the card's character as the caster.
 * Only the character's owners and the GM can.
 * @param {ChatMessage} message
 * @param {string} effectId
 */
export async function applyEffectFromMessage(message, effectId) {
  const [item, actor] = await Promise.all([
    fromUuid(message.getFlag("lotm", "actionUuid")).catch(() => null),
    fromUuid(message.getFlag("lotm", "actorUuid")).catch(() => null),
  ]);
  const effect = item?.effects?.get(effectId);
  if (!effect || !actor) {
    ui.notifications.warn(localize("LORD_OF_THE_MYSTERIES.Effects.Apply.Gone"));
    return;
  }
  if (!actor.isOwner) {
    ui.notifications.warn(format("LORD_OF_THE_MYSTERIES.Effects.Apply.NotOwner", { name: actor.name }));
    return;
  }
  await applyItemEffect(effect, { caster: actor });
}


/* -------------------------------------------- */
/*  The GM's side                                */
/* -------------------------------------------- */

/**
 * Let players' clients ask the GM to create or delete effects on actors they don't own. Called once from the init
 * hook. The GM's client makes the change, so it shows up like any other.
 */
export function registerEffectQueries() {
  CONFIG.queries ??= {};
  CONFIG.queries[CREATE_EFFECTS_QUERY] = async ({ actorUuid, effects } = {}) => {
    const actor = await fromUuid(actorUuid).catch(() => null);
    if (!actor || !Array.isArray(effects) || !effects.length) return false;
    // Only effect data of the system's own type is accepted.
    const clean = effects.filter((data) => data && typeof data === "object").map((data) => ({ ...data, type: "effect" }));
    await actor.createEmbeddedDocuments("ActiveEffect", clean);
    return true;
  };

  CONFIG.queries[DELETE_EFFECTS_QUERY] = async ({ actorUuid, ids } = {}) => {
    const actor = await fromUuid(actorUuid).catch(() => null);
    if (!actor || !Array.isArray(ids)) return false;
    const present = ids.filter((id) => actor.effects.has(id));
    if (present.length) await actor.deleteEmbeddedDocuments("ActiveEffect", present);
    return true;
  };
}
