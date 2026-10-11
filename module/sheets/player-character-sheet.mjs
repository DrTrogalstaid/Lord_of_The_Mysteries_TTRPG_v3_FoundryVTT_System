/**
 * Player Character sheet.
 **/

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

/** Item types that cannot be dropped on a character sheet at all. */
const UNSUPPORTED_TYPES = ["pathway"];

/**
 * Fields on an Item's system data that hold UUIDs of other Items. Anything found here is
 * resolved and shown in the tab matching the *resolved* Item's type (the `section` is only a
 * fallback for references that no longer resolve).
 */
const NESTED_FIELDS = [
  { path: "abilities_gained", section: "abilities" }, // Sequence -> Abilities
  { path: "trainingBonus",    section: "skills" },    // Sequence -> Knowledge / Training
  { path: "spellList.spells", section: "spells" },    // Ability  -> Spells
  { path: "actionList",       section: "actions" },   // Ability  -> Actions
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
    context.skillTabs = this._prepareTabs("skills");

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
    }

    return context;
  }


  /**
   * Flatten system.attributes into an array of {key, label, base, beyonder_bonus, corruption, total}
   * for easy iteration in the template.
   * @returns {object[]}
   */
  _prepareAttributes() {
    return Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.attributes).map(([key, label]) => {
      const attr = this.actor.system.attributes[key] ?? {};
      const base = attr.base ?? 0;
      const beyonder_bonus = attr.beyonder_bonus ?? 0;
      const corruption = attr.corruption ?? 0;
      const total = attr.total ?? 0;
      return {
        key,
        label,
        base,
        beyonder_bonus,
        corruption,
        total: total
      };
    });
  }


  /**
   * Build the full, per-category skill list from the skills_compendium pack's folder structure
   * @returns {Promise<Record<string, {uuid: string, name: string, img: string, level: string}[]>>}
   */
  async _prepareSkillList() {
    const pack = game.packs.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
    const skillsByCategory = {};


    if (!pack) {
      console.warn(`Lord of the Mysteries | Skills compendium "${CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId}" not found.`);
      return skillsByCategory;
    }

    await pack.getIndex(); // ensures the index - and therefore each Folder's .contents - is populated

    for (const [category, folderName] of Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders)) {
      const folder = pack.folders.getName(folderName);
      if (!folder) {
        console.warn(`Lord of the Mysteries | No "${folderName}" folder found in the skills compendium (category: ${category}).`);
      }
      const indexEntries = folder?.contents ?? [];

      // Preserve whatever level the actor already has recorded for a skill, matched by uuid.
      // Anything not yet touched simply defaults to "untrained" for display.
      const stored = this.actor.system.skills[category] ?? [];
      const levelByUuid = new Map(stored.map(entry => [entry.skill, entry.level]));

      skillsByCategory[category] = indexEntries
        .map(entry => {
          const level = levelByUuid.get(entry.uuid) ?? "untrained";
          const attributeTotal = this.actor.system.attributes[category]?.total ?? 0;
          return {
            uuid: entry.uuid,
            name: entry.name,
            img: entry.img,
            level,
            modifier: PlayerCharacterSheet._calculateSkillModifier(level, attributeTotal)
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return skillsByCategory;
  }


  static _calculateSkillModifier(skillLevel, attributeTotal)
  {

    var skillModifier = attributeTotal

    switch(skillLevel)
    {
      case "untrained":
        skillModifier -= 4;
        break;
      case "trained":
        skillModifier += 2;
        break;
      case "proficient":
        skillModifier += 4;
        break;
      case "advanced":
        skillModifier += 5;
        break;
      case "mastery":
        skillModifier += 6;
        break;
      case "lore":
        skillModifier += 7;
        break;
      case "grandMaster":
        skillModifier += 8;
        break;
    }
    return skillModifier;
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

      for (const { path, section: fallbackSection } of NESTED_FIELDS) {
        const uuids = foundry.utils.getProperty(parent.system ?? {}, path);
        if (!Array.isArray(uuids)) continue;

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
  /*  Rendering                                    */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Highlight the section under the cursor. Purely visual; the drop itself is handled in _onDropDocument.
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
    const alreadyOwned = this.actor.items.some((owned) => owned._stats?.compendiumSource === item.uuid);
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
   * Skills are not embedded: the Character tab lists the Skills compendium and the actor only stores
   * a level per skill UUID (system.skills[category] = [{ skill, level }]). Dropping a skill records it at "trained".
   * @param {Item} item
   * @returns {Promise<Item|null>}
   */
  async #dropSkill(item) {
    const config = CONFIG.LORD_OF_THE_MYSTERIES;

    if (item.pack !== config.skillsCompendiumId) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.SkillCompendiumOnly", { name: item.name }));
      return null;
    }

    const folders = config.skillCompendiumFolders ?? {};
    const category = [item.system.category, item.system.skill_attribute].find((key) => key && key in folders);
    if (!category) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.NoSkillCategory", { name: item.name }));
      return null;
    }

    const current = this.actor.toObject().system.skills?.[category] ?? [];
    if (current.some((entry) => entry.skill === item.uuid)) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.Duplicate", { name: item.name }));
      return null;
    }

    await this.actor.update({ [`system.skills.${category}`]: [...current, { skill: item.uuid, level: "trained" }] });
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
  static _onShortRest(event, target) {
    console.log(`${this.actor.name}: Short Rest triggered (not yet implemented)`);
    // TODO: call the Short Rest macro, e.g. game.macros.getName("Short Rest")?.execute({actor: this.actor});
  }


  static _onLongRest(event, target) {
    console.log(`${this.actor.name}: Long Rest triggered (not yet implemented)`);
    // TODO: call the Long Rest macro.
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
    const item = this.actor.items.get(target.dataset.itemId);
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
