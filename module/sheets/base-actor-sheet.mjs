/**
 * Shared base for the actor sheets.
 *
 *   LordOfTheMysteriesActorSheetBase   (this file) everything both sheets do the same way
 *     ├─ PlayerCharacterSheet          (player-character-sheet.mjs) skills from the compendium, study, money, rests, biography
 *     └─ NpcSheet                      (npc-sheet.mjs) stat block, dropped-on skills, hiding granted entries
 *
 * What lives here:
 *   - the drop sections (Sequences, Abilities, Actions, Spells, Inventory) and everything nested inside them
 *   - drag and drop onto the sheet
 *   - action rows: attack / damage / ammo buttons
 *   - moving entries up / down, sending to chat, opening, creating and deleting Items
 *   - attribute, skill and action rolls (the roll dialogs in apps/; Shift-click skips the dialog),
 *     damage resistance rows, spending Spirituality
 *   - hiding granted entries, for actors whose data has a hiddenGrants list (NPCs, see actor-npc.mjs)
 *
 * How the sheets that extend this class add their own things:
 *   - DEFAULT_OPTIONS is merged by Foundry down the chain, so a sheet only lists what's new for it.
 *     Its `actions` are added to the ones here, and its `classes` are added to these.
 *     (Arrays are joined together, so `dragDrop` must only be set here, or drops would be handled twice.
 *     Give every sheet its own DEFAULT_OPTIONS, even if it's nearly empty, so nothing here gets counted twice.)
 *   - PARTS and TABS are NOT merged: each sheet defines its own.
 *   - _prepareContext, _preparePartContext and _onRender: call super first, then add the sheet's own parts.
 */

import SkillCheckDialog from "../apps/skill-check-dialog.mjs";
import AttributeCheckDialog from "../apps/attribute-check-dialog.mjs";
import { getActionAttackSummary, getDamageTooltip, rollActionAttack, rollActionDamage } from "../helpers/action-roll.mjs";
import { autoPlacement, placementUpdate } from "../helpers/inventory.mjs";
import { ammoBoxStatus, firearmStatus, gunFor, useAmmoAction } from "../helpers/firearms.mjs";
import { openSpendSpiritualityDialog, spiritualityCost, useActionSpirituality } from "../helpers/spirituality.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/* -------------------------------------------- */
/*  Shared partials                              */
/* -------------------------------------------- */

const PARTS_FOLDER = "systems/lotm/templates/actor/player-character/parts";

/** One drop section (header, entry list, drop target). */
export const DROP_SECTION_PARTIAL = `${PARTS_FOLDER}/drop-section.hbs`;

/** One entry row (icon, name, stats, move / remove buttons). Used by the Spells tab's grouped lists and the Inventory. */
export const DROP_ENTRY_PARTIAL = `${PARTS_FOLDER}/drop-entry.hbs`;

/** One row of a drop section, with the action buttons. Used by drop-section.hbs and the grouped action sections. */
export const SECTION_ENTRY_PARTIAL = `${PARTS_FOLDER}/section-entry.hbs`;

/** The collapsible action sections (Favorites, Attack, Move, ...). Player Actions tab and NPC Main tab. */
export const ACTION_GROUPS_PARTIAL = `${PARTS_FOLDER}/action-groups.hbs`;

/** The closed "Hidden (3)" list with Restore buttons. Only has rows on actors that can hide grants (NPCs). */
export const HIDDEN_GRANTS_PARTIAL = `${PARTS_FOLDER}/hidden-grants.hbs`;

/** The roll buttons of an action or spell row (attack, damage, ammo, Spirituality). Used by both row partials. */
export const ENTRY_ROLLS_PARTIAL = `${PARTS_FOLDER}/entry-rolls.hbs`;

/** The Favorites star of an action or spell row. Used by both row partials. */
export const ENTRY_FAVORITE_PARTIAL = `${PARTS_FOLDER}/entry-favorite.hbs`;

/** Every partial above, for a part's `templates` list. */
export const SHARED_PARTIALS = [
  DROP_SECTION_PARTIAL, DROP_ENTRY_PARTIAL, SECTION_ENTRY_PARTIAL, ACTION_GROUPS_PARTIAL, HIDDEN_GRANTS_PARTIAL,
  ENTRY_ROLLS_PARTIAL, ENTRY_FAVORITE_PARTIAL,
];

/* -------------------------------------------- */
/*  Drop section configuration                   */
/* -------------------------------------------- */

/**
 * Every section of the sheet that accepts dropped Items.
 * `types` are Item type keys and must match the keys under "Item" in system.json's documentTypes.
 * `types: null` is the catch-all (inventory): any supported Item type not claimed by another section.
 */
const DROP_SECTIONS = {
  skills:    { types: ["skill"] },
  sequences: { types: ["sequence"] },
  abilities: { types: ["ability"] },
  actions:   { types: ["action"] },
  spells:    { types: ["spell"] },
  inventory: { types: null },
};

/**
 * Where the manual order of each section is saved on the actor: { [section]: [entry key, ...] }.
 * Flags need no actor data-model change. Entries missing from a saved order (anything added since)
 * are listed after the ordered ones, and keys whose entry no longer exists are ignored.
 */
const ORDER_FLAG = "flags.lotm.order";

/** Newly added Damage Resistance */
const DEFAULT_DAMAGE_TYPE = "Physical";
const DEFAULT_DAMAGE_RESISTANCE = 1;

/** Bounds of a Sequence's digestionAmount */
const DIGESTION_MIN = 1;
const DIGESTION_MAX = 20;

/** Item types that cannot be dropped on an actor sheet at all. */
const UNSUPPORTED_TYPES = ["pathway"];

/**
 * Item types an actor can own more than one copy of (two candles, two revolvers). They skip the
 * duplicate check and are keyed by their own uuid, so two copies of the same compendium Item don't collide.
 */
const STACKABLE_TYPES = ["gear", "container"];

/**
 * Fields on an Item's system data that hold UUIDs of other Items. Anything found here is
 * resolved and shown in the tab matching the *resolved* Item's type (the `section` is only a
 * fallback for references that no longer resolve).
 * `pick` is for arrays of objects rather than plain UUID strings: the UUID is read from that property.
 */
const NESTED_FIELDS = [
  { path: "abilities_gained", section: "abilities" },                       // Sequence / Gear -> Abilities
  { path: "skill_increase",   section: "skills", pick: "skill_uuid" },      // Sequence -> Skills it raises
  { path: "trainingBonus",    section: "skills" },                          // Sequence -> Knowledge / Training
  { path: "spellList.spells", section: "spells" },                          // Ability  -> Spells
  { path: "actionList",       section: "actions" },                         // Ability / Gear -> Actions
];

/**
 * Which section an Item type belongs to, or null if it can't be placed on a sheet.
 * @param {string} type
 * @returns {string|null}
 */
function sectionForType(type) {
  if (UNSUPPORTED_TYPES.includes(type)) return null;
  for (const [key, def] of Object.entries(DROP_SECTIONS)) {
    if (def.types?.includes(type)) return key;
  }
  return "inventory";
}

/** Localization key for a section's title. */
const sectionLabel = (section) => `LORD_OF_THE_MYSTERIES.Drop.Sections.${section}`;

