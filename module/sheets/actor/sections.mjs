/**
 * What the actor sheets' drop sections list (Skills, Sequences, Abilities, Actions, Spells, Inventory): one entry per
 * Item the actor owns or is granted, with its stats and buttons. sheets/base-actor-sheet.mjs shows them;
 * groups.mjs splits the Actions and Spells sections into their collapsible groups.
 *
 *   SectionBuilder      builds every section for an actor (owned Items, everything they grant, hidden grants, order)
 *   buildEntry          one Item as an entry
 *   addActionButtons    an action or spell entry's roll, ammo, Spirituality and toggle buttons
 *   sectionForType      which section an Item type goes in
 */

import { getActionAttackSummary, getDamageTooltip } from "../../helpers/action-roll.mjs";
import { ammoBoxStatus, firearmStatus, gunFor } from "../../helpers/firearms.mjs";
import { GunHandling } from "../../helpers/gun-handling.mjs";
import { spiritualityCost } from "../../helpers/spirituality.mjs";
import { grantedActionUuids, isEffectActive } from "../../effects/effect-grants.mjs";
import { toggleButton } from "../../effects/toggle-effects.mjs";

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
export const ORDER_FLAG = "flags.lotm.order";

/** Bounds of a Sequence's digestionAmount */
export const DIGESTION_MIN = 1;
export const DIGESTION_MAX = 20;

/** Item types that cannot be dropped on an actor sheet at all. */
const UNSUPPORTED_TYPES = ["pathway"];

/**
 * Item types an actor can own more than one copy of (two candles, two revolvers). They skip the
 * duplicate check and are keyed by their own uuid, so two copies of the same compendium Item don't collide.
 */
export const STACKABLE_TYPES = ["gear", "container"];

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
  { path: "actionList",       section: "actions" },                         // Ability / Gear / Active Effect -> Actions
];

/**
 * Which section an Item type belongs to, or null if it can't be placed on a sheet.
 * @param {string} type
 * @returns {string|null}
 */
export function sectionForType(type) {
  if (UNSUPPORTED_TYPES.includes(type)) return null;
  for (const [key, def] of Object.entries(DROP_SECTIONS)) {
    if (def.types?.includes(type)) return key;
  }
  return "inventory";
}

/** Localization key for a section's title. */
export const sectionLabel = (section) => `LORD_OF_THE_MYSTERIES.Drop.Sections.${section}`;

/**
 * Flatten an Item into the plain object the drop-section partial renders.
 * @param {Item} item
 * @param {{section: string, owned: boolean, key: string, grantedBy?: string[]}} options
 *   `key` identifies the entry in the saved order: the Item's source UUID, so an owned copy and a
 *   reference to the same Item share one key and a position survives re-renders.
 */
