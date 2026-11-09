import { ITEM_HEADER_PART } from "../../base-item-sheet.mjs";
import { RollableItemSheet, ROLLABLE_PARTIALS } from "./rollable-item-sheet.mjs";


/**
 * The spell sheet. A spell rolls like an action (RollableItemSheet: the roll fields, Traits, Effects tab); this adds
 * the spell's own fields: Special, Target, and Sequence Upgrades. An empty Skill slot means Occultism
 * (CONFIG.LORD_OF_THE_MYSTERIES.spellSkillKey).
 */
export class LordOfTheMysteriesSpellSheet extends RollableItemSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["spell"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
  };

  /** @override */
  static SKILL_HINTS = {
    empty: "LORD_OF_THE_MYSTERIES.ActionSkill.SpellDefault",
    drop: "LORD_OF_THE_MYSTERIES.ActionSkill.SpellHint",
  };

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/spell.hbs", templates: ROLLABLE_PARTIALS },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.enrichedSpecial = await this._enrich(this.item.system.special);
    context.higherSequenceUpgrades = this._textRows("system.higherSequenceUpgrades");
    return context;
  }
}
