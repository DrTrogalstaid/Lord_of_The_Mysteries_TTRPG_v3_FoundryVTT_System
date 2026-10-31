import { LordOfTheMysteriesItemSheetBase, ITEM_HEADER_PART } from "../../base-item-sheet.mjs";

/**
 * The lists an Item can be dropped on, keyed by the [data-drop-zone] they're shown in (ability.hbs).
 * See _dropOnList in base-item-sheet.mjs for what each setting does.
 */
const DROP_LISTS = {
  spellList: {
    path: "system.spellList.spells",
    duplicate: "{name} is already in the Spell List.",
  },
  actionList: {
    path: "system.actionList",
    duplicate: "{name} is already in the Action List.",
  },
  skillOptions: {
    path: "system.skillOptions",
    type: "skill",
    wrongType: "Only Skills can be added to Skill Options.",
    duplicate: "{name} is already in the Skill Options.",
  },
  // Learning by Doing: a single skill this ability teaches.
  fastLearningSkills: {
    path: "system.fastLearning.skills",
    type: "skill",
    wrongType: "LORD_OF_THE_MYSTERIES.Learning.Fast.NotASkill",
    duplicate: "{name} is already taught by this ability.",
  },
};


export class LordOfTheMysteriesAbilitySheet extends LordOfTheMysteriesItemSheetBase {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["ability"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
    dragDrop: [{ dragSelector: null, dropSelector: ".sheet-body" }],
    actions: {
      addSequenceUpgrade: LordOfTheMysteriesAbilitySheet.#onAddSequenceUpgrade,
      deleteSequenceUpgrade: LordOfTheMysteriesAbilitySheet.#onDeleteSequenceUpgrade,
      deleteSpell: LordOfTheMysteriesAbilitySheet.#onDeleteSpell,
      deleteAction: LordOfTheMysteriesAbilitySheet.#onDeleteAction,
      deleteSkillOption: LordOfTheMysteriesAbilitySheet.#onDeleteSkillOption,
      addFastCategory: LordOfTheMysteriesAbilitySheet.#onAddFastCategory,
      removeFastCategory: LordOfTheMysteriesAbilitySheet.#onRemoveFastCategory,
      deleteFastSkill: LordOfTheMysteriesAbilitySheet.#onDeleteFastSkill,
    },
  };

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/ability.hbs" },
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.enrichedDescription = await this._enrich(this.item.system.description);
    context.enrichedSpecial = await this._enrich(this.item.system.special);

    // Sequence Upgrade rows just need their array index for input naming.
    context.higherSequenceUpgrades = (context.system.higherSequenceUpgrades ?? []).map((value, index) => ({
      index,
      value,
    }));

    // The lists of linked Items, looked up for their name and image.
    context.spellListSpells = await this._linkedItemRows(context.system.spellList?.spells);
    context.actionListActions = await this._linkedItemRows(context.system.actionList);
    // Skill Options: the dropdown characters pick granted skills from.
    context.skillOptionRows = await this._linkedItemRows(context.system.skillOptions);

    // Learning by Doing: dropdown choices, and the single skills it teaches.
    context.skillCategoryChoices = CONFIG.LORD_OF_THE_MYSTERIES.skillCategories;
    context.skillLevelChoices = CONFIG.LORD_OF_THE_MYSTERIES.skillLevels;
    context.fastSkillRows = await this._linkedItemRows(context.system.fastLearning?.skills);

    return context;
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                  */
  /* -------------------------------------------- */

  /**
   * An Item dropped on one of the lists (DROP_LISTS above) is added to it. ItemSheetV2 has already turned the
   * drop into a Document; dropped anywhere else on the sheet, nothing happens.
   * @override
   */
  async _onDropDocument(event, document) {
    if (document.documentName !== "Item") return super._onDropDocument(event, document);

    const list = DROP_LISTS[event.target.closest("[data-drop-zone]")?.dataset.dropZone];
    if (!list) return document;
    return this._dropOnList(document, list);
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /** Add a blank Sequence Upgrade row. */
  static async #onAddSequenceUpgrade(event, target) {
    const current = this.item.system.higherSequenceUpgrades ?? [];
    await this.item.update({ "system.higherSequenceUpgrades": [...current, ""] });
  }

  /** Remove a Sequence Upgrade row (data-index = its position). */
  static async #onDeleteSequenceUpgrade(event, target) {
    await this._removeFromList("system.higherSequenceUpgrades", target.dataset.index);
  }

  /** Remove a Spell List entry. */
  static async #onDeleteSpell(event, target) {
    await this._removeFromList("system.spellList.spells", target.dataset.index);
  }

  /** Remove an Action List entry. */
  static async #onDeleteAction(event, target) {
    await this._removeFromList("system.actionList", target.dataset.index);
  }

  /** Remove a Skill Options entry. */
  static async #onDeleteSkillOption(event, target) {
    await this._removeFromList("system.skillOptions", target.dataset.index);
  }

  /** Learning by Doing: add a category (the first one not already listed; change it in the dropdown). */
  static async #onAddFastCategory(event, target) {
    const current = this.item.system.fastLearning?.categories ?? [];
    const next = Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories).find((key) => !current.includes(key));
    if (!next) return;
    await this.item.update({ "system.fastLearning.categories": [...current, next] });
  }

  /** Learning by Doing: remove a category. */
  static async #onRemoveFastCategory(event, target) {
    await this._removeFromList("system.fastLearning.categories", target.dataset.index);
  }

  /** Learning by Doing: remove a single skill. */
  static async #onDeleteFastSkill(event, target) {
    await this._removeFromList("system.fastLearning.skills", target.dataset.index);
  }

}