export function buildEntry(item, { section, owned, key, grantedBy = [], spellList = "" }) {
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
    // What the hide button saves (granted entries on NPCs). Same as `key`, except for actions on gear (SectionBuilder).
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
    // The attack and damage buttons (actions and spells). They need the actor, so addActionButtons fills them in later.
    attack: null,
    damage: null,
    spiritButton: null,  // "Spend 2": for a spell with a Spirituality Cost, or an action with one but nothing to roll
    toggle: null,        // On / Off: for an action with a Toggle effect, like Activate Spirit Vision (effects/toggle-effects.mjs)
    hasRolls: false,
    // Guns and ammo (helpers/firearms.mjs). gunId is set on actions that come from a gun's own action list.
    gunId: "",
    gunStatus: null,     // action rows: how loaded their gun is
    ammoButtons: [],     // action rows: Fire / Reload / Chamber / Rotate / Unload buttons ({ use, label, tooltip, gunId, idle })
    firearm: item.type === "gear" && system.isFirearm ? firearmStatus(item) : null,   // inventory row of a gun
    ammoBox: item.type === "gear" && system.isAmmo ? ammoBoxStatus(item) : null,     // inventory row of ammo
    // Spells: the actions this spell grants, shown under it on the Spells tab (filled in by SectionBuilder).
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
 * Fill in an action row's buttons:
 *   entry.attack  "Pistol +5" (missing when the action has no skill, or its skill is gone)
 *   entry.damage  hover text like "1d8+3 Physical" (missing when the action has no damage formula)
 * @param {Actor} actor
 * @param {object} entry   The row from buildEntry.
 * @param {Item} action
 */
export async function addActionButtons(actor, entry, action) {
  entry.attack = await getActionAttackSummary(actor, action);
  const damageTooltip = getDamageTooltip(actor, action);
  entry.damage = damageTooltip ? { tooltip: damageTooltip } : null;

  // An action that fires a gun (the gun's Shoot action) shows the gun's rounds ("5/6") and gets the gun's handling
  // buttons: Reload, Chamber, Rotate, Unload, whichever its feed has (helpers/gun-handling.mjs). Hovering over one
  // says its Action Type. The rounds are spent through the attack button; a fire action with no attack roll gets a
  // Fire button instead. (Old Reload / Pull Bolt actions get nothing: that's on the Shoot row now.)
  entry.ammoButtons = [];
  if (action.system.ammoUse === "fire") {
    const gun = gunFor(actor, entry.gunId, { quiet: true });
    entry.gunStatus = gun ? firearmStatus(gun) : null;

    if (!entry.attack) {
      entry.ammoButtons.push({
        use: "fire",
        label: game.i18n.localize("LORD_OF_THE_MYSTERIES.Firearm.Buttons.fire"),
        tooltip: entry.actionTypeLabel
          ? game.i18n.format("LORD_OF_THE_MYSTERIES.Firearm.Handling.Tooltip", {
            name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Firearm.Buttons.fire"), type: entry.actionTypeLabel,
          })
          : "",
        gunId: entry.gunId,
        idle: false,
      });
    }
    for (const handling of GunHandling.listFor(gun)) entry.ammoButtons.push(handling.toButton());
  }

  // A Spirituality Cost is spent when the attack is rolled (the checkbox in the roll dialog, helpers/spirituality.mjs).
  // A "Spend N" button that just spends it is added to:
  //   - an action with a cost but nothing to roll
  //   - every spell with a cost, next to its roll button: spells are often cast without an attack roll,
  //     and every spell can roll (with Occultism by default), so they'd never get the button otherwise.
  // An action with a Toggle effect (Activate Spirit Vision) gets an On / Off button instead: switching it on spends
  // the cost (effects/toggle-effects.mjs).
  entry.toggle = toggleButton(actor, action);
  const cost = spiritualityCost(action);
  entry.spiritButton = (!entry.toggle && cost > 0 && (!entry.attack || entry.isSpell))
    ? { label: game.i18n.format("LORD_OF_THE_MYSTERIES.Spirituality.UseButton", { cost }) }
    : null;

  entry.hasRolls = !!(entry.attack || entry.damage || entry.ammoButtons.length || entry.gunStatus || entry.spiritButton
    || entry.toggle);
}


/* -------------------------------------------- */
/*  Building the sections                        */
/* -------------------------------------------- */

/** A row for a granted UUID that doesn't lead to an Item any more (deleted, or its compendium is gone). */
function brokenEntry({ key, hideKey, uuid, section, grantedBy, spellList }) {
  return {
    key, hideKey, uuid, id: null, name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing"),
    img: "icons/svg/hazard.svg", type: "", section,
    owned: false, nested: true, broken: true, cost: null, hasCost: false,
    actionType: "", actionTypeLabel: "", digestion: null, hasDigestion: false,
    hasStats: false, rank: null, detail: "",
    grantedBy: [grantedBy], grantedByLabel: "", spellList,
    spellActions: [], fromSpell: false, fromOther: false, spellOnly: false,
  };
}

/** One empty list per drop section. */
const emptySections = () => Object.fromEntries(Object.keys(DROP_SECTIONS).map((key) => [key, []]));


/**
 * Build the entry list for every drop section of an actor's sheet.
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
 * Active Effects can grant actions too (their system.actionList, effects/effect-grants.mjs). Every active effect
 * on the actor, or lent to it by one of its Items, is looked inside like an owned Item, so its actions are listed
 * "Granted by" the effect. Turned off, suppressed (stowed gear) or gone: its actions go away. An action the actor
 * already has from somewhere else is listed once, with the effect added to its "Granted by".
 *
 * Hidden grants (NPCs, canHideGrants): a granted entry whose hide key is in the actor's hiddenGrants list
 * goes in `hidden` instead of `sections`, and nothing inside it is looked at, so hiding an ability also hides
 * its spells and actions (unless something else grants them too). The Item that grants it isn't changed.
 *   Hide key: the granted Item's uuid, so it's hidden everywhere it would appear on this actor.
 *             Actions on gear use "<gear item id>#<action uuid>" instead, so each piece of gear hides its own copy.
 *   An ability is also hidden when another Item grants an ability with the same name (an actor has each ability once).
 *
 * Use: const { sections, hidden, namedSpellLists } = await new SectionBuilder(actor, { canHideGrants }).build();
 */
export class SectionBuilder {

  /**
   * @param {Actor} actor
   * @param {object} [options]
   * @param {boolean} [options.canHideGrants]   Whether the actor's hiddenGrants list applies (NPCs).
   */
  constructor(actor, { canHideGrants = false } = {}) {
    this.actor = actor;
    this.#hiddenKeys = new Set(canHideGrants ? actor.system.hiddenGrants : []);
  }

  /** The entries, per section. */
  sections = emptySections();

  /** The granted entries this actor has hidden, per section (always empty for player characters). */
  hidden = emptySections();

  /** Non-default Spell List names, shown on the Spells tab even when they have no spells. */
  namedSpellLists = [];

  #hiddenKeys;                     // hide keys in the actor's hiddenGrants
  #hiddenAbilityNames = new Map(); // lower-case name of a hidden ability -> its hide key
  #hiddenByKey = new Map();        // hide key -> its row in `hidden`
  #bySource = new Map();           // source uuid -> entry already shown
  #ignored = new Set();            // source uuids of unsupported types
  #abilityByName = new Map();      // lower-case ability name -> entry: an actor has each ability once
  #entryByUuid = new Map();        // Item uuid -> its entry, so a spell's actions can be listed under the spell
  #queue = [];                     // Items and effects still to look inside
  #actionRows = [];                // [entry, action or spell Item] pairs: their roll buttons are filled in at the end


  /**
   * @returns {Promise<{sections: Record<string, object[]>, hidden: Record<string, object[]>, namedSpellLists: string[]}>}
   */
  async build() {
    this.#hiddenAbilityNames = await hiddenAbilityNames(this.#hiddenKeys);
    this.#addOwnedItems();
    this.#queueEffectGrants();
    // Nested Items, breadth first.
    while (this.#queue.length) await this.#lookInside(this.#queue.shift());
    this.#markSpellOnly();
    this.#sortSections();
    this.#sortHidden();
    // Attack and damage buttons on every action row. Promise.all looks up all the actions' skills at once
    // instead of one after another.
    await Promise.all(this.#actionRows.map(([entry, action]) => addActionButtons(this.actor, entry, action)));
    return { sections: this.sections, hidden: this.hidden, namedSpellLists: this.namedSpellLists };
  }


  /** 1. The Items the actor owns. */
  #addOwnedItems() {
    for (const item of this.actor.items) {
      const section = sectionForType(item.type);
      if (!section) continue;
      // Gear and containers can be owned twice from the same source, so they use their own uuid.
      const source = STACKABLE_TYPES.includes(item.type) ? null : item._stats?.compendiumSource;
      const key = source ?? item.uuid;
      this.#addEntry(buildEntry(item, { section, owned: true, key }), item);
      this.#queue.push(item);
    }
  }


  /**
   * 1b. Active effects that grant actions. #lookInside reads their system.actionList (NESTED_FIELDS) the same way it
   * reads an Item's. Their type is "effect", so none of the gear / spell / ability special cases apply.
   */
  #queueEffectGrants() {
    for (const effect of this.actor.allApplicableEffects?.() ?? []) {
      if (isEffectActive(effect) && grantedActionUuids(effect).length) this.#queue.push(effect);
    }
  }


  /**
   * 2. Everything an Item (or effect) grants: each UUID in its NESTED_FIELDS.
   * @param {Item|ActiveEffect} parent
   */
  async #lookInside(parent) {
    // Every ability with a renamed Spell List gets a group on the Spells tab, spells or not.
    if (parent.type === "ability" && !hasDefaultSpellListName(parent)) {
      this.namedSpellLists.push(spellListName(parent));
    }

    for (const field of NESTED_FIELDS) {
      const raw = foundry.utils.getProperty(parent.system ?? {}, field.path);
      if (!Array.isArray(raw)) continue;
      const uuids = field.pick ? raw.map((row) => row?.[field.pick]) : raw;
      // Spells reached through an ability's Spell List remember that list's name, for grouping on the Spells tab.
      const listName = field.path === "spellList.spells" ? spellListName(parent) : "";

      for (const uuid of uuids) {
        if (!uuid || this.#ignored.has(uuid)) continue;
        await this.#addGranted(parent, field, uuid, listName);
      }
    }
  }


  /**
   * One UUID an Item (or effect) grants: added to the entry already listed for it, put in Hidden, or listed.
   * @param {Item|ActiveEffect} parent
   * @param {{path: string, section: string}} field   Where the UUID was (NESTED_FIELDS); `section` is used when it
   *                                                 doesn't lead to an Item any more.
   * @param {string} uuid
   * @param {string} listName   The Spell List it's in ("" if none).
   */
  async #addGranted(parent, { path, section: fallbackSection }, uuid, listName) {
    // Actions on gear are always listed again, even when the actor already has that action
    // (two revolvers = two "Shoot" actions). Each gear Item's copy gets its own key, so it doesn't merge
    // with other entries and keeps its own place when moved up / down.
    const gearAction = parent.type === "gear" && path === "actionList";
    const key = gearAction ? `${parent.uuid}#${uuid}` : uuid;
    // The hide key uses the gear's id rather than its uuid: an NPC's token copies share the ids,
    // but not the uuids, so a gear action hidden on the NPC stays hidden on its tokens.
    const hideKey = gearAction ? `${parent.id}#${uuid}` : uuid;

    const existing = this.#bySource.get(key);
    if (existing) {
      addGrantedBy(existing, parent.name);
      this.#noteGrant(parent, existing);
      // An owned spell that is also in a Spell List is shown in that list. A spell in two
      // differently-named lists stays in the first one found (each spell is shown once).
      if (listName && !existing.spellList) existing.spellList = listName;
      return;
    }

    // Hidden on this actor: list it under "Hidden", and don't look inside it.
    if (this.#hiddenKeys.has(hideKey)) {
      const found = await fromUuid(uuid).catch(() => null);
      const doc = found?.documentName === "Item" ? found : null;
      if (doc && !sectionForType(doc.type)) {
        this.#ignored.add(uuid);
        return;
      }
      this.#noteHidden(hideKey, doc, parent.name, fallbackSection);
      return;
    }

    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc || doc.documentName !== "Item") {
      const broken = brokenEntry({ key, hideKey, uuid, section: fallbackSection, grantedBy: parent.name, spellList: listName });
      this.#bySource.set(key, broken);
      this.sections[fallbackSection].push(broken);
      this.#noteGrant(parent, broken);
      return;
    }

    const section = sectionForType(doc.type);
    if (!section) {
      this.#ignored.add(uuid);
      return;
    }

    // An actor has each ability once. If one with this name is already listed (owned, or granted by
    // something else, even from a different source), this Item is added to its "Granted by" instead.
    if (doc.type === "ability") {
      const lowerName = doc.name.toLocaleLowerCase();
      const sameName = this.#abilityByName.get(lowerName);
      if (sameName) {
        addGrantedBy(sameName, parent.name);
        this.#bySource.set(uuid, sameName);
        return;
      }
      // An ability with the same name as a hidden one is hidden too (under the hidden one's key).
      if (this.#hiddenAbilityNames.has(lowerName)) {
        this.#noteHidden(this.#hiddenAbilityNames.get(lowerName), doc, parent.name, section);
        return;
      }
    }

    const entry = buildEntry(doc, { section, owned: false, key, grantedBy: [parent.name], spellList: listName });
    entry.hideKey = hideKey;
    // An action from a gun's own list fires / reloads that gun.
    if (gearAction) entry.gunId = parent.id;
    this.#addEntry(entry, doc);
    this.#noteGrant(parent, entry);
    // A gear action is a copy of one that may already be listed, so what's inside it was already handled.
    if (!gearAction) this.#queue.push(doc);
  }


  /**
   * List an entry in its section, and remember it.
   * @param {object} entry   From buildEntry.
   * @param {Item} doc       The Item it shows.
   */
  #addEntry(entry, doc) {
    this.sections[entry.section].push(entry);
    this.#bySource.set(entry.key, entry);
    this.#entryByUuid.set(doc.uuid, entry);
    if (entry.isRollable) this.#actionRows.push([entry, doc]);
    if (doc.type === "ability") this.#abilityByName.set(doc.name.toLocaleLowerCase(), entry);
  }


  /**
   * Remember where an action came from. An action from a spell is listed under that spell on the Spells tab; if
   * only spells grant it, it stays off the Actions tab unless it's a favorite (#markSpellOnly).
   * @param {Item|ActiveEffect} parent
   * @param {object} entry
   */
  #noteGrant(parent, entry) {
    if (entry.section !== "actions") return;
    if (parent.type !== "spell") {
      entry.fromOther = true;
      return;
    }
    entry.fromSpell = true;
    const spellEntry = this.#entryByUuid.get(parent.uuid);
    if (spellEntry && !spellEntry.spellActions.includes(entry)) spellEntry.spellActions.push(entry);
  }


  /**
   * Put a granted entry in the Hidden list for its section (once per hide key).
   * @param {string} hideKey
   * @param {Item|null} doc         The granted Item, or null when it no longer exists.
   * @param {string} parentName     The Item that grants it.
   * @param {string} fallbackSection
   */
  #noteHidden(hideKey, doc, parentName, fallbackSection) {
    const existing = this.#hiddenByKey.get(hideKey);
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
    this.#hiddenByKey.set(hideKey, row);
    this.hidden[(doc && sectionForType(doc.type)) || fallbackSection].push(row);
  }


  /**
   * Actions only spells grant (not owned, and not granted by anything else) stay on the Spells tab.
   * groupActions (groups.mjs) leaves them out of the Actions tab's type sections; they still show in Favorites.
   */
  #markSpellOnly() {
    for (const entry of this.sections.actions) {
      entry.spellOnly = !entry.owned && entry.fromSpell && !entry.fromOther;
    }
  }


  /**
   * Order each section: the saved manual order first (ORDER_FLAG), then anything not in it (new entries land at the
   * bottom) in the default order: owned before granted, then by Sequence number (lowest = strongest, so the current
   * Sequence leads) where there is one, then alphabetical. Also fills in each entry's "Granted by" text and move
   * buttons.
   */
  #sortSections() {
    const savedOrder = foundry.utils.getProperty(this.actor, ORDER_FLAG) ?? {};
    for (const [sectionKey, entries] of Object.entries(this.sections)) {
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
  }


  /** Hidden lists: alphabetical. */
  #sortHidden() {
    for (const rows of Object.values(this.hidden)) {
      rows.sort((a, b) => a.name.localeCompare(b.name));
      for (const row of rows) row.grantedByLabel = row.grantedBy.join(", ");
    }
  }
}


/**
 * The names of the hidden abilities, so another ability with the same name can be hidden too.
 * @param {Set<string>} hiddenKeys
 * @returns {Promise<Map<string, string>>}  lower-case ability name -> its hide key
 */
async function hiddenAbilityNames(hiddenKeys) {
  const names = new Map();
  await Promise.all([...hiddenKeys].map(async (hideKey) => {
    // Gear action keys are "<gear id>#<action uuid>"; everything else is just the uuid.
    const doc = await fromUuid(hideKey.split("#").pop()).catch(() => null);
    if (doc?.documentName === "Item" && doc.type === "ability") names.set(doc.name.toLocaleLowerCase(), hideKey);
  }));
  return names;
}