/**
 * Flatten an Item into the plain object the drop-section partial renders.
 * @param {Item} item
 * @param {{section: string, owned: boolean, key: string, grantedBy?: string[]}} options
 *   `key` identifies the entry in the saved order: the Item's source UUID, so an owned copy and a
 *   reference to the same Item share one key and a position survives re-renders.
 */
function buildEntry(item, { section, owned, key, grantedBy = [], spellList = "" }) {
  const system = item.system ?? {};
  const isAction = item.type === "action";
  // Actions and spells roll the same way (helpers/action-roll.mjs), so their rows get the same buttons and stats.
  const isSpell = item.type === "spell";
  const isRollable = isAction || isSpell;
  // Actions and spells always show a cost (blank counts as 0); for abilities an unset cost is hidden.
  const cost = isRollable ? (system.spiritualityCost ?? 0) : (system.spiritualityCost ?? null);
  const actionType = system.actionType || "";
  const actionTypeText = actionTypeLabel(actionType);
  const isSequence = item.type === "sequence";
  return {
    key,
    // What the hide button saves (granted entries on NPCs). Same as `key`, except for actions on gear (see _prepareSections).
    hideKey: key,
    uuid: item.uuid,
    id: owned ? item.id : null,
    name: item.name,
    img: item.img,
    type: item.type,
    section,
    owned,
    nested: !owned,
    broken: false,
    // Shown as labeled stats on the row. A cost of 0 is still shown; only an unset cost is hidden.
    cost,
    hasCost: cost !== null,
    actionType,
    actionTypeLabel: actionTypeText,
    // Sequences show their digestion amount
    digestion: isSequence ? (system.digestionAmount ?? DIGESTION_MIN) : null,
    hasDigestion: isSequence,
    hasStats: cost !== null || !!actionTypeText || isSequence,
    // Sequences show "Sequence 9 · <pathway>" and sort by rank.
    rank: isSequence ? (system.sequence_number ?? null) : null,
    detail: isSequence ? sequenceDetail(system) : "",
    grantedBy: [...grantedBy],
    grantedByLabel: "",
    // Name of the ability Spell List this entry was found in ("" if none). The Spells tab groups by it.
    spellList,
    // Actions and spells: Action Type, Spirituality Cost and Range are always shown. Range is in feet, blank when unset.
    isAction,
    isSpell,
    isRollable,
    rangeLabel: isRollable && system.range != null
      ? game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.RangeFeet", { range: system.range })
      : "",
    // The attack and damage buttons (actions and spells). They need the actor, so #addActionButtons fills them in later.
    attack: null,
    damage: null,
    spiritButton: null,  // "Spend 2": for a spell with a Spirituality Cost, or an action with one but nothing to roll
    hasRolls: false,
    // Guns and ammo (helpers/firearms.mjs). gunId is set on actions that come from a gun's own action list.
    gunId: "",
    gunStatus: null,     // action rows: how loaded their gun is
    ammoButtons: [],     // action rows: Reload / Chamber / Unload buttons ({ use, label, disabled })
    firearm: item.type === "gear" && system.isFirearm ? firearmStatus(item) : null,   // inventory row of a gun
    ammoBox: item.type === "gear" && system.isAmmo ? ammoBoxStatus(item) : null,     // inventory row of ammo
    // Spells: the actions this spell grants, shown under it on the Spells tab (filled in by _prepareSections).
    spellActions: [],
    // Actions: where they were granted from. spellOnly = only spells grant it, so it stays off the Actions tab.
    fromSpell: false,
    fromOther: false,
    spellOnly: false,
  };
}

/**
 * Add an Item's name to an entry's "Granted by" list, unless it's already there or it's the entry itself.
 * @param {object} entry
 * @param {string} name
 */
function addGrantedBy(entry, name) {
  if (entry.name !== name && !entry.grantedBy.includes(name)) entry.grantedBy.push(name);
}

/** The Spell List name an ability starts with (see ability.mjs). An empty list with this name is not shown. */
const DEFAULT_SPELL_LIST_NAME = "Spells";

/**
 * Whether an ability's Spell List still has the default name (or no name at all).
 * Those lists only appear on the Spells tab once they contain a spell.
 * @param {Item} ability
 * @returns {boolean}
 */
function hasDefaultSpellListName(ability) {
  const name = ability.system?.spellList?.name?.trim() ?? "";
  return !name || name.toLocaleLowerCase() === DEFAULT_SPELL_LIST_NAME.toLocaleLowerCase();
}

/**
 * The name an ability's Spell List is shown under on the Spells tab.
 * A blank name falls back to the ability's own name, so unnamed lists don't all merge together.
 * @param {Item} ability
 * @returns {string}
 */
