import { LordOfTheMysteriesItemSheetBase, ITEM_HEADER_PART } from "../../base-item-sheet.mjs";
import { skillKeyFromName } from "../../../helpers/skill-keys.mjs";
import { skillInfo } from "../../../helpers/skill-registry.mjs";

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

    // Identifier and Standard skill (data/item/character_building/skill.mjs, helpers/skill-registry.mjs).
    // A blank Identifier shows the key its name gives. A Standard box that's never been saved shows what the
    // registry decided from the compendium folder (only for the skill the registry actually uses under this key).
    const key = this.item.system.key;
    const info = skillInfo(key);
    context.skillKey = key;
    context.identifierPlaceholder = skillKeyFromName(this.item.name);
    context.isStandard = this.item.system.isStandard ?? (info?.uuid === this.item.uuid ? info.isStandard : false);
    // Another Item is the one actors use under this key (this is a world copy of a compendium skill, say).
    context.keyUsedBy = info && info.uuid !== this.item.uuid ? info.name : "";

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
