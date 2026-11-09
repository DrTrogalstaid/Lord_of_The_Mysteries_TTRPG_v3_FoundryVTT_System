/**
 * The skill registry: every skill Item the system can find, by key, available right away (no waiting on compendiums).
 *
 * Actors only save a key and a level per skill (system.skills.pistol = { level: "trained", ... }). Everything else
 * about a skill (its name, picture, linked attribute, related-skill categories, whether every character has it) is on
 * the skill Item, so the actor's data preparation (data/actor/base-actor.mjs) looks it up here.
 *
 * Where skills come from, first one wins when two share a key (see buildSkillRegistry in helpers/skill-keys.mjs):
 *   1. the system's Skills compendium (CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId)
 *   2. world skills (the Items sidebar)
 *   3. skills in any other Item compendium (a module's, a world compendium)
 * Compendium skills are read from the compendium's index, so the fields actors need are added to every Item
 * compendium's index (INDEX_FIELDS) when the system starts.
 *
 * It's rebuilt:
 *   - when the world is ready (and every actor is prepared again, in case one was prepared before the compendiums
 *     finished loading)
 *   - when a world or compendium skill is created, changed or deleted (and actors are prepared again, and their open
 *     sheets redrawn, so a new category or attribute shows straight away)
 *
 * Lookups:
 *   skillKeyFor(ref)        a key, a UUID, or a skill Item / index entry -> the skill's key ("" when unknown)
 *   skillInfo(key, uuid)    { key, uuid, name, img, attribute, categories, flatModifier, isStandard } or null
 *   skillInfoByName(name)   by name (any capitals) or key, for @Check[Listening] links
 *   standardSkillKeys()     the keys every player character has
 */

import { buildSkillRegistry, isSkillKey, isSkillUuid, skillKeyOf } from "./skill-keys.mjs";

/** The fields a skill's compendium index entry needs. */
const INDEX_FIELDS = [
  "type",              // normally in every index already; listed so skills can always be told apart from other Items
  "system.identifier",
  "system.isStandard",
  "system.skill_attribute",
  "system.modifier",
  "system.categories",
  "system.category",   // the old single category, on skills saved before system.categories
];

/** The registry, once built. */
let registry = null;

/** A short summary of the registry, to tell whether a rebuild changed anything actors use. */
let signature = "";

/** UUIDs looked up outside the registry (fromUuidSync), so each is only looked up once until the next rebuild. */
const extraKeys = new Map();
const extraInfos = new Map();

/** A rebuild waiting to happen (several skills edited at once are one rebuild). */
let rebuildTimer = null;

/** Resolved once the registry has been built from the loaded compendiums, when the world is ready. */
let markReady;
const readyPromise = new Promise((resolve) => { markReady = resolve; });

/**
 * Wait for the registry's full build when the world is ready (right away after that). Code that saves skill keys at
 * startup (the skill data migration) waits for this, so no skill is missed because its compendium wasn't loaded yet.
 * @returns {Promise<void>}
 */
export function whenSkillRegistryReady() {
  return readyPromise;
}


/**
 * Called once, in the init hook (lotm.mjs): index fields, the hooks that keep the registry up to date, and the first
 * full build when the world is ready.
 */
export function registerSkillRegistry() {
  const fields = (CONFIG.Item.compendiumIndexFields ??= []);
  for (const field of INDEX_FIELDS) if (!fields.includes(field)) fields.push(field);

  // A world or compendium skill changed. (Skills are never owned by actors, so item.parent is always empty.)
  const onSkillChange = (item) => {
    if (item?.type === "skill" && !item.parent) scheduleRebuild();
  };
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, onSkillChange);

  Hooks.once("ready", async () => {
    // Make sure the Skills compendium's index has the fields above (it normally does already).
    const pack = game.packs?.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
    try {
      await pack?.getIndex({ fields: INDEX_FIELDS });
    } catch (error) {
      console.warn("Lord of the Mysteries | Couldn't load the Skills compendium's index", error);
    }
    rebuildSkillRegistry({ refreshActors: true, force: true });
    markReady();
  });
}