function spellListName(ability) {
  const name = ability.system?.spellList?.name?.trim();
  return name || ability.name;
}

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
function groupSpellLists(entries, listNames = []) {
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
const FAVORITES_FLAG = "flags.lotm.favoriteActions";

/**
 * Which action sections each player has collapsed. Saved on the player's own User, not the actor,
 * so it's different for every player: { [actor id]: [section key, ...] }. Read with game.user.getFlag("lotm", ...).
 */
const COLLAPSED_FLAG = "collapsedActionGroups";

/** Which Spell Lists each player has collapsed on the Spells tab, saved the same way: { [actor id]: [list key, ...] }. */
const COLLAPSED_SPELLS_FLAG = "collapsedSpellLists";

/** The key a Spell List is collapsed under. The "Other Spells" group has no name of its own. */
const spellListCollapseKey = (list) => list.key || "unlisted";

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
function groupActions(entries, favoriteKeys, collapsedKeys, { favorites: showFavorites = true, spells = [] } = {}) {
  // Nothing to show: no actions, and no favorite spells either.
  const favoriteSpells = showFavorites ? spells.filter((spell) => favoriteKeys.includes(spell.key)) : [];
  if (!entries.length && !favoriteSpells.length) return [];
  const localize = (key) => game.i18n.localize(`LORD_OF_THE_MYSTERIES.ActionGroups.${key}`);

  // Every favorite gets a filled star, wherever it's listed.
  const favoriteSet = new Set(showFavorites ? favoriteKeys : []);
  for (const entry of entries) entry.favorite = favoriteSet.has(entry.key);

  // Favorites, in the saved order. Keys of actions and spells the actor no longer has are skipped.
  const byKey = new Map([...entries, ...favoriteSpells].map((entry) => [entry.key, entry]));
  const favorites = {
    key: "favorites",
    favorites: true,
    label: localize("Favorites"),
    emptyText: localize("FavoritesEmpty"),
    entries: favoriteKeys.filter((key) => byKey.has(key)).map((key) => ({ ...byKey.get(key), favorite: true })),
  };

  // One section per action type. Actions only spells grant are left out: they're listed under their spell
  // on the Spells tab, and only come here through Favorites.
  const byType = new Map();   // type key -> group
  for (const entry of entries) {
    if (entry.spellOnly) continue;
    const type = ACTION_GROUP_ORDER.includes(entry.actionType) ? entry.actionType : "other";
    if (!byType.has(type)) {
      byType.set(type, { key: type, favorites: false, label: localize(`Types.${type}`), emptyText: "", entries: [] });
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

/** Display text for an action type key ("attack" -> "Attack"); unknown keys are shown as they are. */
function actionTypeLabel(key) {
  if (!key) return "";
  const langKey = `LORD_OF_THE_MYSTERIES.Action_Type.${key}`;
  return game.i18n.has(langKey) ? game.i18n.localize(langKey) : key;
}

/** "Sequence 9 · Pathway" line for a Sequence item's system data. */
function sequenceDetail(system) {
  const number = game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.SequenceNumber", { number: system.sequence_number ?? "?" });
  return system.pathway ? `${number} · ${system.pathway}` : number;
}

/**
 * Create a blank embedded Item of the given type and open its sheet.
 * @param {LordOfTheMysteriesActorSheetBase} sheet
 * @param {string} type
 */
export async function createBlankItem(sheet, type) {
  const name = Item.implementation.defaultName({ type, parent: sheet.actor });
  const [created] = await sheet.actor.createEmbeddedDocuments("Item", [{ name, type }]);
  created?.sheet?.render({ force: true });
}


export class LordOfTheMysteriesActorSheetBase extends HandlebarsApplicationMixin(ActorSheetV2) {

  /**
   * Whether action rows get the Favorites star and the Actions list starts with a Favorites section.
   * The player sheet keeps them; the NPC sheet turns them off.
   * @type {boolean}
   */
  static FAVORITES = true;

  /**
   * Names of every non-default Spell List on the actor's abilities (owned or granted), filled in by
   * _prepareSections on each render. The Spells tab shows these lists even when they are empty.
   * @type {string[]}
   */
  #namedSpellLists = [];


  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["lotm", "sheet", "actor"],
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true
    },
    // No selector: the whole sheet is a drop target. _onDropDocument decides what happens
    // based on the [data-drop-zone] section the Item actually landed on.
    // Only set here: sheets that extend this class must not add their own (see the note at the top).
    dragDrop: [{ dragSelector: null, dropSelector: null }],

    actions: {
      editImage: LordOfTheMysteriesActorSheetBase._onEditImage,
      addDamageResistance: LordOfTheMysteriesActorSheetBase._onAddDamageResistance,
      removeDamageResistance: LordOfTheMysteriesActorSheetBase._onRemoveDamageResistance,

      rollSkill: LordOfTheMysteriesActorSheetBase._onRollSkill,
      rollAttribute: LordOfTheMysteriesActorSheetBase.#onRollAttribute,
      rollAction: LordOfTheMysteriesActorSheetBase.#onRollAction,
      rollDamage: LordOfTheMysteriesActorSheetBase.#onRollDamage,
      useAmmo: LordOfTheMysteriesActorSheetBase.#onUseAmmo,
      spendSpirituality: LordOfTheMysteriesActorSheetBase.#onSpendSpirituality,
      useSpirituality: LordOfTheMysteriesActorSheetBase.#onUseSpirituality,

      editItem: LordOfTheMysteriesActorSheetBase._onEditItem,
      openItem: LordOfTheMysteriesActorSheetBase.#onOpenItem,
      sendToChat: LordOfTheMysteriesActorSheetBase.#onSendToChat,
      moveEntry: LordOfTheMysteriesActorSheetBase.#onMoveEntry,
      toggleFavorite: LordOfTheMysteriesActorSheetBase.#onToggleFavorite,
      hideGrant: LordOfTheMysteriesActorSheetBase.#onHideGrant,
      restoreGrant: LordOfTheMysteriesActorSheetBase.#onRestoreGrant,

      addSkill: LordOfTheMysteriesActorSheetBase.#onAddSkill,
      deleteSkill: LordOfTheMysteriesActorSheetBase.#onDeleteSkill,
      addSequence: LordOfTheMysteriesActorSheetBase.#onAddSequence,
      deleteSequence: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      addAbility: LordOfTheMysteriesActorSheetBase.#onAddAbility,
      deleteAbility: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      addAction: LordOfTheMysteriesActorSheetBase.#onAddAction,
      deleteAction: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      addSpell: LordOfTheMysteriesActorSheetBase.#onAddSpell,
      deleteSpell: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      deleteItem: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
    },
  };

  /**
   * Whether granted entries on this actor can be hidden (the eye-slash button and the "Hidden" lists).
   * True for actors whose data has a hiddenGrants list, which only NPCs have (actor-npc.mjs).
   * @type {boolean}
   */
  get canHideGrants() {
    return Array.isArray(this.actor.system.hiddenGrants);
  }

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.actor = this.actor;
    context.system = this.actor.system;
    context.source = this.actor.toObject().system;
    context.editable = this.isEditable;

    // The page selector (Character Info / Main, Actions, Spells, ...).
    context.tabs = this._prepareTabs("sheet");

    // Favorites stars on action rows, and the hide buttons on granted rows (read by the shared partials as @root.*).
    context.showFavorites = this.constructor.FAVORITES;
    context.canHideGrants = this.canHideGrants;

    // Entries for every drop section: the Items the actor owns plus everything nested inside them.
    // `hidden` is the granted entries this actor has hidden, per section (always empty for player characters).
    const { sections, hidden } = await this._prepareSections();
    context.sections = sections;
    context.hiddenGrants = hidden;

    return context;
  }


  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.partId = `${this.id}-${partId}`;

    // Every tab part needs its own tab state ({{tab.cssClass}}).
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];

    switch (partId) {

      case "actions":
        // Favorites, then one collapsible section per action type (attack, move, ...).
        context.actionGroups = this._prepareActionGroups(context.sections.actions, context.sections.spells);
        break;

      case "spells": {
        // Each spell's actions, shown under it. Copies, so they get the star but no move buttons
        // (they keep the spell's own order), and don't change the Actions tab's rows.
        const favorites = new Set(this.constructor.FAVORITES ? (foundry.utils.getProperty(this.actor, FAVORITES_FLAG) ?? []) : []);
        for (const spell of context.sections.spells) {
          // The spell's own star: a favorite spell is also listed in Favorites on the Actions tab.
          spell.favorite = favorites.has(spell.key);
          spell.spellActions = spell.spellActions.map((action) => ({
            ...action, favorite: favorites.has(action.key), canMove: false,
          }));
        }
        // One group per Spell List name. Each one folds open / closed; this player's closed ones stay closed.
        const collapsed = game.user.getFlag("lotm", `${COLLAPSED_SPELLS_FLAG}.${this.actor.id}`) ?? [];
        context.spellLists = groupSpellLists(context.sections.spells, this.#namedSpellLists);
        for (const list of context.spellLists) {
          list.collapseKey = spellListCollapseKey(list);
          list.collapsed = collapsed.includes(list.collapseKey);
        }
        break;
      }

      case "sidebar":
        context.damageTypeChoices = this._prepareDamageTypes();
        break;
    }

    return context;
  }


  /**
   * The action sections for an Actions list: Favorites (if this sheet has them), then one per action type.
   * Remembers which sections the current player collapsed.
   * @param {object[]} entries   context.sections.actions
   * @param {object[]} [spells]  context.sections.spells: favorited spells are listed in Favorites too.
   * @returns {object[]}         See groupActions.
   */
  _prepareActionGroups(entries, spells = []) {
    const favorites = this.constructor.FAVORITES;
    return groupActions(
      entries,
      favorites ? (foundry.utils.getProperty(this.actor, FAVORITES_FLAG) ?? []) : [],
      game.user.getFlag("lotm", `${COLLAPSED_FLAG}.${this.actor.id}`) ?? [],
      { favorites, spells }
    );
  }


  /**
   * The Agility Corruption box shows the worn armor's Agility penalty mixed in (base-actor.mjs), e.g. -4.
   * Before the form saves, add the penalty back, so what's stored is the actor's own corruption
   * and the penalty is never saved. Without this, every edit to the sheet would save the reduced number.
   * @override
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const agi = data.system?.attributes?.agi;
    if (agi && ("corruption" in agi)) {
      const penalty = this.actor.system.carrying?.armor?.agilityPenalty ?? 0;
      agi.corruption = Math.max(0, (Number(agi.corruption) || 0) + penalty);
    }
    return data;
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Digestion inputs on owned Sequence rows belong to the Sequence item, not the actor,
    // so they have no `name` (the actor form skips them) and save here instead. The value is
    // clamped to the schema's bounds so an out-of-range number doesn't fail validation.
    this.element.querySelectorAll(".drop-entry [data-digestion-input]").forEach(input => {
      input.addEventListener("change", async ev => {
        const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
        if (!item || item.type !== "sequence") return;
        const raw = Math.floor(Number(ev.currentTarget.value));
        const value = Math.clamp(Number.isFinite(raw) ? raw : DIGESTION_MIN, DIGESTION_MIN, DIGESTION_MAX);
        ev.currentTarget.value = value;
        if (value === item.system.digestionAmount) return;
        await item.update({ "system.digestionAmount": value });
      });
    });

    // Inventory controls (quantity, hidden pocket, equipped) belong to the gear / container Item, not the actor,
    // so like the digestion inputs they have no `name` and save here instead. `bound` stops a control that
    // wasn't re-rendered from getting a second listener.
    for (const input of this.element.querySelectorAll("[data-item-field]")) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", (event) => this.#onItemFieldChange(event));
    }

    // Each gear row's location dropdown: Held, Worn, or one of the actor's coats / bags.
    for (const select of this.element.querySelectorAll("[data-gear-location]")) {
      if (select.dataset.bound) continue;
      select.dataset.bound = "1";
      select.addEventListener("change", async (event) => {
        const item = this.actor.items.get(event.currentTarget.dataset.itemId);
        await item?.update(placementUpdate(event.currentTarget.value));
      });
    }

    // Action sections and Spell Lists: when a player opens or closes one, remember it for them (see #saveCollapsed).
    for (const details of this.element.querySelectorAll("details[data-action-group]")) {
      if (details.dataset.bound) continue;
      details.dataset.bound = "1";
      details.addEventListener("toggle", () => this.#saveCollapsed("actionGroup", COLLAPSED_FLAG));
    }
    for (const details of this.element.querySelectorAll("details[data-spell-list]")) {
      if (details.dataset.bound) continue;
      details.dataset.bound = "1";
      details.addEventListener("toggle", () => this.#saveCollapsed("spellList", COLLAPSED_SPELLS_FLAG));
    }

    // Highlight the drop section under the cursor. Purely visual; the drop itself is handled in _onDropDocument.
    for (const zone of this.element.querySelectorAll(".drop-section")) {
      if (zone.dataset.dropBound) continue;
      zone.dataset.dropBound = "1";
      zone.addEventListener("dragover", () => zone.classList.add("drag-over"));
      zone.addEventListener("dragleave", (event) => {
        if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", () => zone.classList.remove("drag-over"));
    }
  }


  /**
   * Save which foldable sections this player has collapsed, on their own User, so the sheet opens the same way
   * next time and other players aren't affected. Used for the action sections (data-action-group, COLLAPSED_FLAG)
   * and the Spell Lists (data-spell-list, COLLAPSED_SPELLS_FLAG).
   * Sections not on the sheet right now (a type with no actions) keep whatever was saved for them.
   * Nothing is saved when nothing changed: the browser also fires "toggle" when the sheet is drawn.
   * @param {string} dataKey  The dataset name holding each section's key ("actionGroup" = data-action-group).
   * @param {string} flag     The User flag to save under.
   */
  async #saveCollapsed(dataKey, flag) {
    const attribute = `data-${dataKey.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    const sections = [...this.element.querySelectorAll(`details[${attribute}]`)];
    const shown = new Set(sections.map((details) => details.dataset[dataKey]));
    const key = `${flag}.${this.actor.id}`;
    const saved = game.user.getFlag("lotm", key) ?? [];

    const collapsed = [
      ...saved.filter((group) => !shown.has(group)),
      ...sections.filter((details) => !details.open).map((details) => details.dataset[dataKey]),
    ];

    const same = collapsed.length === saved.length && collapsed.every((group) => saved.includes(group));
    if (!same) await game.user.setFlag("lotm", key, collapsed);
  }



  /**
   * Save an inventory control to its own Item. The input says which Item (data-item-id) and which
   * field (data-item-field, e.g. "system.quantity").
   * @param {Event} event
   */
  async #onItemFieldChange(event) {
    const input = event.currentTarget;
    const item = this.actor.items.get(input.dataset.itemId);
    if (!item) return;

    let value = input.value;
    if (input.type === "checkbox") value = input.checked;
    else if (input.type === "number") value = Math.max(0, Math.floor(Number(input.value) || 0));

    await item.update({ [input.dataset.itemField]: value });
  }


  /**
   * Build the entry list for every drop section.
   *
   * 1. Items embedded on the actor go in the section for their type. These are removable.
   * 2. Every UUID stored inside those Items (NESTED_FIELDS) is resolved and shown in the section for
   *    the *resolved* Item's type, marked as granted by whichever Item(s) reference it. This repeats
   *    through the nested Items themselves (Sequence -> Ability -> Spell/Action), so anything at any
   *    depth shows up in its tab. Nested entries are read-only; remove them from the Item that grants them.
   *
   * Each source UUID appears once: an Item the actor owns *and* is granted by something else is shown
   * once (as owned) with the granting Items listed, and reference loops (A -> B -> A) terminate.
   *
   * Hidden grants (NPCs, see canHideGrants): a granted entry whose hide key is in the actor's hiddenGrants list
   * goes in `hidden` instead of `sections`, and nothing inside it is looked at, so hiding an ability also hides
   * its spells and actions (unless something else grants them too). The Item that grants it isn't changed.
   *   Hide key: the granted Item's uuid, so it's hidden everywhere it would appear on this actor.
   *             Actions on gear use "<gear item id>#<action uuid>" instead, so each piece of gear hides its own copy.
   *   An ability is also hidden when another Item grants an ability with the same name (an actor has each ability once).
   *
   * @returns {Promise<{sections: Record<string, object[]>, hidden: Record<string, object[]>}>}
   */
  async _prepareSections() {
    const sections = Object.fromEntries(Object.keys(DROP_SECTIONS).map((key) => [key, []]));
    const hidden = Object.fromEntries(Object.keys(DROP_SECTIONS).map((key) => [key, []]));
    const bySource = new Map();     // source uuid -> entry already shown
    const ignored = new Set();      // source uuids of unsupported types
    const abilityByName = new Map(); // lower-case ability name -> entry: an actor has each ability once
    const queue = [];
    const entryByUuid = new Map();  // Item uuid -> its entry, so a spell's actions can be listed under the spell
    const actionRows = [];          // [entry, action or spell Item] pairs: their roll buttons are filled in at the end
    this.#namedSpellLists = [];     // non-default Spell List names, shown on the Spells tab even when empty

    // Hidden grants. Empty for actors that can't hide them (player characters).
    const hiddenKeys = new Set(this.canHideGrants ? this.actor.system.hiddenGrants : []);
    const hiddenAbilityNames = await this.#hiddenAbilityNames(hiddenKeys);   // lower-case name -> hide key
    const hiddenByKey = new Map();  // hide key -> its row in `hidden`

    /**
     * Put a granted entry in the Hidden list for its section (once per hide key).
     * @param {string} hideKey
     * @param {Item|null} doc         The granted Item, or null when it no longer exists.
     * @param {string} parentName     The Item that grants it.
     * @param {string} fallbackSection
     */
    const noteHidden = (hideKey, doc, parentName, fallbackSection) => {
      const existing = hiddenByKey.get(hideKey);
      if (existing) {
        addGrantedBy(existing, parentName);
        return;
      }
      const row = {
        key: hideKey,
        uuid: doc?.uuid ?? "",
        name: doc?.name ?? game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing"),
        img: doc?.img ?? "icons/svg/hazard.svg",
        broken: !doc,
        grantedBy: [parentName],
        grantedByLabel: "",
      };
      hiddenByKey.set(hideKey, row);
      hidden[(doc && sectionForType(doc.type)) || fallbackSection].push(row);
    };

    // 1. Owned Items
    for (const item of this.actor.items) {
      const section = sectionForType(item.type);
      if (!section) continue;
      // Gear and containers can be owned twice from the same source, so they use their own uuid.
      const source = STACKABLE_TYPES.includes(item.type) ? null : item._stats?.compendiumSource;
      const key = source ?? item.uuid;
      const entry = buildEntry(item, { section, owned: true, key });
      sections[section].push(entry);
      bySource.set(key, entry);
      entryByUuid.set(item.uuid, entry);
      if (entry.isRollable) actionRows.push([entry, item]);
      if (item.type === "ability") abilityByName.set(item.name.toLocaleLowerCase(), entry);
      queue.push(item);
    }

    // 2. Nested Items, breadth first
    while (queue.length) {
      const parent = queue.shift();

      // Every ability with a renamed Spell List gets a group on the Spells tab, spells or not.
      if (parent.type === "ability" && !hasDefaultSpellListName(parent)) {
        this.#namedSpellLists.push(spellListName(parent));
      }

      // Remember where each action came from. An action from a spell is listed under that spell on the
      // Spells tab; if only spells grant it, it stays off the Actions tab unless it's a favorite (spellOnly below).
      const noteGrant = (entry) => {
        if (entry.section !== "actions") return;
        if (parent.type !== "spell") {
          entry.fromOther = true;
          return;
        }
        entry.fromSpell = true;
        const spellEntry = entryByUuid.get(parent.uuid);
        if (spellEntry && !spellEntry.spellActions.includes(entry)) spellEntry.spellActions.push(entry);
      };

      for (const { path, section: fallbackSection, pick } of NESTED_FIELDS) {
        const raw = foundry.utils.getProperty(parent.system ?? {}, path);
        if (!Array.isArray(raw)) continue;
        const uuids = pick ? raw.map((row) => row?.[pick]) : raw;

        // Spells reached through an ability's Spell List remember that list's name, for grouping on the Spells tab.
        const listName = path === "spellList.spells" ? spellListName(parent) : "";

        for (const uuid of uuids) {
          if (!uuid || ignored.has(uuid)) continue;

          // Actions on gear are always listed again, even when the actor already has that action
          // (two revolvers = two "Shoot" actions). Each gear Item's copy gets its own key, so it doesn't merge
          // with other entries and keeps its own place when moved up / down.
          const gearAction = parent.type === "gear" && path === "actionList";
          const key = gearAction ? `${parent.uuid}#${uuid}` : uuid;
          // The hide key uses the gear's id rather than its uuid: an NPC's token copies share the ids,
          // but not the uuids, so a gear action hidden on the NPC stays hidden on its tokens.
          const hideKey = gearAction ? `${parent.id}#${uuid}` : uuid;

          const existing = bySource.get(key);
          if (existing) {
            addGrantedBy(existing, parent.name);
            noteGrant(existing);
            // An owned spell that is also in a Spell List is shown in that list. A spell in two
            // differently-named lists stays in the first one found (each spell is shown once).
            if (listName && !existing.spellList) existing.spellList = listName;
            continue;
          }

          // Hidden on this actor: list it under "Hidden", and don't look inside it.
          if (hiddenKeys.has(hideKey)) {
            const found = await fromUuid(uuid).catch(() => null);
            const doc = found?.documentName === "Item" ? found : null;
            if (doc && !sectionForType(doc.type)) {
              ignored.add(uuid);
              continue;
            }
            noteHidden(hideKey, doc, parent.name, fallbackSection);
            continue;
          }

          const doc = await fromUuid(uuid).catch(() => null);

          if (!doc || doc.documentName !== "Item") {
            const broken = {
              key, hideKey, uuid, id: null, name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing"),
              img: "icons/svg/hazard.svg", type: "", section: fallbackSection,
              owned: false, nested: true, broken: true, cost: null, hasCost: false,
              actionType: "", actionTypeLabel: "", digestion: null, hasDigestion: false,
              hasStats: false, rank: null, detail: "",
              grantedBy: [parent.name], grantedByLabel: "", spellList: listName,
              spellActions: [], fromSpell: false, fromOther: false, spellOnly: false,
            };
            bySource.set(key, broken);
            sections[fallbackSection].push(broken);
            noteGrant(broken);
            continue;
          }

          const section = sectionForType(doc.type);
          if (!section) {
            ignored.add(uuid);
            continue;
          }

          // An actor has each ability once. If one with this name is already listed (owned, or granted by
          // something else, even from a different source), this Item is added to its "Granted by" instead.
          if (doc.type === "ability") {
            const lowerName = doc.name.toLocaleLowerCase();
            const sameName = abilityByName.get(lowerName);
            if (sameName) {
              addGrantedBy(sameName, parent.name);
              bySource.set(uuid, sameName);
              continue;
            }
            // An ability with the same name as a hidden one is hidden too (under the hidden one's key).
            if (hiddenAbilityNames.has(lowerName)) {
              noteHidden(hiddenAbilityNames.get(lowerName), doc, parent.name, section);
              continue;
            }
          }

          const entry = buildEntry(doc, { section, owned: false, key, grantedBy: [parent.name], spellList: listName });
          entry.hideKey = hideKey;
          // An action from a gun's own list fires / reloads that gun.
          if (gearAction) entry.gunId = parent.id;
          bySource.set(key, entry);
          entryByUuid.set(doc.uuid, entry);
          sections[section].push(entry);
          noteGrant(entry);
          if (entry.isRollable) actionRows.push([entry, doc]);
          if (doc.type === "ability") abilityByName.set(doc.name.toLocaleLowerCase(), entry);
          // A gear action is a copy of one that may already be listed, so what's inside it was already handled.
          if (!gearAction) queue.push(doc);
        }
      }
    }

    // Actions only spells grant (not owned, and not granted by anything else) stay on the Spells tab.
    // groupActions leaves them out of the Actions tab's type sections; they still show in Favorites.
    for (const entry of sections.actions) {
      entry.spellOnly = !entry.owned && entry.fromSpell && !entry.fromOther;
    }

    // Order each section: the saved manual order first, then anything not in it (new entries land at the
    // bottom) in the default order: owned before granted, then by Sequence number (lowest = strongest, so
    // the current Sequence leads) where there is one, then alphabetical.
    const savedOrder = foundry.utils.getProperty(this.actor, ORDER_FLAG) ?? {};
    for (const [sectionKey, entries] of Object.entries(sections)) {
      const saved = Array.isArray(savedOrder[sectionKey]) ? savedOrder[sectionKey] : [];
      const position = new Map(saved.map((key, index) => [key, index]));

      entries.sort((a, b) => {
        const pa = position.get(a.key);
        const pb = position.get(b.key);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;

        if (a.owned !== b.owned) return a.owned ? -1 : 1;
        if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name);
      });

      entries.forEach((entry, index) => {
        entry.grantedByLabel = entry.grantedBy.join(", ");
        entry.canMove = entries.length > 1;
        entry.canMoveUp = index > 0;
        entry.canMoveDown = index < entries.length - 1;
      });
    }

    // Hidden lists: alphabetical.
    for (const rows of Object.values(hidden)) {
      rows.sort((a, b) => a.name.localeCompare(b.name));
      for (const row of rows) row.grantedByLabel = row.grantedBy.join(", ");
    }

    // Attack and damage buttons on every action row. Promise.all looks up all the actions' skills at once
    // instead of one after another.
    await Promise.all(actionRows.map(([entry, action]) => this.#addActionButtons(entry, action)));

    return { sections, hidden };
  }


  /**
   * The names of the hidden abilities, so another ability with the same name can be hidden too.
   * @param {Set<string>} hiddenKeys
   * @returns {Promise<Map<string, string>>}  lower-case ability name -> its hide key
   */
  async #hiddenAbilityNames(hiddenKeys) {
    const names = new Map();
    await Promise.all([...hiddenKeys].map(async (hideKey) => {
      // Gear action keys are "<gear id>#<action uuid>"; everything else is just the uuid.
      const doc = await fromUuid(hideKey.split("#").pop()).catch(() => null);
      if (doc?.documentName === "Item" && doc.type === "ability") names.set(doc.name.toLocaleLowerCase(), hideKey);
    }));
    return names;
  }


  /**
   * Fill in an action row's buttons:
   *   entry.attack  "Pistol +5" (missing when the action has no skill, or its skill is gone)
   *   entry.damage  hover text like "1d8+3 Physical" (missing when the action has no damage formula)
   * @param {object} entry   The row from buildEntry.
   * @param {Item} action
   */
  async #addActionButtons(entry, action) {
    entry.attack = await getActionAttackSummary(this.actor, action);
    const damageTooltip = getDamageTooltip(this.actor, action);
    entry.damage = damageTooltip ? { tooltip: damageTooltip } : null;

    // Actions that use ammo show their gun's rounds ("5/6"). A fire action spends them through its attack button;
    // the others (and a fire action with no attack roll) get a button of their own.
    // A reload action also gets an Unload button, so a gun doesn't need a separate unload action.
    const use = action.system.ammoUse ?? "none";
    entry.ammoButtons = [];
    if (use !== "none") {
      const gun = gunFor(this.actor, entry.gunId, { quiet: true });
      entry.gunStatus = gun ? firearmStatus(gun) : null;

      const button = (buttonUse, disabled = false) => ({
        use: buttonUse,
        label: game.i18n.localize(`LORD_OF_THE_MYSTERIES.Firearm.Buttons.${buttonUse}`),
        disabled,
      });
      if (use !== "fire" || !entry.attack) entry.ammoButtons.push(button(use));
      if (use === "reload") {
        // Greyed out while there's nothing in the gun to take out.
        const loaded = entry.gunStatus && (entry.gunStatus.loaded > 0 || entry.gunStatus.chambered);
        entry.ammoButtons.push(button("unload", !loaded));
      }
    }

    // A Spirituality Cost is spent when the attack is rolled (the checkbox in the roll dialog, helpers/spirituality.mjs).
    // A "Spend N" button that just spends it is added to:
    //   - an action with a cost but nothing to roll
    //   - every spell with a cost, next to its roll button: spells are often cast without an attack roll,
    //     and every spell can roll (with Occultism by default), so they'd never get the button otherwise.
    const cost = spiritualityCost(action);
    entry.spiritButton = (cost > 0 && (!entry.attack || entry.isSpell))
      ? { label: game.i18n.format("LORD_OF_THE_MYSTERIES.Spirituality.UseButton", { cost }) }
      : null;

    entry.hasRolls = !!(entry.attack || entry.damage || entry.ammoButtons.length || entry.gunStatus || entry.spiritButton);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                  */
  /* -------------------------------------------- */

  /**
   * Handle a Document being dropped onto the sheet. ActorSheetV2 has already parsed the drop
   * event and resolved it to a Document; this decides which section takes it.
   *
   * - Dropped on a section: the Item must belong in that section, otherwise it is rejected.
   * - Dropped anywhere else on the sheet: it is placed in the section for its type.
   * @override
   */
  async _onDropDocument(event, document) {
    if (document.documentName !== "Item") return super._onDropDocument(event, document);
    if (!this.isEditable) return null;

    // Gear dropped on a coat / bag (or on "Held & worn") in the Inventory tab goes there.
    const place = event.target?.closest?.("[data-inventory-place]")?.dataset.inventoryPlace;
    const placement = (document.type === "gear" && place !== undefined) ? placementUpdate(place) : null;

    // Already on this actor: move it if it was dropped on an inventory group, otherwise leave it to Foundry (re-sorting).
    if (document.parent === this.actor) {
      if (placement) return document.update(placement);
      return super._onDropDocument(event, document);
    }

    const section = sectionForType(document.type);
    if (!section) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.Unsupported", { name: document.name }));
      return null;
    }

    const zone = event.target?.closest?.("[data-drop-zone]")?.dataset.dropZone ?? null;
    if (zone && zone !== section) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.WrongSection", {
        name: document.name,
        section: game.i18n.localize(sectionLabel(zone)),
      }));
      return null;
    }

    if (section === "skills") return this.#dropSkill(document);
    return this.#dropEmbedded(document, placement);
  }


  /**
   * Copy an Item onto the actor as an embedded Item. The source UUID is kept in
   * _stats.compendiumSource so duplicates are caught and nested references to the same
   * Item are recognised as the one the actor already owns.
   * @param {Item} item
   * @param {object|null} [placement]  For gear: where it was dropped (see placementUpdate). When it wasn't
   *                                   dropped on a coat / bag, it goes in the first one with room.
   * @returns {Promise<Item|null>}
   */
  async #dropEmbedded(item, placement = null) {
    // Same Item already owned (by source), or, for abilities, one with the same name: _onDropItem below holds the
    // same rule, but drops from outside the actor are handled here and never reach it.
    // Gear and containers can be owned more than once, so they skip this.
    const alreadyOwned = !STACKABLE_TYPES.includes(item.type) && this.actor.items.some((owned) =>
      owned._stats?.compendiumSource === item.uuid
      || (item.type === "ability" && owned.type === "ability" && owned.name === item.name)
    );
    if (alreadyOwned) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.Duplicate", { name: item.name }));
      return null;
    }

    const data = item.toObject();
    delete data._id;
    delete data.folder;
    delete data.sort;
    delete data.ownership;
    foundry.utils.setProperty(data, "_stats.compendiumSource", item.uuid);

    // Gear: put it somewhere. Its old containerId (from another actor) means nothing here, so it's always replaced.
    if (item.type === "gear") {
      const where = placement ?? autoPlacement(this.actor, data);
      foundry.utils.mergeObject(data, foundry.utils.expandObject(where));
    }

    const [created] = await this.actor.createEmbeddedDocuments("Item", [data]);
    return created ?? null;
  }

  /**
   * Skills are not embedded: the actor only stores a level per skill UUID
   * (system.skills[category] = [{ skill, level }]) and the sheet lists them under their attribute.
   * Any skill Item can be dropped, from a compendium or the world. Dropping records it at "trained"; a skill
   * the actor already lists as "untrained" (every compendium skill is, once a field has been edited) is raised
   * to "trained" instead of being rejected as a duplicate.
   * @param {Item} item
   * @returns {Promise<Item|null>}
   */
  async #dropSkill(item) {
    const folders = CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders ?? {};
    // Skills are filed under their linked attribute's tab. (This used to check system.category first, but
    // those are related-skill categories like "fighting", never a tab, and the field is now system.categories.)
    const category = [item.system.skill_attribute].find((key) => key && key in folders);
    if (!category) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.NoSkillCategory", { name: item.name }));
      return null;
    }

    const current = this.actor.toObject().system.skills?.[category] ?? [];
    const index = current.findIndex((entry) => entry.skill === item.uuid);

    let updated;
    if (index < 0) {
      updated = [...current, { skill: item.uuid, level: "trained" }];
    } else if (current[index].level === "untrained") {
      updated = current.map((entry, i) => (i === index ? { ...entry, level: "trained" } : entry));
    } else {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.Duplicate", { name: item.name }));
      return null;
    }

    await this.actor.update({ [`system.skills.${category}`]: updated });
    return item;
  }


  /**
   * ActorSheetV2 already turns a dropped compendium/world Item into an owned copy;
   * this only stops the same ability being added twice.
   * @override
   */
  async _onDropItem(event, item) {
    const alreadyOwned = item.type === "ability"
      && item.parent?.uuid !== this.actor.uuid
      && this.actor.items.some(owned => owned.type === "ability"
        && (owned._stats?.compendiumSource === item.uuid || owned.name === item.name));
    if (alreadyOwned) {
      ui.notifications.warn(`${this.actor.name} already has ${item.name}.`);
      return null;
    }
    return super._onDropItem(event, item);
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /**
   * Open the core FilePicker to change the actor's portrait image.
   */
  static _onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.actor, attr);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: path => this.actor.update({ [attr]: path })
    });
    return fp.browse();
  }


  /**
   * Damage types for Damage Resistance dropdown
   * @returns {Record<string, string>}
   */
  _prepareDamageTypes() {
    const types = foundry.utils.getProperty(game.i18n.translations, "LORD_OF_THE_MYSTERIES.DamageTypes") ?? {};

    return Object.fromEntries(
      Object.keys(types).map(key => [key, game.i18n.localize(`LORD_OF_THE_MYSTERIES.DamageTypes.${key}`)])
    );
  }


  /**
   * Add Damage Resistance
   */
  static async _onAddDamageResistance(event, target) {
    if (!this.isEditable) return;

    const current = this.actor.toObject().system.damage_resistance ?? [];

    await this.actor.update({
      "system.damage_resistance": [...current, { damageType: DEFAULT_DAMAGE_TYPE, value: DEFAULT_DAMAGE_RESISTANCE }]
    });
  }


  /**
   * Remove Damage Resistance
   */
  static async _onRemoveDamageResistance(event, target) {
    if (!this.isEditable) return;

    const index = Number(target.dataset.index);
    const current = this.actor.toObject().system.damage_resistance ?? [];

    if (!Number.isInteger(index) || index < 0 || index >= current.length) return;

    await this.actor.update({ "system.damage_resistance": current.filter((_, i) => i !== index) });
  }


  /**
   * Open SkillCheckDialog for the clicked skill. All the data the dialog
   * needs (uuid/name/level/category/attribute) travels in via data-*
   * attributes on the skill row (see character.hbs on the player sheet, npc/main.hbs on the NPC sheet).
   * Shift-click rolls right away without the dialog.
   */
  static _onRollSkill(event, target) {
    const row = target.closest("[data-skill-uuid]");
    if (!row) return;

    SkillCheckDialog.prompt(this.actor, {
      uuid: row.dataset.skillUuid,
      name: row.dataset.skillName,
      category: row.dataset.category,
      attribute: row.dataset.attribute || row.dataset.category,
      level: row.dataset.level,
      flatModifier: Number(row.dataset.flatModifier) || 0
    }, { fast: event.shiftKey });
  }


  /**
   * Click an attribute's total (data-attribute = the attribute key): open the attribute check dialog,
   * which rolls 1d20 plus that total plus any modifiers, e.g. "1d20 +3[STR]" (apps/attribute-check-dialog.mjs).
   * Shift-click rolls right away without the dialog.
   */
  static async #onRollAttribute(event, target) {
    await AttributeCheckDialog.prompt(this.actor, target.dataset.attribute, { fast: event.shiftKey });
  }


  /**
   * Roll an action with its skill (data-uuid = the action). Works for any action on the sheet, whether the
   * actor owns it or it's granted by a Sequence, ability or gear. All the rolling lives in
   * helpers/action-roll.mjs, so the sheet, hotbar macros and the chat damage button share one path.
   */
  static async #onRollAction(event, target) {
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    // gunId: for actions listed under a gun, that gun. rollActionAttack spends the rounds for "Fires rounds" actions.
    // Shift-click rolls right away without the dialog.
    if (action) await rollActionAttack(this.actor, action, { gunId: target.dataset.gunId, fast: event.shiftKey });
  }


  /**
   * A Reload / Chamber / Unload button on an action row (data-uuid = the action, data-gun-id = its gun,
   * data-ammo-use = what the button does, e.g. "unload" on a reload action). See useAmmoAction in helpers/firearms.mjs.
   */
  static async #onUseAmmo(event, target) {
    if (!this.isEditable) return;
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    if (action) await useAmmoAction(this.actor, action, target.dataset.gunId, target.dataset.ammoUse);
  }


  /**
   * The sidebar's Spend button under Spirituality: ask how much, then spend it (helpers/spirituality.mjs).
   */
  static async #onSpendSpirituality(event, target) {
    if (!this.isEditable) return;
    await openSpendSpiritualityDialog(this.actor);
  }


  /**
   * The "Spend N" button on an action with a Spirituality Cost but nothing to roll (data-uuid = the action).
   */
  static async #onUseSpirituality(event, target) {
    if (!this.isEditable) return;
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    if (action) await useActionSpirituality(this.actor, action);
  }


  /**
   * Roll an action's damage straight from the sheet (data-uuid = the action), without rolling the attack first.
   * Same roll and chat message as the "Roll Damage" button in chat.
   */
  static async #onRollDamage(event, target) {
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    if (action) await rollActionDamage(this.actor, action);
  }


  /**
   * Open an owned item's sheet (the edit control on the player Abilities tab's own list).
   */
  static _onEditItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    item?.sheet.render(true);
  }


  /**
   * Remove an owned item from the actor, with Foundry's own confirm dialog.
   * (Not wired to a button; the sheets use #onDeleteItem. Kept for anything that calls it directly.)
   */
  static async _onDeleteItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    await item?.deleteDialog();
  }


  /** Open the sheet of an entry's Item, whether the actor owns it or it is only referenced. */
  static async #onOpenItem(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet?.render({ force: true });
  }


  /**
   * Move an entry one place up or down within its section (data-direction="up"|"down", data-key = entry key).
   * Works for owned and granted entries alike. The order on screen is the source of truth: swap the entry with
   * its neighbour in that list and save the whole section's order, which also drops keys of entries that no
   * longer exist.
   */
  static async #onMoveEntry(event, target) {
    if (!this.isEditable) return;

    const zone = target.closest("[data-drop-zone]");
    const section = zone?.dataset.dropZone;
    if (!section) return;

    const list = target.closest(".drop-section-list");
    const up = target.dataset.direction === "up";

    // Favorites: their order is the favorites list itself (FAVORITES_FLAG), separate from the
    // section's order, so moving a favorite doesn't move it in its type section.
    if (list?.hasAttribute("data-favorites")) {
      const order = [...list.children].filter((li) => li.matches(".drop-entry")).map((li) => li.dataset.key);
      const from = order.indexOf(target.dataset.key);
      const to = from + (up ? -1 : 1);
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      await this.actor.update({ [FAVORITES_FLAG]: order });
      return;
    }

    // Every entry in the whole section, top to bottom (not counting the Favorites copies). This full list is what gets saved.
    const keys = [...zone.querySelectorAll(".drop-section-list:not([data-favorites]) > .drop-entry")].map((li) => li.dataset.key);

    // The entries in the same list as the clicked one. Most sections have one list, so this is the same as
    // `keys`; on the Spells tab each Spell List group is its own list, and in the action sections each action type
    // section is; an entry only moves inside its group.
    const siblings = list
      ? [...list.children].filter((li) => li.matches(".drop-entry")).map((li) => li.dataset.key)
      : keys;

    const from = siblings.indexOf(target.dataset.key);
    const to = from + (up ? -1 : 1);
    if (from < 0 || to < 0 || to >= siblings.length) return;

    // Swap the two neighbours' places in the full list.
    const a = keys.indexOf(siblings[from]);
    const b = keys.indexOf(siblings[to]);
    [keys[a], keys[b]] = [keys[b], keys[a]];
    await this.actor.update({ [`${ORDER_FLAG}.${section}`]: keys });
  }


  /**
   * The star on an action row: add the action to Favorites, or take it out (data-key = the entry key).
   * Saved on the actor (FAVORITES_FLAG); new favorites go at the bottom of the list.
   */
  static async #onToggleFavorite(event, target) {
    if (!this.isEditable) return;
    const key = target.dataset.key;
    const current = foundry.utils.getProperty(this.actor, FAVORITES_FLAG) ?? [];
    const updated = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    await this.actor.update({ [FAVORITES_FLAG]: updated });
  }


  /**
   * The eye-slash button on a granted row (data-hide-key, see _prepareSections): hide it on this actor.
   * Only actors with a hiddenGrants list (NPCs) have the button. The Item that grants it isn't changed.
   */
  static async #onHideGrant(event, target) {
    if (!this.isEditable || !this.canHideGrants) return;
    const key = target.dataset.hideKey;
    const current = this.actor.system.hiddenGrants;
    if (!key || current.includes(key)) return;
    await this.actor.update({ "system.hiddenGrants": [...current, key] });
  }


  /** The Restore button in a "Hidden" list (data-hide-key): show the entry again. */
  static async #onRestoreGrant(event, target) {
    if (!this.isEditable || !this.canHideGrants) return;
    const key = target.dataset.hideKey;
    const current = this.actor.system.hiddenGrants;
    if (!key || !current.includes(key)) return;
    await this.actor.update({ "system.hiddenGrants": current.filter((k) => k !== key) });
  }


  /**
   * Post an entry's Item to chat: image, name and description, spoken as this actor.
   * Works for owned Items and for ones that are only referenced (granted by another Item).
   */
  static async #onSendToChat(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    if (!doc) return;

    const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      doc.system?.description ?? "",
      { secrets: doc.isOwner, relativeTo: doc }
    );
    const name = Handlebars.escapeExpression(doc.name);
    const img = Handlebars.escapeExpression(doc.img);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="lotm chat-item">
        <header class="chat-item-header"><img src="${img}" width="36" height="36" alt=""><h3>${name}</h3></header>
        <div class="chat-item-description">${description}</div>
      </div>`,
    });
  }

  // Skills come from compendiums / the sidebar, so that button just points at drag and drop.
  static async #onAddSkill(event, target) {
    ui.notifications.info(game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.DragHintSkills"));
  }

  static async #onAddSequence(event, target) {
    return createBlankItem(this, "sequence");
  }

  static async #onAddAbility(event, target) {
    return createBlankItem(this, "ability");
  }

  static async #onAddAction(event, target) {
    return createBlankItem(this, "action");
  }

  static async #onAddSpell(event, target) {
    return createBlankItem(this, "spell");
  }


  /**
   * Remove a skill the actor has recorded. Expects data-uuid (skill) and data-category on the button.
   */
  static async #onDeleteSkill(event, target) {
    if (!this.isEditable) return;
    const { uuid, category } = target.dataset;
    if (!uuid || !category) return;
    const current = this.actor.toObject().system.skills?.[category] ?? [];
    await this.actor.update({ [`system.skills.${category}`]: current.filter((entry) => entry.skill !== uuid) });
  }


  /**
   * Remove an embedded Item (shared by deleteSequence / deleteAbility / deleteAction / deleteSpell /
   * deleteItem). Hold Shift to skip the confirmation. Only owned entries get a delete button;
   * granted ones are removed from the Item that grants them (or hidden, on NPCs).
   */
  static async #onDeleteItem(event, target) {
    // The id sits on the button in the drop sections, and on the row around it in the player Abilities tab's own list.
    const item = this.actor.items.get(target.dataset.itemId ?? target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;

    if (!event.shiftKey) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.RemoveTitle") },
        content: `<p>${game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.RemoveConfirm", { name: Handlebars.escapeExpression(item.name) })}</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return;
    }

    await item.delete();
  }

}
