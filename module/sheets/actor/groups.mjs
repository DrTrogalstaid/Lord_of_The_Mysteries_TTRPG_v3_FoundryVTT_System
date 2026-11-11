/**
 * The actor sheets' collapsible groups: the Actions section split into Favorites and one section per action type,
 * and the Spells section split into one group per Spell List. Which ones a player has collapsed is saved on their own
 * User (COLLAPSED_FLAG, COLLAPSED_SPELLS_FLAG); the favorites are saved on the actor (FAVORITES_FLAG).
 * The entries come from sections.mjs.
 */

import { langSection } from "../../helpers/lang.mjs";

/* -------------------------------------------- */
/*  Spell Lists                                  */
/* -------------------------------------------- */

/**
 * Split the Spells section's entries into one group per Spell List name.
 *
 * Lists with the same name (ignoring upper/lower case and extra spaces) become ONE group, even when
 * they come from different abilities. Spells that aren't in any list (dropped straight on the sheet)
 * go in an "Other Spells" group at the bottom. Entries keep the order they already had, so the
 * saved manual order still applies inside each group.
 *
 * @param {object[]} entries      The already-sorted entries of sections.spells.
 * @param {string[]} [listNames]  Spell List names to show even when they have no spells yet.
 * @returns {{key: string, name: string, entries: object[]}[]}
 */
export function groupSpellLists(entries, listNames = []) {
  const groups = new Map();   // lower-case list name -> group
  const unlisted = [];

  // Start with an empty group for every named list, so it shows up before any spell is added to it.
  for (const name of listNames) {
    const key = name.toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { key, name, entries: [] });
  }

  for (const entry of entries) {
    if (!entry.spellList) {
      unlisted.push(entry);
      continue;
    }
    const key = entry.spellList.toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { key, name: entry.spellList, entries: [] });
    groups.get(key).entries.push(entry);
  }

  const lists = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (unlisted.length) {
    lists.push({ key: "", name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.UnlistedSpells"), entries: unlisted });
  }

  // Move buttons only move an entry within its own group, so the first / last of each group can't go further.
  for (const list of lists) {
    list.entries.forEach((entry, index) => {
      entry.canMove = list.entries.length > 1;
      entry.canMoveUp = index > 0;
      entry.canMoveDown = index < list.entries.length - 1;
    });
  }

  return lists;
}

/* -------------------------------------------- */
/*  Action sections: Favorites and type sections */
/* -------------------------------------------- */

/** The type sections for actions, top to bottom. Actions of any other type go in "Other" at the end. */
const ACTION_GROUP_ORDER = ["attack", "move", "quick", "free", "full"];

/** The actor's favorite actions: entry keys, in the order shown in Favorites. Shared by everyone who sees the sheet. */
export const FAVORITES_FLAG = "flags.lotm.favoriteActions";

/**
 * Which action sections each player has collapsed. Saved on the player's own User, not the actor,
 * so it's different for every player: { [actor id]: [section key, ...] }. Read with game.user.getFlag("lotm", ...).
 */
export const COLLAPSED_FLAG = "collapsedActionGroups";

/** Which Spell Lists each player has collapsed on the Spells tab, saved the same way: { [actor id]: [list key, ...] }. */
export const COLLAPSED_SPELLS_FLAG = "collapsedSpellLists";

/** The key a Spell List is collapsed under. The "Other Spells" group has no name of its own. */
export const spellListCollapseKey = (list) => list.key || "unlisted";

/**
 * Split the Actions section into collapsible groups: Favorites first (when turned on), then one per action type.
 * Favorites can also hold spells (favorited with the star on the Spells tab); they're only listed there and in Favorites.
 *
 * A favorite is shown twice: in Favorites and in its type section (except an action only spells grant,
 * which is only in Favorites; it's also under its spell on the Spells tab). The Favorites copy is a separate object
 * so it can have its own move buttons (its order is the favorites list itself, see #onMoveEntry).
 * Type sections with no actions aren't shown. Entries keep the saved manual order inside each section.
 *
 * @param {object[]} entries        context.sections.actions (already sorted).
 * @param {string[]} favoriteKeys   Entry keys of the favorites, in order (FAVORITES_FLAG).
 * @param {string[]} collapsedKeys  Section keys this player has collapsed (COLLAPSED_FLAG).
 * @param {object}  [options]
 * @param {boolean} [options.favorites=true]  false leaves the Favorites section out (NPC sheet).
 * @param {object[]} [options.spells]         context.sections.spells, so favorited spells can be listed in Favorites.
 * @returns {{key: string, label: string, favorites: boolean, collapsed: boolean, emptyText: string, entries: object[]}[]}
 *   An empty list when the actor has no actions at all.
 */
export function groupActions(entries, favoriteKeys, collapsedKeys, { favorites: showFavorites = true, spells = [] } = {}) {
  // Nothing to show: no actions, and no favorite spells either.
  const favoriteSpells = showFavorites ? spells.filter((spell) => favoriteKeys.includes(spell.key)) : [];
  if (!entries.length && !favoriteSpells.length) return [];
  const groupText = langSection("LORD_OF_THE_MYSTERIES.ActionGroups");

  // Every favorite gets a filled star, wherever it's listed.
  const favoriteSet = new Set(showFavorites ? favoriteKeys : []);
  for (const entry of entries) entry.favorite = favoriteSet.has(entry.key);

  // Favorites, in the saved order. Keys of actions and spells the actor no longer has are skipped.
  const byKey = new Map([...entries, ...favoriteSpells].map((entry) => [entry.key, entry]));
  const favorites = {
    key: "favorites",
    favorites: true,
    label: groupText("Favorites"),
    emptyText: groupText("FavoritesEmpty"),
    entries: favoriteKeys.filter((key) => byKey.has(key)).map((key) => ({ ...byKey.get(key), favorite: true })),
  };

  // One section per action type. Actions only spells grant are left out: they're listed under their spell
  // on the Spells tab, and only come here through Favorites.
  const byType = new Map();   // type key -> group
  for (const entry of entries) {
    if (entry.spellOnly) continue;
    const type = ACTION_GROUP_ORDER.includes(entry.actionType) ? entry.actionType : "other";
    if (!byType.has(type)) {
      byType.set(type, { key: type, favorites: false, label: groupText(`Types.${type}`), emptyText: "", entries: [] });
    }
    byType.get(type).entries.push(entry);
  }
  const typeGroups = [...ACTION_GROUP_ORDER, "other"].filter((type) => byType.has(type)).map((type) => byType.get(type));

  const groups = showFavorites ? [favorites, ...typeGroups] : typeGroups;
  for (const group of groups) {
    group.collapsed = collapsedKeys.includes(group.key);
    // Move buttons only move an entry within its own section (same as the Spells tab).
    group.entries.forEach((entry, index) => {
      entry.canMove = group.entries.length > 1;
      entry.canMoveUp = index > 0;
      entry.canMoveDown = index < group.entries.length - 1;
    });
  }
  return groups;
}
