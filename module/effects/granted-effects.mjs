/**
 * Passive effects from abilities a Sequence or gear grants.
 *
 * Foundry only applies passive effects from Items the actor owns. An ability a Sequence grants isn't owned: it's a
 * UUID in the Sequence's abilities_gained list, which the sheet looks up to show it. So its passive effects are
 * copied onto the granting Item instead (the owned Sequence or gear), where Foundry applies them like any other:
 *
 *   Sequence "Seer" (owned)
 *     abilities_gained: [Spirit Vision]
 *     effects: ["+2 Inspiration"   grantedFrom: Spirit Vision's UUID, grantedEffectId: its effect's id]
 *
 * The copies follow the same rules as the character sheet's list of granted abilities (_prepareSections in
 * sheets/base-actor-sheet.mjs):
 *   - an ability the actor owns itself isn't copied: its own effects already apply
 *   - an actor has each ability once (by name): two Items granting Spirit Vision give one set of copies, on the first
 *   - an ability the GM hid on an NPC (hiddenGrants), or one with the same name as a hidden one, isn't copied
 * Only passive effects are copied (the ones that apply to the owner). Effects the ability hands out with Apply aren't.
 * Copies on gear stop applying while it's stowed, like the gear's own effects (documents/active-effect.mjs).
 *
 * syncGrantedEffects(actor) makes the copies match: missing ones are made, extra ones removed, and out-of-date ones
 * (the ability's effect was edited since) replaced, keeping whether they were turned off. It runs on its own when an
 * owned Sequence, gear or ability is added, changed or removed, and when an NPC's hidden grants change
 * (documents/item.mjs, data/actor/base-actor.mjs). After editing abilities in a compendium, use the Refresh button
 * on a character's Effects tab, or the macro module/macros/sync-granted-effects.js for every actor.
 */

import { resetExpiryEvents } from "./action-expiry.mjs";

/** Item types that grant abilities (their abilities_gained list). */
export const GRANTER_TYPES = ["sequence", "gear"];

/** Owned Item types whose arrival, change or removal can change which copies an actor should have. */
export const GRANT_TRIGGER_TYPES = ["sequence", "gear", "ability"];


/* -------------------------------------------- */
/*  Planning (pure)                              */
/* -------------------------------------------- */

/**
 * Which ability effects should be copied onto which granting Item.
 * @param {object} input
 * @param {{key: string, name: string}[]} input.ownedAbilities   Abilities the actor owns. key: their compendium source,
 *                                                               or their own UUID.
 * @param {{id: string, abilities: {uuid: string, doc: Item|null}[]}[]} input.granters   Owned Sequences and gear, in
 *                                                               the actor's order, with their granted abilities looked up.
 * @param {Set<string>} [input.hiddenGrants]   UUIDs the GM hid on this NPC.
 * @param {Set<string>} [input.hiddenNames]    Lower-case names of the hidden abilities.
 * @returns {{granterId: string, abilityUuid: string, ability: Item, effect: ActiveEffect}[]}
 */
export function planGrantedEffects({ ownedAbilities, granters, hiddenGrants = new Set(), hiddenNames = new Set() }) {
  const seenKeys = new Set(ownedAbilities.map((ability) => ability.key));
  const seenNames = new Set(ownedAbilities.map((ability) => ability.name.toLocaleLowerCase()));
  const planned = [];

  for (const granter of granters) {
    for (const { uuid, doc } of granter.abilities) {
      if (!uuid || seenKeys.has(uuid) || hiddenGrants.has(uuid)) continue;
      if (!doc || doc.documentName !== "Item" || doc.type !== "ability") continue;
      const name = doc.name.toLocaleLowerCase();
      if (seenNames.has(name) || hiddenNames.has(name)) continue;
      seenKeys.add(uuid);
      seenNames.add(name);

      for (const effect of doc.effects ?? []) {
        if (!effect.transfer) continue;   // only passive effects
        planned.push({ granterId: granter.id, abilityUuid: uuid, ability: doc, effect });
      }
    }
  }
  return planned;
}


/**
 * The data for a copy of a granted ability's passive effect, to create on the granting Item.
 * @param {ActiveEffect} effect      The ability's effect.
 * @param {object} options
 * @param {string} options.abilityUuid    The UUID the granter lists (system.grantedFrom).
 * @param {string} [options.origin]       The granting Item's UUID.
 * @param {boolean} [options.disabled]    Keep a replaced copy turned off.
 * @returns {object}
 */
export function grantedCopyData(effect, { abilityUuid, origin = null, disabled }) {
  const data = effect.toObject();
  delete data._id;
  delete data.start;
  if (data.duration) {
    for (const key of ["startTime", "startRound", "startTurn", "combat"]) delete data.duration[key];
  }
  data.transfer = true;
  data.origin = origin;
  if (disabled !== undefined) data.disabled = disabled;
  data.system = {
    ...(data.system ?? {}),
    grantedFrom: abilityUuid,
    grantedEffectId: effect.id,
    grantedModifiedTime: effect._stats?.modifiedTime ?? null,
    impliedBy: "",
    turnChecks: [],
    expiryEvents: resetExpiryEvents(data.system?.expiryEvents),   // all its uses (effects/action-expiry.mjs)
  };
  return data;
}


/**
 * What to change so the copies match the plan.
 *   - a copy matching a planned effect (same granter, ability and effect) and up to date: kept
 *   - out of date (the ability's effect was edited since it was copied): replaced, still on or off as it was
 *   - no longer planned, or a second copy of the same thing: removed
 * @param {ReturnType<typeof planGrantedEffects>} planned
 * @param {{granterId: string, granterUuid?: string, effect: ActiveEffect}[]} existing   The copies on the granters
 *                                                                (effects with system.grantedFrom).
 * @returns {{create: {granterId: string, data: object}[], remove: {granterId: string, id: string}[]}}
 */