/**
 * Rebuild in a moment, once (several skills changed at once, e.g. a macro editing the compendium).
 */
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuildSkillRegistry({ refreshActors: true }), 100);
}


/**
 * Every skill Item that can be found, in priority order, as buildSkillRegistry wants them.
 * @returns {object[]}
 */
function collectEntries() {
  const entries = [];
  const systemPack = game.packs?.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId) ?? null;

  const addPack = (pack, isSystemPack) => {
    for (const entry of pack.index ?? []) {
      if (entry.type !== "skill") continue;
      const folder = entry.folder ? pack.folders?.get(entry.folder?._id ?? entry.folder) : null;
      entries.push({
        uuid: entry.uuid ?? pack.getUuid?.(entry._id) ?? `Compendium.${pack.collection}.Item.${entry._id}`,
        name: entry.name,
        img: entry.img,
        system: entry.system ?? {},
        folderName: folder?.name ?? "",
        isSystemPack,
        aliases: [],
      });
    }
  };

  if (systemPack) addPack(systemPack, true);

  for (const item of game.items ?? []) {
    if (item.type !== "skill") continue;
    entries.push({
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      system: item._source?.system ?? item.system ?? {},
      folderName: "",
      isSystemPack: false,
      // A world copy of a compendium skill is the same skill.
      aliases: [item._stats?.compendiumSource, item.flags?.core?.sourceId].filter(Boolean),
    });
  }

  for (const pack of game.packs ?? []) {
    if (pack === systemPack || pack.documentName !== "Item") continue;
    addPack(pack, false);
  }
  return entries;
}


/**
 * The folders of the system's Skills compendium whose skills every player character has, for skills that don't say
 * (their "Standard skill" box has never been saved): the attribute tabs' folders.
 * @returns {string[]}
 */
function standardFolders() {
  const config = CONFIG.LORD_OF_THE_MYSTERIES;
  return (config.skillTabAttributes ?? []).map((key) => config.skillCompendiumFolders?.[key]).filter(Boolean);
}


/**
 * Build the registry again from the compendiums and world skills.
 * @param {object} [options]
 * @param {boolean} [options.refreshActors]  Prepare every actor again and redraw their open sheets, if anything
 *                                           actors use changed (or always, with force).
 * @param {boolean} [options.force]          Refresh the actors even if nothing seems to have changed.
 * @returns {object}  The new registry.
 */
export function rebuildSkillRegistry({ refreshActors = false, force = false } = {}) {
  registry = buildSkillRegistry(collectEntries(), { standardFolders: standardFolders() });
  extraKeys.clear();
  extraInfos.clear();
  for (const { key, kept, also } of registry.duplicates) {
    console.warn(`Lord of the Mysteries | Two skills share the key "${key}" but have different attributes: ${kept} (used) and ${also}. `
      + "Give one of them its own Identifier if they're different skills.");
  }

  const next = JSON.stringify([...registry.byKey.values()].map((info) =>
    [info.key, info.name, info.attribute, info.isStandard, info.flatModifier, info.categories]));
  const changed = next !== signature;
  signature = next;
  if (refreshActors && (changed || force)) refreshAllActors();
  return registry;
}


/**
 * Prepare every actor again (world actors, and the unlinked tokens on the scene being viewed) and redraw their open
 * sheets. Other scenes' tokens are prepared when the scene is viewed.
 */
function refreshAllActors() {
  const actors = new Set(game.actors ?? []);
  for (const token of game.scenes?.viewed?.tokens ?? []) {
    if (!token.actorLink && token.actor) actors.add(token.actor);
  }
  for (const actor of actors) {
    try {
      actor.reset();
    } catch (error) {
      console.error(`Lord of the Mysteries | Couldn't prepare ${actor.name} again`, error);
    }
  }
  for (const actor of actors) {
    for (const app of Object.values(actor.apps ?? {})) {
      if (app.rendered) app.render(false);
    }
  }
}


