/**
 * Player Character sheet.
 **/

import SkillCheckDialog from "../apps/skill-check-dialog.mjs";
import { calculateSkillModifier } from "../helpers/skill-modifiers.mjs";
import { addGrantedSkill, buildGrantedSkillTab, recordSkillAnalysis, updateGrantedSkill } from "../helpers/granted-skills.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Shared partial that renders one drop section (header, entry list, drop target). */
const DROP_SECTION_PARTIAL = "systems/lotm/templates/actor/player-character/parts/drop-section.hbs";

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

const DEFAULT_COMMON_LANGUAGE = "Loenese";
const DEFAULT_MYSTICAL_LANGUAGE = "Hermes";

/** Item types that cannot be dropped on a character sheet at all. */
const UNSUPPORTED_TYPES = ["pathway"];

/**
 * Fields on an Item's system data that hold UUIDs of other Items. Anything found here is
 * resolved and shown in the tab matching the *resolved* Item's type (the `section` is only a
 * fallback for references that no longer resolve).
 * `pick` is for arrays of objects rather than plain UUID strings: the UUID is read from that property.
 */
const NESTED_FIELDS = [
  { path: "abilities_gained", section: "abilities" },                       // Sequence -> Abilities
  { path: "skill_increase",   section: "skills", pick: "skill_uuid" },      // Sequence -> Skills it raises
  { path: "trainingBonus",    section: "skills" },                          // Sequence -> Knowledge / Training
  { path: "spellList.spells", section: "spells" },                          // Ability  -> Spells
  { path: "actionList",       section: "actions" },                         // Ability  -> Actions
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
function buildEntry(item, { section, owned, key, grantedBy = [] }) {
  const system = item.system ?? {};
  // Abilities and spells use camelCase fields; Actions use snake_case.
  const cost = system.spiritualityCost ?? system.spirituality_cost ?? null;
  const actionType = system.actionType || system.action_type || "";
  const actionTypeText = actionTypeLabel(actionType);
  return {
    key,
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
    hasStats: cost !== null || !!actionTypeText,
    // Sequences show "Sequence 9 · <pathway>" and sort by rank.
    rank: item.type === "sequence" ? (system.sequence_number ?? null) : null,
    detail: item.type === "sequence" ? sequenceDetail(system) : "",
    grantedBy: [...grantedBy],
    grantedByLabel: "",
  };
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
 * @param {PlayerCharacterSheet} sheet
 * @param {string} type
 */
async function createBlankItem(sheet, type) {
  const name = Item.implementation.defaultName({ type, parent: sheet.actor });
  const [created] = await sheet.actor.createEmbeddedDocuments("Item", [{ name, type }]);
  created?.sheet?.render({ force: true });
}


export class PlayerCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {


  /** @override */
  static DEFAULT_OPTIONS = {

    tag: "form",
    classes: ["lotm", "sheet", "actor", "player-character"],
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 850,
      height: 830
    },
    window: {
      resizable: true,
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.PlayerCharacter"
    },
    // No selector: the whole sheet is a drop target. _onDropDocument decides what happens
    // based on the [data-drop-zone] section the Item actually landed on.
    dragDrop: [{ dragSelector: null, dropSelector: null }],

    // NOTE: this used to be two separate `actions` keys, so the second silently replaced the first and
    // shortRest / longRest / spendLuck / spendSpirituality / editImage never got registered.
    actions: {
      shortRest: PlayerCharacterSheet._onShortRest,
      longRest: PlayerCharacterSheet._onLongRest,
      spendLuck: PlayerCharacterSheet._onSpendLuck,
      spendSpirituality: PlayerCharacterSheet._onSpendSpirituality,
      editImage: PlayerCharacterSheet._onEditImage,
      addDamageResistance: PlayerCharacterSheet._onAddDamageResistance,
      removeDamageResistance: PlayerCharacterSheet._onRemoveDamageResistance,
      addCommonLanguage: PlayerCharacterSheet._onAddCommonLanguage,
      removeCommonLanguage: PlayerCharacterSheet._onRemoveCommonLanguage,
      addMysticalLanguage: PlayerCharacterSheet._onAddMysticalLanguage,
      removeMysticalLanguage: PlayerCharacterSheet._onRemoveMysticalLanguage,

      rollSkill: PlayerCharacterSheet._onRollSkill,
      addGrantedOption: PlayerCharacterSheet._onAddGrantedOption,
      addGrantedCustom: PlayerCharacterSheet._onAddGrantedCustom,
      addGrantedAnalysis: PlayerCharacterSheet._onAddGrantedAnalysis,
      removeGrantedSkill: PlayerCharacterSheet._onRemoveGrantedSkill,
      analyzeSkill: PlayerCharacterSheet._onAnalyzeSkill,
      
      editItem: PlayerCharacterSheet._onEditItem,
      openItem: PlayerCharacterSheet.#onOpenItem,
      sendToChat: PlayerCharacterSheet.#onSendToChat,
      moveEntry: PlayerCharacterSheet.#onMoveEntry,

      addSkill: PlayerCharacterSheet.#onAddSkill,
      deleteSkill: PlayerCharacterSheet.#onDeleteSkill,
      addSequence: PlayerCharacterSheet.#onAddSequence,
      deleteSequence: PlayerCharacterSheet.#onDeleteItem,
      addAbility: PlayerCharacterSheet.#onAddAbility,
      deleteAbility: PlayerCharacterSheet.#onDeleteItem,
      addAction: PlayerCharacterSheet.#onAddAction,
      deleteAction: PlayerCharacterSheet.#onDeleteItem,
      addSpell: PlayerCharacterSheet.#onAddSpell,
      deleteSpell: PlayerCharacterSheet.#onDeleteItem,
      addItem: PlayerCharacterSheet.#onAddItem,
      deleteItem: PlayerCharacterSheet.#onDeleteItem,
    },
  };

  /** @override */
  /** Pieces of the sheet that can be viewed and reloaded independently */
  static PARTS = {
    header:    { template: "systems/lotm/templates/actor/player-character/parts/header.hbs" },
    sidebar:   { template: "systems/lotm/templates/actor/player-character/parts/sidebar.hbs" },
    tabs:      { template: "systems/lotm/templates/actor/player-character/parts/tab-nav.hbs" },  // Doubles as the "Character Info" box header / page-selector shown in the mockup.
    character: { template: "systems/lotm/templates/actor/player-character/character.hbs", templates: [DROP_SECTION_PARTIAL], scrollable: [""] },
    sequences: { template: "systems/lotm/templates/actor/player-character/parts/sequences.hbs", templates: [DROP_SECTION_PARTIAL], scrollable: [""] },
    actions:  { template: "systems/lotm/templates/actor/player-character/parts/actions.hbs", templates: [DROP_SECTION_PARTIAL], scrollable: [""] },
    inventory: { template: "systems/lotm/templates/actor/player-character/parts/inventory.hbs", templates: [DROP_SECTION_PARTIAL], scrollable: [""] },
    spells:    { template: "systems/lotm/templates/actor/player-character/parts/spells.hbs", templates: [DROP_SECTION_PARTIAL], scrollable: [""] },
    abilities: { template: "systems/lotm/templates/actor/player-character/parts/abilities.hbs", templates: [DROP_SECTION_PARTIAL], scrollable: [""] },
    effects: { template: "systems/lotm/templates/actor/player-character/parts/effects.hbs", scrollable: [""] },
    biography: { template: "systems/lotm/templates/actor/player-character/parts/biography.hbs", scrollable: [""] },
    backstory: { template: "systems/lotm/templates/actor/player-character/parts/backstory.hbs", scrollable: [""] }

  };

  /** @override */
  static TABS = {

    // The "Character Info" box's page selector (Character Info,Biography, etc.).
    sheet: {
      tabs: [
        { id: "character", label: "LORD_OF_THE_MYSTERIES.Tabs.Character" },
        { id: "sequences", label: "LORD_OF_THE_MYSTERIES.Tabs.Sequences" },
        { id: "actions", label: "LORD_OF_THE_MYSTERIES.Tabs.Actions" },
        { id: "inventory", label: "LORD_OF_THE_MYSTERIES.Tabs.Inventory" },
        { id: "spells", label: "LORD_OF_THE_MYSTERIES.Tabs.Spells" },
        { id: "abilities", label: "LORD_OF_THE_MYSTERIES.Tabs.Abilities" },
        { id: "effects", label: "LORD_OF_THE_MYSTERIES.Tabs.Effects" },
        { id: "biography", label: "LORD_OF_THE_MYSTERIES.Tabs.Biography" },
        { id: "backstory", label: "LORD_OF_THE_MYSTERIES.Tabs.Backstory"}
      ],
      initial: "character"
    },

    skills: {
      tabs: [
        { id: "str", label: "LORD_OF_THE_MYSTERIES.Attributes.Str.long" },
        { id: "agi", label: "LORD_OF_THE_MYSTERIES.Attributes.Agi.long" },
        { id: "cha", label: "LORD_OF_THE_MYSTERIES.Attributes.Cha.long" },
        { id: "ins", label: "LORD_OF_THE_MYSTERIES.Attributes.Ins.long" },
        { id: "edu", label: "LORD_OF_THE_MYSTERIES.Attributes.Edu.long" },
      ],
      initial: "str"
    }
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  /** Creates Basic Datamodel, which is used to fill the HTML together with Handlbars with Data */
  async _prepareContext(options) {

    const context = await super._prepareContext(options);

    context.actor = this.actor;
    context.system = this.actor.system;
    context.source = this.actor.toObject().system;
    context.editable = this.isEditable;

    // Two independent tab groups: the "Character Info","Biography", etc. page selector,
    // and the nested skills sub-tabs.
    context.tabs = this._prepareTabs("sheet");
    // If the active skill tab belonged to an ability that's since been removed, fall back.
    const skillTabIds = this._getTabsConfig("skills").tabs.map(tab => tab.id);
    if (!skillTabIds.includes(this.tabGroups.skills)) this.tabGroups.skills = PlayerCharacterSheet.TABS.skills.initial;
    context.skillTabs = this._prepareTabs("skills");

    // The ability (if any) that regular skills can be analyzed into -- see helpers/granted-skills.mjs.
    const analyzeAbility = this._grantingAbilities().find(item => item.system.analyzeSkills);
    context.analyzeAbility = analyzeAbility && { id: analyzeAbility.id, name: analyzeAbility.name };
    
    // Entries for every drop section: the Items the actor owns plus everything nested inside them.
    context.sections = await this.#prepareSections();

    return context;
  }


  /** @override */
  async _preparePartContext(partId, context) {
    context.partId = `${this.id}-${partId}`;

    // Every tab part needs its own tab state ({{tab.cssClass}}); only some did before.
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];

    switch (partId) {

      case "character":
        context.tab = context.tabs.character;
        context.attributesList = this._prepareAttributes();
        context.skillsByCategory = await this._prepareSkillList();
        context.skillLevelOptions = CONFIG.LORD_OF_THE_MYSTERIES.skillLevels;
        context.grantedSkillTabs = await this._prepareGrantedSkills();
        context.attributeOptions = CONFIG.LORD_OF_THE_MYSTERIES.attributes;
        context.attributeAbbreviations = CONFIG.LORD_OF_THE_MYSTERIES.attributeAbbreviations;
        context.languageCommonChoices = this._prepareCommonLanguages();
        context.languageMysticalChoices = this._prepareMysticalLanguages();
        break;

      case "abilities":
        context.tab = context.tabs.abilities;
        context.abilities = this.actor.items
          .filter(item => item.type === "ability")
          .sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
        break;

      case "biography":
        context.tab = context.tabs.biography;
        context.enrichedBackstory = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          this.actor.system.backstory,
          {
            secrets: this.actor.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor,
          }
        );
        context.enrichedPhysicalDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          this.actor.system.physicalDescription,
          {
            secrets: this.actor.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor,
          }
        );
        context.enrichedIdeasAndBeliefs = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          this.actor.system.ideasAndBeliefs,
          {
            secrets: this.actor.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor,
          }
        );
        break;
      case "sidebar":
        context.damageTypeChoices = this._prepareDamageTypes();
        break;
    }

    return context;
  }


  /**
   * Total attribute bonus granted by the actor's owned Sequence items, keyed by attribute key
   * ({ str: 2, agi: 1, ... }). Only owned Sequences count, not ones merely referenced by other Items.
   * @returns {Record<string, number>}
   */
  _sequenceAttributeBonuses() {
    const bonuses = {};
    for (const item of this.actor.items) {
      if (item.type !== "sequence") continue;
      for (const { attribute_name, value } of item.system.attribute_gain ?? []) {
        if (!attribute_name) continue;
        bonuses[attribute_name] = (bonuses[attribute_name] ?? 0) + (value ?? 0);
      }
    }
    return bonuses;
  }

  /**
   * Flatten system.attributes into an array of {key, label, base, beyonder_bonus, corruption, total}
   * for easy iteration in the template.
   * @returns {object[]}
   */
  _prepareAttributes() {
    return Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.attributes).map(([key, label]) => {
      const attr = this.actor.system.attributes[key];
      return {
        key, label,
        base: attr.base,
        beyonder_bonus: attr.beyonder_bonus,
        corruption: attr.corruption,
        sequence_bonus: attr.sequence_bonus,   // derived, display only
        total: attr.total                       // derived
      };
    });
  }


  /**
   * Build the full, per-category skill list from the skills_compendium pack's folder structure
   * @returns {Promise<Record<string, {uuid: string, name: string, img: string, level: string, attribute: string, flatModifier: number, modifier: number}[]>>}
   */
  async _prepareSkillList() {
    const pack = game.packs.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
    const skillsByCategory = {};


    if (!pack) {
      console.warn(`Lord of the Mysteries | Skills compendium "${CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId}" not found.`);
      return skillsByCategory;
    }

    // Request the two extra system fields the roll dialog needs (the skill's
    // own linked attribute and its flat item modifier) so opening the dialog
    // doesn't need a separate fromUuid() round trip per skill.
    await pack.getIndex({ fields: ["system.skill_attribute", "system.modifier"] });

    for (const [category, folderName] of Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders)) {
      const folder = pack.folders.getName(folderName);
      if (!folder) {
        console.warn(`Lord of the Mysteries | No "${folderName}" folder found in the skills compendium (category: ${category}).`);
      }
      const indexEntries = folder?.contents ?? [];

      // Preserve whatever level the actor already has recorded for a skill, matched by uuid.
      // Anything not yet touched simply defaults to "untrained" for display.
      const stored = this.actor.system.skills[category] ?? [];
      const storedByUuid = new Map(stored.map(entry => [entry.skill, entry]));

      // One row per skill. `entry` is a compendium index entry or, for skills outside the compendium, the
      // resolved Item: both carry uuid / name / img / system.{skill_attribute, modifier}.
      const toRow = (entry, removable) => {
        const level = storedByUuid.get(entry.uuid)?.level ?? "untrained";
        // NOTE: the sheet's displayed number still uses the tab/category attribute,
        // same as before this change -- unchanged to avoid shifting every skill's
        // displayed modifier as a side effect of this PR. The roll dialog instead
        // defaults to the skill item's own `skill_attribute` field below, which is
        // the actual rules-relevant "linked attribute" and may differ from the
        // compendium folder/tab a skill happens to be filed under. Worth reconciling
        // in a follow-up once you've decided which should really drive the display.
        // Buckets that aren't attributes themselves (e.g. "knowledge") fall back to
        // the skill item's own linked attribute -- Education, for every Knowledge.
        const attributeKey = category in CONFIG.LORD_OF_THE_MYSTERIES.attributes
          ? category
          : (entry.system?.skill_attribute ?? category);
        const attributeTotal = this.actor.system.attributes[attributeKey]?.total ?? 0;
        return {
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img,
          level,
          analysis: storedByUuid.get(entry.uuid)?.analysis ?? 0,
          category,
          attribute: entry.system?.skill_attribute ?? category,
          flatModifier: entry.system?.modifier ?? 0,
          modifier: PlayerCharacterSheet._calculateSkillModifier(level, attributeTotal),
          removable
        };
      };

      const rows = indexEntries.map(entry => toRow(entry, false));

      // Skills the actor has recorded that aren't in the compendium folder (dropped from the world, another
      // compendium, ...). They must be listed: the Character tab submits this whole list back as
      // system.skills[category], so anything left out here would be deleted on the next field change.
      // Entries that no longer resolve (deleted skills) are left out and so drop away on that same submit.
      const listed = new Set(indexEntries.map(entry => entry.uuid));
      for (const { skill: uuid } of stored) {
        if (!uuid || listed.has(uuid)) continue;
        listed.add(uuid);
        const doc = await fromUuid(uuid).catch(() => null);
        if (doc) rows.push(toRow({ uuid, name: doc.name, img: doc.img, system: doc.system }, true));
      }

      skillsByCategory[category] = rows.sort((a, b) => a.name.localeCompare(b.name));
    }

    return skillsByCategory;
  }

  
  /**
   * The actor's abilities that grant skills, in sheet order. Each gets its own skill tab.
   * @returns {Item[]}
   */
  _grantingAbilities() {
    return this.actor.items
      .filter(item => item.type === "ability" && item.system.grantsSkills)
      .sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
  }

  /**
   * Adds a skill tab per skill-granting ability (e.g. Extraordinary Knowledge) after the
   * attribute tabs; _prepareTabs then handles their active state like any other tab.
   * @override
   */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (group !== "skills" || !config) return config;
    const abilityTabs = this._grantingAbilities().map(item => ({
      id: `ability-${item.id}`,
      label: item.name,
      abilityId: item.id
    }));
    return { ...config, tabs: [...config.tabs, ...abilityTabs] };
  }


  /**
   * Contents of each skill-granting ability's tab, keyed by tab id -- see
   * helpers/granted-skills.mjs.
   * @returns {Promise<Record<string, object>>}
   */
  async _prepareGrantedSkills() {
    const attributeTotals = Object.fromEntries(
      Object.entries(this.actor.system.attributes).map(([key, attr]) => [key, attr.total ?? 0])
    );
    const entries = await Promise.all(this._grantingAbilities().map(async item => {
      const options = (await Promise.all(
        item.system.skillOptions.map(async uuid => {
          const skill = await fromUuid(uuid).catch(() => null);
          return skill && { uuid, name: skill.name, attribute: skill.system.skill_attribute };
        })
      )).filter(Boolean);
      const tab = buildGrantedSkillTab(
        { id: item.id, name: item.name, grantedSkills: item.system.grantedSkills, options },
        attributeTotals
      );
      return [`ability-${item.id}`, tab];
    }));
    return Object.fromEntries(entries);
  }


  // Kept as a thin wrapper (rather than removed) so nothing calling
  // PlayerCharacterSheet._calculateSkillModifier(...) elsewhere breaks; the
  // real implementation now lives in helpers/skill-modifiers.mjs so
  // SkillCheckDialog can use it too without importing this class.
  static _calculateSkillModifier(skillLevel, attributeTotal) {
    return calculateSkillModifier(skillLevel, attributeTotal);
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Granted-skill level/analysis inputs belong to an ability item, not the actor,
    // so they have no `name` (the actor form skips them) and save here instead.
    this.element.querySelectorAll(".granted-skill-row [data-granted-field]").forEach(input => {
      input.addEventListener("change", async ev => {
        const { ability, grantedId } = this._grantedSkillTarget(ev.currentTarget);
        if (!ability) return;
        const field = ev.currentTarget.dataset.grantedField;
        const value = field === "analysis" ? Math.max(0, Math.floor(Number(ev.currentTarget.value) || 0)) : ev.currentTarget.value;
        await ability.update({
          "system.grantedSkills": updateGrantedSkill(ability.system.grantedSkills, grantedId, { [field]: value })
        });
      });
    });

    // Enter in the custom-skill box adds it instead of submitting the sheet.
    this.element.querySelectorAll(".granted-skill-custom").forEach(input => {
      input.addEventListener("keydown", ev => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        PlayerCharacterSheet._onAddGrantedCustom.call(this, ev, ev.currentTarget);
      });
    });

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
   * @returns {Promise<Record<string, object[]>>}
   */
  async #prepareSections() {
    const sections = Object.fromEntries(Object.keys(DROP_SECTIONS).map((key) => [key, []]));
    const bySource = new Map();     // source uuid -> entry already shown
    const ignored = new Set();      // source uuids of unsupported types
    const queue = [];

    // 1. Owned Items
    for (const item of this.actor.items) {
      const section = sectionForType(item.type);
      if (!section) continue;
      const key = item._stats?.compendiumSource ?? item.uuid;
      const entry = buildEntry(item, { section, owned: true, key });
      sections[section].push(entry);
      bySource.set(key, entry);
      queue.push(item);
    }

    // 2. Nested Items, breadth first
    while (queue.length) {
      const parent = queue.shift();

      for (const { path, section: fallbackSection, pick } of NESTED_FIELDS) {
        const raw = foundry.utils.getProperty(parent.system ?? {}, path);
        if (!Array.isArray(raw)) continue;
        const uuids = pick ? raw.map((row) => row?.[pick]) : raw;

        for (const uuid of uuids) {
          if (!uuid || ignored.has(uuid)) continue;

          const existing = bySource.get(uuid);
          if (existing) {
            if (existing.name !== parent.name && !existing.grantedBy.includes(parent.name)) {
              existing.grantedBy.push(parent.name);
            }
            continue;
          }

          const doc = await fromUuid(uuid).catch(() => null);

          if (!doc || doc.documentName !== "Item") {
            const broken = {
              key: uuid, uuid, id: null, name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing"),
              img: "icons/svg/hazard.svg", type: "", section: fallbackSection,
              owned: false, nested: true, broken: true, cost: null, hasCost: false,
              actionType: "", actionTypeLabel: "", hasStats: false, rank: null, detail: "",
              grantedBy: [parent.name], grantedByLabel: "",
            };
            bySource.set(uuid, broken);
            sections[fallbackSection].push(broken);
            continue;
          }

          const section = sectionForType(doc.type);
          if (!section) {
            ignored.add(uuid);
            continue;
          }

          const entry = buildEntry(doc, { section, owned: false, key: uuid, grantedBy: [parent.name] });
          bySource.set(uuid, entry);
          sections[section].push(entry);
          queue.push(doc);
        }
      }
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

    return sections;
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

    // Already on this actor: leave it to Foundry (re-sorting).
    if (document.parent === this.actor) return super._onDropDocument(event, document);

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
    return this.#dropEmbedded(document);
  }

  
  /**
   * Copy an Item onto the actor as an embedded Item. The source UUID is kept in
   * _stats.compendiumSource so duplicates are caught and nested references to the same
   * Item are recognised as the one the actor already owns.
   * @param {Item} item
   * @returns {Promise<Item|null>}
   */
  async #dropEmbedded(item) {
    // Same Item already owned (by source), or, for abilities, one with the same name: _onDropItem below holds the
    // same rule, but drops from outside the actor are handled here and never reach it.
    const alreadyOwned = this.actor.items.some((owned) =>
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

    const [created] = await this.actor.createEmbeddedDocuments("Item", [data]);
    return created ?? null;
  }

  /**
   * Skills are not embedded: the actor only stores a level per skill UUID
   * (system.skills[category] = [{ skill, level }]) and the Character tab lists them under their attribute.
   * Any skill Item can be dropped, from a compendium or the world. Dropping records it at "trained"; a skill
   * the actor already lists as "untrained" (every compendium skill is, once a field has been edited) is raised
   * to "trained" instead of being rejected as a duplicate.
   * @param {Item} item
   * @returns {Promise<Item|null>}
   */
  async #dropSkill(item) {
    const folders = CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders ?? {};
    const category = [item.system.category, item.system.skill_attribute].find((key) => key && key in folders);
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

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /**
   * @this {PlayerCharacterSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onShortRest(event, target) {

    // Sleepless gain full Spirituality on short rests
    const isSleepless = this.actor.items.some(
      i => i.type === "sequence" && (i.name === "Sleepless" || i.system.name === "Sleepless")
    );

    var spiritualityGain = 0;
    if (isSleepless == true) {
      spiritualityGain = this.actor.system.resources.spp.max;
    } 
    else {
      spiritualityGain = Math.floor(this.actor.system.resources.spp.max / 8);
    }

    await this.actor.update({
      "system.resources.spp.value": Math.min(this.actor.system.resources.spp.value + spiritualityGain, this.actor.system.resources.spp.max)
    });
  }


  static async _onLongRest(event, target) {
    const res = this.actor.system.resources;

    await this.actor.update({
      // Spirituality Restoration
      "system.resources.spp.value": res.spp.max,
      // Rationality +1
      "system.resources.rp.value": Math.min(this.actor.system.resources.rp.value + 1, this.actor.system.resources.rp.max)
    });
  }


  static _onSpendLuck(event, target) {
    console.log(`${this.actor.name}: Spend Luck triggered (not yet implemented)`);
    // TODO: call the Spend Luck macro.
  }


  static _onSpendSpirituality(event, target) {
    console.log(`${this.actor.name}: Spend Spirituality triggered (not yet implemented)`);
    // TODO: call the Spend Spirituality macro.
  }


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
    const types = foundry.utils.getProperty(game.i18n.translations, "LORD_OF_THE_MYSTERIES.Damage_Types") ?? {};
    
    return Object.fromEntries(
      Object.keys(types).map(key => [key, game.i18n.localize(`LORD_OF_THE_MYSTERIES.Damage_Types.${key}`)])
    );
  }


  /**
   * Add Damage Resistance
   */
  static async _onAddDamageResistance(event, target) {
    if (!this.isEditable) return;
    
    const current = this.actor.toObject().system.damage_resistance ?? [];
    
    await this.actor.update({
      "system.damage_resistance": [...current, { damage_type: DEFAULT_DAMAGE_TYPE, value: DEFAULT_DAMAGE_RESISTANCE }]
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
   * Languages (Common) dropdown
   * @returns {Record<string, string>}
   */
  _prepareCommonLanguages() {
    const types = foundry.utils.getProperty(game.i18n.translations, "LORD_OF_THE_MYSTERIES.Languages.Common") ?? {};
    
    return Object.fromEntries(
      Object.keys(types).map(key => [key, game.i18n.localize(`LORD_OF_THE_MYSTERIES.Languages.Common.${key}`)])
    );
  }


  /**
   * Languages (Mystical) dropdown
   * @returns {Record<string, string>}
   */
  _prepareMysticalLanguages() {
    const types = foundry.utils.getProperty(game.i18n.translations, "LORD_OF_THE_MYSTERIES.Languages.Mystical") ?? {};
    
    return Object.fromEntries(
      Object.keys(types).map(key => [key, game.i18n.localize(`LORD_OF_THE_MYSTERIES.Languages.Mystical.${key}`)])
    );
  }


  /**
   * Add Language (Common)
   */
  static async _onAddCommonLanguage(event, target) {
    if (!this.isEditable) return;
    
    const current = this.actor.toObject().system.languages.common ?? [];
    
    await this.actor.update({
      "system.languages.common": [...current, DEFAULT_COMMON_LANGUAGE]
    });
  }


  /**
   * Add Language (Mystical)
   */
  static async _onAddMysticalLanguage(event, target) {
    if (!this.isEditable) return;
    
    const current = this.actor.toObject().system.languages.mystical ?? [];
    
    await this.actor.update({
      "system.languages.mystical": [...current, DEFAULT_MYSTICAL_LANGUAGE]
    });
  }


  /**
   * Remove Language (Common)
   */
  static async _onRemoveCommonLanguage(event, target) {
    if (!this.isEditable) return;
    
    const index = Number(target.dataset.index);
    const current = this.actor.toObject().system.languages.common ?? [];
    
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return;
    
    await this.actor.update({ "system.languages.common": current.filter((_, i) => i !== index) });
  }


    /**
   * Remove Language (Mystical)
   */
  static async _onRemoveMysticalLanguage(event, target) {
    if (!this.isEditable) return;
    
    const index = Number(target.dataset.index);
    const current = this.actor.toObject().system.languages.mystical ?? [];
    
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return;
    
    await this.actor.update({ "system.languages.mystical": current.filter((_, i) => i !== index) });
  }

  /**
   * Open SkillCheckDialog for the clicked skill. All the data the dialog
   * needs (uuid/name/level/category/attribute) travels in via data-*
   * attributes on the skill row, set from _prepareSkillList()'s entry -
   * see templates/actor/player-character/character.hbs.
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
    });
  }


  /**
   * The ability item and granted-skill id behind a clicked granted-skill control.
   * @returns {{ability: Item|undefined, grantedId: string|undefined}}
   */
  _grantedSkillTarget(target) {
    return {
      ability: this.actor.items.get(target.closest("[data-ability-id]")?.dataset.abilityId),
      grantedId: target.closest("[data-granted-id]")?.dataset.grantedId
    };
  }


  /** Save a new granted-skills list on the ability, warning on duplicates. */
  async _saveGrantedSkill(ability, skill) {
    const list = addGrantedSkill(ability.system.grantedSkills, skill, foundry.utils.randomID());
    if (!list) {
      if (skill.name?.trim()) {
        ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.GrantedSkills.Duplicate",
          { ability: ability.name, skill: skill.name.trim() }));
      }
      return;
    }
    await ability.update({ "system.grantedSkills": list });
  }


  /** Add the skill picked in a granted-skills section's dropdown. */
  static async _onAddGrantedOption(event, target) {
    const { ability } = this._grantedSkillTarget(target);
    const select = target.closest("[data-ability-id]")?.querySelector(".granted-skill-option");
    if (!ability || !select?.value) return;
    const option = select.selectedOptions[0];
    await this._saveGrantedSkill(ability, {
      uuid: select.value,
      name: option.dataset.name,
      attribute: option.dataset.attribute
    });
  }


  /** Add a custom-named skill, linked to the attribute picked next to the name box. */
  static async _onAddGrantedCustom(event, target) {
    const { ability } = this._grantedSkillTarget(target);
    const section = target.closest("[data-ability-id]");
    const input = section?.querySelector(".granted-skill-custom");
    const attribute = section?.querySelector(".granted-skill-attribute")?.value || "edu";
    if (!ability || !input) return;
    await this._saveGrantedSkill(ability, { name: input.value, attribute });
  }


  /**
   * Analyze a regular skill (Extraordinary Knowledge). Education skills count it on
   * the skill itself, since they can be trained up directly. Any other skill gets an
   * Education copy on the analyze-skills ability the first time, and after that the
   * copy's count goes up.
   */
  static async _onAnalyzeSkill(event, target) {
    const { ability } = this._grantedSkillTarget(target);
    const row = target.closest("[data-skill-uuid]");
    if (!ability || !row) return;

    const { category, skillUuid } = row.dataset;
    if (category === "edu") {
      const entries = this.actor.toObject().system.skills[category] ?? [];
      const entry = entries.find(e => e.skill === skillUuid);
      if (entry) entry.analysis = (entry.analysis ?? 0) + 1;
      else entries.push({ skill: skillUuid, level: "untrained", analysis: 1 });
      await this.actor.update({ [`system.skills.${category}`]: entries });
      return;
    }
    await ability.update({
      "system.grantedSkills": recordSkillAnalysis(
        ability.system.grantedSkills,
        { uuid: row.dataset.skillUuid, name: row.dataset.skillName },
        foundry.utils.randomID()
      )
    });
  }


  /**
   * Add one analysis to a granted skill's counter. The GM decides when the
   * count earns a new level.
   */
  static async _onAddGrantedAnalysis(event, target) {
    const { ability, grantedId } = this._grantedSkillTarget(target);
    const entry = ability?.system.grantedSkills.find(s => s.id === grantedId);
    if (!entry) return;
    await ability.update({
      "system.grantedSkills": updateGrantedSkill(ability.system.grantedSkills, grantedId, { analysis: entry.analysis + 1 })
    });
  }


  /** Remove a granted skill (and its progress) from the ability, after confirming. */
  static async _onRemoveGrantedSkill(event, target) {
    const { ability, grantedId } = this._grantedSkillTarget(target);
    const entry = ability?.system.grantedSkills.find(s => s.id === grantedId);
    if (!entry) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "LORD_OF_THE_MYSTERIES.GrantedSkills.Remove" },
      content: `<p>${game.i18n.format("LORD_OF_THE_MYSTERIES.GrantedSkills.RemoveConfirm",
        { skill: entry.name, ability: ability.name })}</p>`
    });
    if (!confirmed) return;
    await ability.update({ "system.grantedSkills": ability.system.grantedSkills.filter(s => s.id !== grantedId) });
  }


  /**
   * Open an owned item's sheet (the Abilities tab's edit control).
   */
  static _onEditItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    item?.sheet.render(true);
  }


  /**
   * Remove an owned item from the actor (the Abilities tab's delete control).
   */
  static async _onDeleteItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    await item?.deleteDialog();
  }


  /* -------------------------------------------- */
  /*  Drag & Drop                                  */
  /* -------------------------------------------- */

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

    const keys = [...zone.querySelectorAll(".drop-section-list > .drop-entry")].map((li) => li.dataset.key);
    const from = keys.indexOf(target.dataset.key);
    const to = from + (target.dataset.direction === "up" ? -1 : 1);
    if (from < 0 || to < 0 || to >= keys.length) return;

    [keys[from], keys[to]] = [keys[to], keys[from]];
    await this.actor.update({ [`${ORDER_FLAG}.${section}`]: keys });
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

  // Skills and inventory Items come from compendiums / the sidebar, so those buttons just point at drag and drop.
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

  static async #onAddItem(event, target) {
    ui.notifications.info(game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.DragHintInventory"));
  }


  /**
   * Remove a skill the actor has recorded. Expects data-uuid (skill) and data-category on the button.
   */
  static async #onDeleteSkill(event, target) {
    const { uuid, category } = target.dataset;
    if (!uuid || !category) return;
    const current = this.actor.toObject().system.skills?.[category] ?? [];
    await this.actor.update({ [`system.skills.${category}`]: current.filter((entry) => entry.skill !== uuid) });
  }


  /**
   * Remove an embedded Item (shared by deleteSequence / deleteAbility / deleteAction / deleteSpell /
   * deleteItem). Hold Shift to skip the confirmation. Only owned entries get a delete button;
   * granted ones are removed from the Item that grants them.
   */
  static async #onDeleteItem(event, target) {
    // The id sits on the button in the drop sections, and on the row around it in the Abilities tab's own list.
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