export function diffGrantedEffects(planned, existing) {
  const keyOf = (granterId, abilityUuid, effectId) => `${granterId}|${abilityUuid}|${effectId}`;
  const copies = new Map();   // key -> the first copy
  const remove = [];
  for (const { granterId, effect } of existing) {
    const key = keyOf(granterId, effect.system?.grantedFrom, effect.system?.grantedEffectId);
    if (copies.has(key)) remove.push({ granterId, id: effect.id });
    else copies.set(key, { granterId, effect });
  }

  const create = [];
  const wanted = new Set();
  for (const { granterId, abilityUuid, effect, granterUuid } of planned) {
    const key = keyOf(granterId, abilityUuid, effect.id);
    wanted.add(key);
    const copy = copies.get(key)?.effect;
    const modified = effect._stats?.modifiedTime ?? null;
    if (copy && (copy.system?.grantedModifiedTime ?? null) === modified) continue;
    if (copy) remove.push({ granterId, id: copy.id });
    create.push({
      granterId,
      data: grantedCopyData(effect, { abilityUuid, origin: granterUuid ?? null, disabled: copy ? copy.disabled : undefined }),
    });
  }

  for (const [key, { granterId, effect }] of copies) {
    if (!wanted.has(key)) remove.push({ granterId, id: effect.id });
  }
  return { create, remove };
}


/* -------------------------------------------- */
/*  Syncing                                      */
/* -------------------------------------------- */

/** Syncs running per actor, so two in a row don't overlap. */
const running = new Map();


/**
 * Look up what the actor's copies should be, and how that differs from what's there. Nothing is changed.
 * @param {Actor} actor
 * @returns {Promise<{create: object[], remove: object[], granters: Map<string, Item>, names: Map<string, string>}>}
 *   names: granted ability UUID -> its name, for display.
 */
export async function grantedEffectsDiff(actor) {
  const items = [...(actor.items ?? [])];
  const ownedAbilities = items
    .filter((item) => item.type === "ability")
    .map((item) => ({ key: item._stats?.compendiumSource ?? item.uuid, name: item.name }));

  const hiddenGrants = new Set(actor.system?.hiddenGrants ?? []);
  const hiddenNames = new Set();
  await Promise.all([...hiddenGrants].map(async (key) => {
    const doc = await fromUuid(key.split("#").pop()).catch(() => null);
    if (doc?.documentName === "Item" && doc.type === "ability") hiddenNames.add(doc.name.toLocaleLowerCase());
  }));

  const granterItems = items.filter((item) => GRANTER_TYPES.includes(item.type) && Array.isArray(item.system?.abilities_gained));
  const names = new Map();
  const granters = await Promise.all(granterItems.map(async (item) => ({
    id: item.id,
    abilities: await Promise.all(item.system.abilities_gained.map(async (uuid) => {
      const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
      if (doc) names.set(uuid, doc.name);
      return { uuid, doc };
    })),
  })));

  const byId = new Map(granterItems.map((item) => [item.id, item]));
  const planned = planGrantedEffects({ ownedAbilities, granters, hiddenGrants, hiddenNames })
    .map((entry) => ({ ...entry, granterUuid: byId.get(entry.granterId)?.uuid ?? null }));

  // Copies can be on any owned Item (a Sequence that no longer grants anything, gear that was emptied).
  const existing = [];
  for (const item of items) {
    for (const effect of item.effects ?? []) {
      if (effect.system?.grantedFrom) existing.push({ granterId: item.id, effect });
    }
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  const { create, remove } = diffGrantedEffects(planned, existing);
  return { create, remove, granters: byId, names };
}


/**
 * Make an actor's copies of granted abilities' passive effects match (see the top of this file).
 * Only for users who own the actor; one sync at a time per actor.
 * @param {Actor} actor
 * @returns {Promise<{created: number, removed: number}|null>}  null when the user can't change this actor.
 */
export function syncGrantedEffects(actor) {
  if (!actor?.isOwner) return Promise.resolve(null);
  const previous = running.get(actor.uuid) ?? Promise.resolve();
  const next = previous
    .catch(() => null)
    .then(() => applyGrantedDiff(actor))
    .catch((error) => {
      console.error(`lotm | Couldn't sync the granted ability effects of ${actor.name}`, error);
      return null;
    });
  running.set(actor.uuid, next);
  next.finally(() => {
    if (running.get(actor.uuid) === next) running.delete(actor.uuid);
  });
  return next;
}


/**
 * Work out the changes and make them, Item by Item: removals first, then the new copies.
 * @param {Actor} actor
 * @returns {Promise<{created: number, removed: number}>}
 */
async function applyGrantedDiff(actor) {
  const { create, remove, granters } = await grantedEffectsDiff(actor);
  const byGranter = new Map();
  const entryFor = (id) => byGranter.get(id) ?? byGranter.set(id, { remove: [], create: [] }).get(id);
  for (const { granterId, id } of remove) entryFor(granterId).remove.push(id);
  for (const { granterId, data } of create) entryFor(granterId).create.push(data);

  for (const [granterId, changes] of byGranter) {
    const item = granters.get(granterId);
    if (!item) continue;
    const ids = changes.remove.filter((id) => item.effects.has(id));
    if (ids.length) await item.deleteEmbeddedDocuments("ActiveEffect", ids);
    if (changes.create.length) await item.createEmbeddedDocuments("ActiveEffect", changes.create);
  }
  return { created: create.length, removed: remove.length };
}
