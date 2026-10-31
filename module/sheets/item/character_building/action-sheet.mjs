import { LordOfTheMysteriesItemSheetBase, ITEM_HEADER_PART } from "../../base-item-sheet.mjs";
import { SKILL_SLOT_ACTIONS, prepareSkillSlot, bindSkillSlot } from "../../../helpers/skill-slot.mjs";
import { AMMO_USES } from "../../../helpers/firearms.mjs";


export class LordOfTheMysteriesActionSheet extends LordOfTheMysteriesItemSheetBase {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["action"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
    // Clicks on [data-action] buttons. The Skill slot's open / remove (helpers/skill-slot.mjs).
    actions: {
      ...SKILL_SLOT_ACTIONS,
    },
  };

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/action.hbs" },
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.enrichedDescription = await this._enrich(this.item.system.description);

    // The Skill slot: the skill this action rolls with.
    context.actionSkill = await prepareSkillSlot(this.item);

    // "Uses ammo" dropdown: none / fire / reload / chamber / unload (helpers/firearms.mjs).
    context.ammoUseOptions = AMMO_USES;

    return context;
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Let the Skill slot accept a dropped skill (only when the sheet can be edited; bindSkillSlot checks).
    bindSkillSlot(this);
  }

}
