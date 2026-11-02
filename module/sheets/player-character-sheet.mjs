/**
 * Player Character sheet.
 *
 * Built on LordOfTheMysteriesActorSheetBase (base-actor-sheet.mjs), which has everything the player and NPC
 * sheets share: the drop sections, drag and drop, action rows, rolls, moving / deleting entries.
 * This file only has what's special to player characters: the full skill list from the Skills compendium
 * (with study, learning by doing and granted-skill tabs), languages, rests, money and the biography pages.
 **/

import { LordOfTheMysteriesActorSheetBase, SHARED_PARTIALS } from "./base-actor-sheet.mjs";
import { calculateSkillModifier } from "../helpers/skill-modifiers.mjs";
import { atLeastLevel, computeAssociatedLevels, raiseLevel, skillCategoriesOf } from "../helpers/skill-associations.mjs";
import { abilityTeaches, canTeachTo, nextLevel, studyProgressFor, successesFor, successesNeeded } from "../helpers/skill-learning.mjs";
import { meterPercent, openStudyDialog, openSuccessDialog } from "../apps/study-dialog.mjs";
import { addGrantedSkill, buildGrantedSkillTab, recordSkillAnalysis, updateGrantedSkill } from "../helpers/granted-skills.mjs";
import { autoPlacement, buildInventoryView } from "../helpers/inventory.mjs";
import { buildMoneyView, openMoneyDialog } from "../helpers/currency.mjs";

/** One row of the Character tab's Granted Skills box (skills a Sequence raises or trains), with the skill controls. */
const GRANTED_SKILL_ENTRY_PARTIAL = "systems/lotm/templates/actor/player-character/parts/granted-skill-entry.hbs";

/**
 * Key in _prepareSkillList's result for skills a Sequence gives that aren't on any tab (see there).
 * It isn't a tab id, so the tabs never list these rows.
 */
const GRANTED_ONLY = "grantedOnly";

const DEFAULT_COMMON_LANGUAGE = "Loenese";
const DEFAULT_MYSTICAL_LANGUAGE = "Hermes";


export class PlayerCharacterSheet extends LordOfTheMysteriesActorSheetBase {

  /**
   * @override
   * Only what's new for this sheet. Foundry adds these to the base sheet's options
   * (its actions, classes, form and drag-and-drop settings), see base-actor-sheet.mjs.
   */
  static DEFAULT_OPTIONS = {
    classes: ["player-character"],
    position: {
      width: 850,
      height: 830
    },
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.PlayerCharacter"
    },

