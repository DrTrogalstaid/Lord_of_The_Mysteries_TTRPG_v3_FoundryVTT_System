/**
 * Skill keys: the short name every skill goes by on an actor, e.g. "pistol", "dodge", "knowledgeOfTheDead".
 *
 * Why: an Active Effect change points at a place in the actor's data, like "system.skills.pistol.bonus". That only
 * works if every actor files Pistol under the same name. A skill's UUID can't be that name: it's full of dots
 * ("Compendium.lotm.skills_compendium.Item.abc"), and Foundry reads every dot in a change key as "one level deeper".
 * It also changes when a compendium is rebuilt, and a world copy of a skill has a different one.
 *
 * Where a key comes from: the skill Item's Identifier field (system.identifier), or, while that's blank, its name
 * ("Knowledge of the Dead" -> "knowledgeOfTheDead"). New skills get their Identifier filled in when they're made
 * (data/item/character_building/skill.mjs), so renaming a skill later doesn't change its key.
 *
 * This file also builds the skill registry's lookup tables (buildSkillRegistry below). The part that reads
 * Foundry's compendiums and world Items is in helpers/skill-registry.mjs.
 *
 * Plain data in / data out (no game / CONFIG), so it can be unit tested under Node (tests/skill-keys.test.mjs).
 */

import { skillCategoriesOf } from "./skill-associations.mjs";

/** What a key may look like: starts with a letter, then letters, digits, _ or -. Never a dot. */
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Start of the key a saved skill gets when its Item no longer exists (see legacySkillKey). */
export const MISSING_SKILL_PREFIX = "missing_";


/**
 * Whether a string can be used as a skill key.
 * @param {string} key
 * @returns {boolean}
 */
export function isSkillKey(key) {
  return typeof key === "string" && KEY_PATTERN.test(key);
}


/**
 * A key made from a skill's name, in camelCase like the system's other keys ("grandMaster", "languageNorth"):
 *   "Pistol" -> "pistol", "Slight of Hand" -> "slightOfHand", "Knowledge of the Dead" -> "knowledgeOfTheDead".
 * Accents are dropped ("Café" -> "cafe") and apostrophes joined ("Hunter's Eye" -> "huntersEye").
 * @param {string} name
 * @returns {string}  "" when the name has no letters or digits.
 */
export function skillKeyFromName(name) {
  const words = String(name ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return "";

  const key = words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
    })
    .join("");
  // A key has to start with a letter ("7th Sense" -> "skill7thSense").
  return /^[A-Za-z]/.test(key) ? key : `skill${key[0].toUpperCase()}${key.slice(1)}`;
}


/**
 * A skill's key: its Identifier when it has one, otherwise one made from its name.
 * An Identifier that isn't a valid key ("Knowledge of the Dead", with spaces) is turned into one the same way a name is.
 * @param {{identifier?: string, name?: string}} skill
 * @returns {string}
 */
export function skillKeyOf({ identifier, name } = {}) {
  const own = String(identifier ?? "").trim();
  if (own) return isSkillKey(own) ? own : skillKeyFromName(own);
  return skillKeyFromName(name);
}


/**
 * Whether a reference to a skill is a UUID rather than a key. UUIDs always have dots; keys never do.
 * @param {string} ref
 * @returns {boolean}
 */
export function isSkillUuid(ref) {
  return typeof ref === "string" && ref.includes(".");
}


/**
 * The key for a saved skill whose Item can't be found any more (deleted, or from a compendium that isn't installed).
 * Its saved level and analyses are kept under this key, so nothing is lost, and the sheet lists it as missing.
 *   "Compendium.lotm.skills_compendium.Item.abc123" -> "missing_abc123"
 * @param {string} uuid
 * @returns {string}
 */
export function legacySkillKey(uuid) {
  const last = String(uuid ?? "").split(".").pop().replace(/[^A-Za-z0-9]/g, "");
  return `${MISSING_SKILL_PREFIX}${last || "unknown"}`;
}


/**
 * Build the skill registry's lookup tables from every skill Item that can be found.
 *
 * The same skill can turn up more than once: the Skills compendium's Pistol, and a world copy of it. They share a key,
 * so they count as one skill. The first one listed wins (helpers/skill-registry.mjs lists the system's Skills
 * compendium first, then world skills, then other compendiums); the others' UUIDs still lead to it.
 *
 * Standard skills (every player character has them): a skill whose system.isStandard is true. Skills saved before that
 * field existed have nothing there, so for them it goes by the old rule: in one of the attribute folders of the
 * system's Skills compendium (standardFolders).
 *
 * @param {object[]} entries   In priority order. Each:
 *   { uuid, name, img, system, folderName, isSystemPack, aliases }
 *     system        the skill's system data, or a compendium index entry's (identifier, isStandard, skill_attribute,
 *                   modifier, categories / the old category)
 *     folderName    the name of its folder ("" for none)
 *     isSystemPack  true for the system's own Skills compendium
 *     aliases       more UUIDs that are this same skill (a world copy's compendium source)
 * @param {{standardFolders?: string[]}} [options]
 * @returns {{
 *   byKey: Map<string, {key, uuid, name, img, attribute, categories, flatModifier, isStandard}>,
 *   keyByUuid: Map<string, string>,
 *   keyByName: Map<string, string>,
 *   duplicates: {key: string, kept: string, also: string}[]
 * }}
 *   duplicates: two different Items with the same key whose linked attributes differ (worth a look: one may be a
 *   homebrew skill that happens to share a name).
 */
export function buildSkillRegistry(entries, { standardFolders = [] } = {}) {
  const byKey = new Map();
  const keyByUuid = new Map();
  const keyByName = new Map();
  const duplicates = [];
  const folders = new Set(standardFolders);

  for (const entry of entries ?? []) {
    if (!entry?.uuid) continue;
    const system = entry.system ?? {};
    const key = skillKeyOf({ identifier: system.identifier, name: entry.name });
    if (!key) continue;

    const uuids = [entry.uuid, ...(entry.aliases ?? [])].filter(Boolean);
    const existing = byKey.get(key);
    if (existing) {
      // Another copy of a skill already listed: its UUIDs lead to the one listed first.
      for (const uuid of uuids) if (!keyByUuid.has(uuid)) keyByUuid.set(uuid, key);
      const attribute = system.skill_attribute ?? "";
      if (attribute && existing.attribute && attribute !== existing.attribute) {
        duplicates.push({ key, kept: existing.uuid, also: entry.uuid });
      }
      continue;
    }

    const explicit = system.isStandard;
    const isStandard = typeof explicit === "boolean"
      ? explicit
      : !!(entry.isSystemPack && folders.has(entry.folderName ?? ""));

    byKey.set(key, {
      key,
      uuid: entry.uuid,
      name: entry.name ?? key,
      img: entry.img ?? "icons/svg/book.svg",
      attribute: system.skill_attribute ?? "",
      categories: skillCategoriesOf(system),
      flatModifier: Number(system.modifier) || 0,
      isStandard,
    });
    for (const uuid of uuids) if (!keyByUuid.has(uuid)) keyByUuid.set(uuid, key);
    const lowerName = String(entry.name ?? "").trim().toLowerCase();
    if (lowerName && !keyByName.has(lowerName)) keyByName.set(lowerName, key);
  }

  return { byKey, keyByUuid, keyByName, duplicates };
}
