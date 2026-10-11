/**
 * Player Character sheet.
 **/

import SkillCheckDialog from "../apps/skill-check-dialog.mjs";
import { calculateSkillModifier } from "../helpers/skill-modifiers.mjs";
import { addGrantedSkill, buildGrantedSkillTab, recordSkillAnalysis, updateGrantedSkill } from "../helpers/granted-skills.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;


export class PlayerCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {


  /** @override */
  static DEFAULT_OPTIONS = {

    tag: "form",
    classes: ["lotm", "sheet", "actor", "player-character"],
    actions: {
      shortRest: PlayerCharacterSheet._onShortRest,
      longRest: PlayerCharacterSheet._onLongRest,
      spendLuck: PlayerCharacterSheet._onSpendLuck,
      spendSpirituality: PlayerCharacterSheet._onSpendSpirituality,
      editImage: PlayerCharacterSheet._onEditImage,
      rollSkill: PlayerCharacterSheet._onRollSkill,
      editItem: PlayerCharacterSheet._onEditItem,
      deleteItem: PlayerCharacterSheet._onDeleteItem,
      addGrantedOption: PlayerCharacterSheet._onAddGrantedOption,
      addGrantedCustom: PlayerCharacterSheet._onAddGrantedCustom,
      addGrantedAnalysis: PlayerCharacterSheet._onAddGrantedAnalysis,
      removeGrantedSkill: PlayerCharacterSheet._onRemoveGrantedSkill,
      analyzeSkill: PlayerCharacterSheet._onAnalyzeSkill
    },
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
    }
  };

  /** @override */
  /** Pieces of the sheet that can be viewed and reloaded independently */
  static PARTS = {
    header:    { template: "systems/lotm/templates/actor/player-character/parts/header.hbs" },
    sidebar:   { template: "systems/lotm/templates/actor/player-character/parts/sidebar.hbs" },
    tabs:      { template: "systems/lotm/templates/actor/player-character/parts/tab-nav.hbs" },  // Doubles as the "Character Info" box header / page-selector shown in the mockup.
    character: { template: "systems/lotm/templates/actor/player-character/character.hbs", scrollable: [""] },
    actions:   { template: "systems/lotm/templates/actor/player-character/parts/actions.hbs", scrollable: [""] },
    inventory: { template: "systems/lotm/templates/actor/player-character/parts/inventory.hbs", scrollable: [""] },
    spells:    { template: "systems/lotm/templates/actor/player-character/parts/spells.hbs", scrollable: [""] },
    abilities: { template: "systems/lotm/templates/actor/player-character/parts/abilities.hbs", scrollable: [""] },
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

    return context;
  }


  /** @override */
  async _preparePartContext(partId, context) {
    context.partId = `${this.id}-${partId}`;

    switch (partId) {
      case "character":
        context.tab = context.tabs.character;
        context.attributesList = this._prepareAttributes();
        context.skillsByCategory = await this._prepareSkillList();
        context.skillLevelOptions = CONFIG.LORD_OF_THE_MYSTERIES.skillLevels;
        context.grantedSkillTabs = await this._prepareGrantedSkills();
        context.attributeOptions = CONFIG.LORD_OF_THE_MYSTERIES.attributes;
        context.attributeAbbreviations = CONFIG.LORD_OF_THE_MYSTERIES.attributeAbbreviations;
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

      skillsByCategory[category] = indexEntries
        .map(entry => {
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
            modifier: PlayerCharacterSheet._calculateSkillModifier(level, attributeTotal)
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
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

}