    actions: {
      shortRest: PlayerCharacterSheet._onShortRest,
      longRest: PlayerCharacterSheet._onLongRest,
      spendLuck: PlayerCharacterSheet._onSpendLuck,
      addCommonLanguage: PlayerCharacterSheet._onAddCommonLanguage,
      removeCommonLanguage: PlayerCharacterSheet._onRemoveCommonLanguage,
      addMysticalLanguage: PlayerCharacterSheet._onAddMysticalLanguage,
      removeMysticalLanguage: PlayerCharacterSheet._onRemoveMysticalLanguage,

      studySkill: PlayerCharacterSheet.#onStudySkill,
      recordSkillSuccess: PlayerCharacterSheet.#onRecordSkillSuccess,
      addGrantedOption: PlayerCharacterSheet._onAddGrantedOption,
      addGrantedCustom: PlayerCharacterSheet._onAddGrantedCustom,
      addGrantedAnalysis: PlayerCharacterSheet._onAddGrantedAnalysis,
      removeGrantedSkill: PlayerCharacterSheet._onRemoveGrantedSkill,
      analyzeSkill: PlayerCharacterSheet._onAnalyzeSkill,

      addItem: PlayerCharacterSheet.#onAddItem,
      moneyTransaction: PlayerCharacterSheet.#onMoneyTransaction,
    },
  };

  /** @override */
  /** Pieces of the sheet that can be viewed and reloaded independently */
  static PARTS = {
    header:    { template: "systems/lotm/templates/actor/player-character/parts/header.hbs" },
    sidebar:   { template: "systems/lotm/templates/actor/player-character/parts/sidebar.hbs" },
    tabs:      { template: "systems/lotm/templates/actor/player-character/parts/tab-nav.hbs" },  // Doubles as the "Character Info" box header / page-selector shown in the mockup.
    character: { template: "systems/lotm/templates/actor/player-character/character.hbs", templates: [...SHARED_PARTIALS, GRANTED_SKILL_ENTRY_PARTIAL], scrollable: [""] },
    sequences: { template: "systems/lotm/templates/actor/player-character/parts/sequences.hbs", templates: SHARED_PARTIALS, scrollable: [""] },
    actions:  { template: "systems/lotm/templates/actor/player-character/parts/actions.hbs", templates: SHARED_PARTIALS, scrollable: [""] },
    inventory: { template: "systems/lotm/templates/actor/player-character/parts/inventory.hbs", templates: SHARED_PARTIALS, scrollable: [""] },
    spells:    { template: "systems/lotm/templates/actor/player-character/parts/spells.hbs", templates: SHARED_PARTIALS, scrollable: [""] },
    abilities: { template: "systems/lotm/templates/actor/player-character/parts/abilities.hbs", templates: SHARED_PARTIALS, scrollable: [""] },
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

  /**
   * @override
   * The base sheet fills in the actor, the page tabs and every drop section (context.sections).
   * This adds the nested skills sub-tabs.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // If the active skill tab belonged to an ability that's since been removed, fall back.
    const skillTabIds = this._getTabsConfig("skills").tabs.map(tab => tab.id);
    if (!skillTabIds.includes(this.tabGroups.skills)) this.tabGroups.skills = PlayerCharacterSheet.TABS.skills.initial;
    context.skillTabs = this._prepareTabs("skills");

    // The header's Sequence Title: the character's lowest-numbered Sequence (base-actor-sheet.mjs). null = none yet.
    context.currentSequence = this._currentSequence();

    // The ability (if any) that regular skills can be analyzed into -- see helpers/granted-skills.mjs.
    const analyzeAbility = this._grantingAbilities().find(item => item.system.analyzeSkills);
    context.analyzeAbility = analyzeAbility && { id: analyzeAbility.id, name: analyzeAbility.name };

    return context;
  }


  /**
   * @override
   * The base sheet handles the Actions, Spells and sidebar parts; these are the player-only ones.
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);

    switch (partId) {

      case "character": {
        context.tab = context.tabs.character;
        context.attributesList = this._prepareAttributes();
        // The abilities (owned or granted) are passed in so skills taught by one get a ✋ success button.
        // The Granted Skills box's skills are passed in so the ones that aren't on any tab get a row too.
        const grantedSkills = context.sections?.skills ?? [];
        context.skillsByCategory = await this._prepareSkillList(
          context.sections?.abilities ?? [],
          grantedSkills.filter((entry) => !entry.broken).map((entry) => entry.uuid)
        );
        // Each Granted Skills row gets its skill's row, for the roll, level and study controls (granted-skill-entry.hbs).
        const rowByUuid = new Map(Object.values(context.skillsByCategory).flat().map((row) => [row.uuid, row]));
        for (const entry of grantedSkills) entry.skill = entry.broken ? null : (rowByUuid.get(entry.uuid) ?? null);
        context.skillLevelOptions = CONFIG.LORD_OF_THE_MYSTERIES.skillLevels;
        context.grantedSkillTabs = await this._prepareGrantedSkills();
        context.attributeOptions = CONFIG.LORD_OF_THE_MYSTERIES.attributes;
        context.attributeAbbreviations = CONFIG.LORD_OF_THE_MYSTERIES.attributeAbbreviations;
        context.languageCommonChoices = this._prepareCommonLanguages();
        context.languageMysticalChoices = this._prepareMysticalLanguages();
        break;
      }

      case "inventory":
        // One group per coat / bag, plus "Held & worn" (see helpers/inventory.mjs)
        context.inventory = buildInventoryView(context.sections.inventory, this.actor);
        // Cash in purses, deposits, and total worth (see helpers/currency.mjs)
        context.money = buildMoneyView(this.actor);
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
        // Education growth (base-actor.mjs): only Education has it. The hover text explains the count.
        isEducation: key === "edu",
        growth_bonus: attr.growth_bonus ?? 0,
        growthTooltip: key === "edu" ? this.#educationGrowthTooltip() : "",
        total: attr.total                       // derived
      };
    });
  }


  /**
   * Hover text for the Education box's growth number, one part per tier, e.g.
   *   "Education growth: +1 · Mastery: 7 skill(s), +1 (next +1 at 10) · Lore: ..."
   * @returns {string}
   */
  #educationGrowthTooltip() {
    const growth = this.actor.system.educationGrowth;
    if (!growth) return "";
    const format = (key, data) => game.i18n.format(`LORD_OF_THE_MYSTERIES.EducationGrowth.${key}`, data);
    const lines = [format("Total", { bonus: growth.bonus })];
    for (const tier of growth.tiers) {
      lines.push(format("Tier", {
        level: game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[tier.level] ?? tier.level),
        count: tier.count,
        bonus: tier.bonus,
        next: (tier.bonus + 1) * tier.per,
      }));
    }
    lines.push(game.i18n.localize("LORD_OF_THE_MYSTERIES.EducationGrowth.Hint"));
    // Plain text, not HTML, so it shows the same in every Foundry version's tooltips.
    return lines.join(" · ");
  }


  /**
   * Build the full, per-category skill list from the skills_compendium pack's folder structure.
   * @param {object[]} [abilityEntries]  The Abilities section's entries, for the learning-by-doing buttons.
   * @param {string[]} [grantedUuids]    The Granted Skills box's skills. Any that aren't on a tab get a row under
   *                                     GRANTED_ONLY, so that box can show their controls too.
   * @returns {Promise<Record<string, {uuid: string, name: string, img: string, level: string, attribute: string, flatModifier: number, modifier: number}[]>>}
   */
  async _prepareSkillList(abilityEntries = [], grantedUuids = []) {
    const pack = game.packs.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
    const skillsByCategory = {};


    if (!pack) {
      console.warn(`Lord of the Mysteries | Skills compendium "${CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId}" not found.`);
      return skillsByCategory;
    }

    // Request the two extra system fields the roll dialog needs (the skill's
    // own linked attribute and its flat item modifier) so opening the dialog
    // doesn't need a separate fromUuid() round trip per skill.
    // system.categories (and the old system.category, on skills saved before it existed) feed
    // related-skill improvement in #applySkillAssociations below.
    await pack.getIndex({ fields: ["system.skill_attribute", "system.modifier", "system.categories", "system.category"] });

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
        // Skills every character starts with (Dodge) never show below their starting level.
        const level = atLeastLevel(
          storedByUuid.get(entry.uuid)?.level ?? "untrained",
          CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels?.[entry.uuid]
        );
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
          // The level the player picked: what the dropdown shows and saves.
          level,
          // The level the skill is rolled at. Same as `level` unless a related skill raises it
          // (#applySkillAssociations fills these three in once every tab's rows exist).
          effectiveLevel: level,
          associated: false,
          associatedTooltip: "",
          categories: skillCategoriesOf(entry.system),
          attributeTotal,
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

    // Skills a Sequence gives that aren't on any tab: a skill from the world or another compendium that the
    // character has no level saved for yet. They get a row too, so the Granted Skills box can roll and level them.
    // Kept under GRANTED_ONLY, which isn't a tab, so the tabs (and the form they're part of) don't list them.
    // Once one's level is changed it's saved, and from then on it's also listed on its attribute's tab.
    const onTabs = new Set(Object.values(skillsByCategory).flat().map((row) => row.uuid));
    const folders = CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders;
    const grantedOnly = [];
    for (const uuid of new Set(grantedUuids)) {
      if (!uuid || onTabs.has(uuid)) continue;
      const doc = await fromUuid(uuid).catch(() => null);
      if (doc?.type !== "skill") continue;
      const attribute = doc.system?.skill_attribute;
      // Where a drop would save it (#dropSkill in base-actor-sheet.mjs). "" = it can't be saved, so its level can't change.
      const category = [attribute].find((key) => key && key in folders) ?? "";
      const level = atLeastLevel("untrained", CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels?.[uuid]);
      const attributeKey = category in CONFIG.LORD_OF_THE_MYSTERIES.attributes ? category : (attribute ?? category);
      const attributeTotal = this.actor.system.attributes[attributeKey]?.total ?? 0;
      grantedOnly.push({
        uuid, name: doc.name, img: doc.img,
        level, effectiveLevel: level, associated: false, associatedTooltip: "",
        categories: skillCategoriesOf(doc.system),
        attributeTotal, analysis: 0, category,
        attribute: attribute ?? category,
        flatModifier: doc.system?.modifier ?? 0,
        modifier: PlayerCharacterSheet._calculateSkillModifier(level, attributeTotal),
        removable: false,
      });
    }
    skillsByCategory[GRANTED_ONLY] = grantedOnly;

    // Related categories cross the attribute tabs (Social has Strength, Charisma and Inspiration skills),
    // so this runs once every tab's rows are built.
    this.#applySkillAssociations(skillsByCategory);
    // Study meters count from the level the skill is rolled at, so this comes after the associations.
    this.#applyStudyProgress(skillsByCategory);
    await this.#applyFastLearning(skillsByCategory, abilityEntries);

    return skillsByCategory;
  }


  /**
   * Learning by Doing (apps/study-dialog.mjs): which abilities can raise each skill, and its success count.
   *   row.teachers         uuids of the abilities that teach it, joined with "|" (empty = no ✋ button)
   *   row.successText      "1/2" when there's at least one success toward the next level
   *   row.successTooltip   "1 of 2 successes toward Proficient (learning by doing)"
   * @param {Record<string, object[]>} skillsByCategory  The rows from _prepareSkillList, changed in place.
   * @param {object[]} abilityEntries  The Abilities section's entries (owned and granted), from #prepareSections.
   */
  async #applyFastLearning(skillsByCategory, abilityEntries) {
    // The abilities with Learning by Doing turned on.
    const docs = await Promise.all(abilityEntries
      .filter((entry) => !entry.broken)
      .map((entry) => fromUuid(entry.uuid).catch(() => null)));
    const teachers = docs.filter((doc) => doc?.system?.fastLearning?.enabled);

    const learning = new Map((this.actor.system.learning ?? []).map((entry) => [entry.skill, entry]));
    const levelLabel = (level) => game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[level] ?? level);

    for (const row of Object.values(skillsByCategory).flat()) {
      row.teachers = teachers
        .filter((ability) => abilityTeaches(ability.system.fastLearning, row)
          && canTeachTo(row.effectiveLevel, ability.system.fastLearning.maxLevel))
        .map((ability) => ability.uuid)
        .join("|");

      const count = successesFor(learning.get(row.uuid), row.effectiveLevel);
      const next = nextLevel(row.effectiveLevel);
      row.successText = "";
      row.successTooltip = "";
      if (count > 0 && next) {
        const needed = successesNeeded(row.effectiveLevel);
        row.successText = `${count}/${needed}`;
        row.successTooltip = game.i18n.format("LORD_OF_THE_MYSTERIES.Learning.Fast.ProgressTooltip", {
          count, needed, next: levelLabel(next),
        });
      }
    }
  }


  /**
   * Each skill row's study meter (apps/study-dialog.mjs): the "46%" next to the book button.
   *   row.canStudy       false at Grand Master (nothing left to learn)
   *   row.studyPercent   0 when there's no study toward the next level yet
   *   row.studyTooltip   "46% of the way to Proficient through study"
   * @param {Record<string, object[]>} skillsByCategory  The rows from _prepareSkillList, changed in place.
   */
  #applyStudyProgress(skillsByCategory) {
    const learning = new Map((this.actor.system.learning ?? []).map((entry) => [entry.skill, entry]));

    for (const row of Object.values(skillsByCategory).flat()) {
      const next = nextLevel(row.effectiveLevel);
      row.canStudy = !!next;
      row.studyPercent = next ? meterPercent(studyProgressFor(learning.get(row.uuid), row.effectiveLevel)) : 0;
      row.studyTooltip = row.studyPercent
        ? game.i18n.format("LORD_OF_THE_MYSTERIES.Learning.ProgressTooltip", {
            percent: row.studyPercent,
            next: game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[next] ?? next),
          })
        : "";
    }
  }


  /**
   * Related-skill improvement: raise skills whose related skill is Advanced or better (helpers/skill-associations.mjs).
   * Only the rolled level and the shown modifier change; the dropdown keeps the player's own pick.
   * @param {Record<string, object[]>} skillsByCategory  The rows from _prepareSkillList, changed in place.
   */
  #applySkillAssociations(skillsByCategory) {
    const rows = Object.values(skillsByCategory).flat();
    const levelLabel = (level) => game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[level] ?? level);

    // First the character's Sequences raise their skills (base-actor.mjs sequenceSkillSteps), then related
    // skills raise each other from those levels: a Sequence that makes Sword Advanced also lifts Melee.
    const sequenceSteps = this.actor.system.sequenceSkillSteps ?? {};
    const raised = rows.map((row) => ({ ...row, level: raiseLevel(row.level, sequenceSteps[row.uuid] ?? 0) }));
    const results = computeAssociatedLevels(raised);

    for (const row of rows) {
      const steps = sequenceSteps[row.uuid] ?? 0;
      const result = results.get(row.uuid);
      const effective = result?.level ?? row.level;
      if (effective === row.level) continue;   // nothing raised it: no badge

      row.effectiveLevel = effective;
      row.associated = true;
      row.modifier = PlayerCharacterSheet._calculateSkillModifier(effective, row.attributeTotal);

      // Hover text: why it's higher than the dropdown says. Either reason, or both.
      const reasons = [];
      if (steps > 0) {
        reasons.push(game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.RaisedBySequence", { steps }));
      }
      if (result?.raised) {
        reasons.push(game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.RaisedBy", {
          level: levelLabel(result.level),
          sources: result.sources.map((source) => `${source.name} (${levelLabel(source.level)})`).join(", "),
        }));
      }
      row.associatedTooltip = reasons.join(" · ");
    }
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

    // Level dropdowns in the Granted Skills box (granted-skill-entry.hbs). No `name`: see #onGrantedSkillLevel.
    for (const select of this.element.querySelectorAll("[data-granted-skill-level]")) {
      if (select.dataset.bound) continue;
      select.dataset.bound = "1";
      select.addEventListener("change", (event) => this.#onGrantedSkillLevel(event));
    }

    // Enter in the custom-skill box adds it instead of submitting the sheet.
    this.element.querySelectorAll(".granted-skill-custom").forEach(input => {
      input.addEventListener("keydown", ev => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        PlayerCharacterSheet._onAddGrantedCustom.call(this, ev, ev.currentTarget);
      });
    });
  }


  /**
   * A level dropdown in the Granted Skills box: save the new level to that one skill (system.skills[category]).
   *
   * The same skill usually also has a dropdown on its attribute tab, and that one is part of the sheet's form.
   * If this change reached the form, the form would save right away with the tab's OLD level and undo this one,
   * so the event is stopped here and the level is saved directly. The sheet then redraws both dropdowns.
   * @param {Event} event
   */
  async #onGrantedSkillLevel(event) {
    event.stopPropagation();
    if (!this.isEditable) return;
    const select = event.currentTarget;
    const row = select.closest("[data-skill-uuid]");
    const uuid = row?.dataset.skillUuid;
    const category = row?.dataset.category;
    if (!uuid || !category) return;

    const level = select.value;
    const current = this.actor.toObject().system.skills?.[category] ?? [];
    const index = current.findIndex((entry) => entry.skill === uuid);
    const updated = index < 0
      ? [...current, { skill: uuid, level }]
      : current.map((entry, i) => (i === index ? { ...entry, level } : entry));
    await this.actor.update({ [`system.skills.${category}`]: updated });
  }


  /**
   * Money panel buttons: Receive / Pay / Move / Exchange (data-mode). Opens the transaction dialog.
   * @this {PlayerCharacterSheet}
   */
  static async #onMoneyTransaction(event, target) {
    if (!this.isEditable) return;
    await openMoneyDialog(this.actor, target.dataset.mode);
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
   * The book button on a skill row: open the Study dialog (apps/study-dialog.mjs).
   * data-level on the row is the level the skill is rolled at, so study carries on from a related skill's raise.
   */
  static async #onStudySkill(event, target) {
    if (!this.isEditable) return;
    const row = target.closest("[data-skill-uuid]");
    if (!row) return;
    await openStudyDialog(this.actor, {
      uuid: row.dataset.skillUuid,
      name: row.dataset.skillName,
      level: row.dataset.level,
    });
  }


  /**
   * The ✋ button on a skill row: record a success with an ability that teaches the skill (apps/study-dialog.mjs).
   * data-teachers on the row lists those abilities' uuids, separated by "|".
   */
  static async #onRecordSkillSuccess(event, target) {
    if (!this.isEditable) return;
    const row = target.closest("[data-skill-uuid]");
    const teachers = row?.dataset.teachers?.split("|").filter(Boolean) ?? [];
    if (!teachers.length) return;
    await openSuccessDialog(this.actor, {
      uuid: row.dataset.skillUuid,
      name: row.dataset.skillName,
      level: row.dataset.level,
    }, teachers);
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
   * The Inventory tab's "+" button: ask whether to make gear or a piece of clothing / a bag, create a blank one,
   * and open its sheet. New gear goes in the first pocket or bag with room, the same as a dropped item.
   */
  static async #onAddItem(event, target) {
    if (!this.isEditable) return;

    // Closing the dialog gives null (rejectClose: false), so nothing is made.
    const type = await foundry.applications.api.DialogV2.wait({
      window: { title: "LORD_OF_THE_MYSTERIES.Inventory.Add.Title" },
      content: `<p>${game.i18n.localize("LORD_OF_THE_MYSTERIES.Inventory.Add.Prompt")}</p>`,
      buttons: [
        { action: "gear", label: "LORD_OF_THE_MYSTERIES.Inventory.Add.Gear", icon: "fa-solid fa-toolbox", default: true },
        { action: "container", label: "LORD_OF_THE_MYSTERIES.Inventory.Add.Container", icon: "fa-solid fa-shirt" },
      ],
      rejectClose: false,
    });
    if (type !== "gear" && type !== "container") return;

    const data = { name: Item.implementation.defaultName({ type, parent: this.actor }), type };
    if (type === "gear") foundry.utils.mergeObject(data, foundry.utils.expandObject(autoPlacement(this.actor, data)));

    const [created] = await this.actor.createEmbeddedDocuments("Item", [data]);
    created?.sheet?.render({ force: true });
  }

}