/**
 * The registry, built on first use if it hasn't been yet.
 * @returns {{byKey: Map, keyByUuid: Map, keyByName: Map, duplicates: object[]}}
 */
export function skillRegistry() {
  return registry ?? rebuildSkillRegistry();
}


/**
 * A skill's key, from whatever refers to it:
 *   "pistol"                                       a key: returned as it is
 *   "Compendium.lotm.skills_compendium.Item.abc"   a UUID: looked up in the registry (or directly, if it isn't there)
 *   a skill Item or compendium index entry         its Identifier, or its name
 * @param {string|object} ref
 * @returns {string}  "" when it isn't a skill that can be found.
 */
export function skillKeyFor(ref) {
  if (!ref) return "";
  if (typeof ref === "object") {
    if (ref.type && ref.type !== "skill") return "";
    return skillKeyOf({ identifier: ref.system?.identifier, name: ref.name });
  }

  const text = String(ref).trim();
  if (isSkillKey(text)) return text;
  if (!isSkillUuid(text)) return "";

  const known = skillRegistry().keyByUuid.get(text);
  if (known) return known;
  if (extraKeys.has(text)) return extraKeys.get(text);

  // Not in the registry (an unindexed compendium, or the registry isn't complete yet): look it up directly.
  let key = "";
  try {
    const doc = globalThis.fromUuidSync?.(text, { strict: false }) ?? null;
    const type = doc?.type ?? doc?.documentName;
    if (doc && (type === "skill" || doc.system?.skill_attribute !== undefined)) {
      key = skillKeyOf({ identifier: doc.system?.identifier, name: doc.name });
    }
  } catch {
    key = "";
  }
  // Only remember a find: a skill that can't be found yet may turn up once its compendium is loaded.
  if (key) extraKeys.set(text, key);
  return key;
}


/**
 * What the registry knows about a skill.
 * @param {string} key
 * @param {string} [uuid]   Where the skill was saved from. Used when the key isn't in the registry (a skill from a
 *                          compendium that isn't indexed): the Item is looked up directly, if it can be.
 * @returns {{key: string, uuid: string, name: string, img: string, attribute: string, categories: object[],
 *            flatModifier: number, isStandard: boolean}|null}
 */
export function skillInfo(key, uuid = "") {
  if (!key) return null;
  const known = skillRegistry().byKey.get(key);
  if (known || !isSkillUuid(uuid)) return known ?? null;

  if (extraInfos.has(uuid)) return extraInfos.get(uuid);
  let info = null;
  try {
    const doc = globalThis.fromUuidSync?.(uuid, { strict: false }) ?? null;
    if (doc && skillKeyOf({ identifier: doc.system?.identifier, name: doc.name }) === key) {
      info = buildSkillRegistry([{ uuid, name: doc.name, img: doc.img, system: doc.system ?? {} }]).byKey.get(key) ?? null;
    }
  } catch {
    info = null;
  }
  if (info) extraInfos.set(uuid, info);
  return info;
}


/**
 * A skill by its name (any capitals) or its key: "Listening", "listening", "Knowledge of the Dead".
 * @param {string} name
 * @returns {object|null}  As skillInfo.
 */
export function skillInfoByName(name) {
  const text = String(name ?? "").trim();
  if (!text) return null;
  const reg = skillRegistry();
  const key = reg.keyByName.get(text.toLowerCase()) ?? (reg.byKey.has(text) ? text : null);
  return key ? reg.byKey.get(key) : null;
}


/**
 * The keys of the skills every player character has (their "Standard skill" box).
 * @returns {string[]}
 */
export function standardSkillKeys() {
  return [...skillRegistry().byKey.values()].filter((info) => info.isStandard).map((info) => info.key);
}
