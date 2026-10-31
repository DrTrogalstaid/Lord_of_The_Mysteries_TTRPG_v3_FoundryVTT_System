import { LordOfTheMysteriesItemSheetBase, ITEM_HEADER_PART } from "../../base-item-sheet.mjs";

/** The related-skill categories box. Include it in skill.hbs with {{> "systems/lotm/templates/item/character_building/parts/skill-categories.hbs"}} */
const SKILL_CATEGORIES_PARTIAL = "systems/lotm/templates/item/character_building/parts/skill-categories.hbs";


export class LordOfTheMysteriesSkillSheet extends LordOfTheMysteriesItemSheetBase {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["skill"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
    actions: {
      addCategory: LordOfTheMysteriesSkillSheet.#onAddCategory,
      removeCategory: LordOfTheMysteriesSkillSheet.#onRemoveCategory,
    },
  };

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/skill.hbs", templates: [SKILL_CATEGORIES_PARTIAL] },
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.enrichedDescription = await this._enrich(this.item.system.description);

    // Dropdown choices for the related-skill categories box.
    context.categoryChoices = CONFIG.LORD_OF_THE_MYSTERIES.skillCategories;
    context.categoryModes = CONFIG.LORD_OF_THE_MYSTERIES.skillCategoryModes;

    return context;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /**
   * Add a category to this skill. It starts as the first category the skill isn't in yet, with mode "both";
   * change both in the dropdowns.
   */
  static async #onAddCategory(event, target) {
    if (!this.isEditable) return;
    const current = this.item.toObject().system.categories ?? [];
    const used = new Set(current.map((entry) => entry.category));
    const next = Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories).find((key) => !used.has(key));
    if (!next) {
      ui.notifications.info(game.i18n.localize("LORD_OF_THE_MYSTERIES.SkillAssociation.AllUsed"));
      return;
    }
    await this.item.update({ "system.categories": [...current, { category: next, mode: "both" }] });
  }


  /** Remove one category from this skill (data-index = its position in the list). */
  static async #onRemoveCategory(event, target) {
    if (!this.isEditable) return;
    await this._removeFromList("system.categories", target.dataset.index);
  }

}
