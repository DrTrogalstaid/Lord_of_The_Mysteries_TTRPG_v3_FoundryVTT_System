import { LordOfTheMysteriesItemSheetBase, ITEM_HEADER_PART, ACTION_TRAITS_PARTIAL, ITEM_EFFECTS_PARTIAL } from "../../base-item-sheet.mjs";
import { SKILL_SLOT_ACTIONS, prepareSkillSlot, bindSkillSlot } from "../../../helpers/skill-slot.mjs";
import { AMMO_USES } from "../../../helpers/firearms.mjs";


export class LordOfTheMysteriesActionSheet extends LordOfTheMysteriesItemSheetBase {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["action"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
    // Clicks on [data-action] buttons: the Skill slot's open / remove (helpers/skill-slot.mjs), and the Special
    // Results list's add / delete (Description tab).
    actions: {
      ...SKILL_SLOT_ACTIONS,
      addSpecialResult: LordOfTheMysteriesActionSheet.#onAddSpecialResult,
      deleteSpecialResult: LordOfTheMysteriesActionSheet.#onDeleteSpecialResult,
    },
  };

  /** The Effects tab (sheets/base-item-sheet.mjs). */
  static HAS_EFFECTS = true;

  /** @override */
  static TABS = LordOfTheMysteriesItemSheetBase.EFFECTS_TABS;

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/action.hbs", templates: [ACTION_TRAITS_PARTIAL, ITEM_EFFECTS_PARTIAL] },
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

    // The Traits checkboxes (templates/item/parts/action-traits.hbs).
    context.traitOptions = this._traitOptions();

    // "Uses ammo" dropdown: none / fire / reload / chamber / unload (helpers/firearms.mjs).
    context.ammoUseOptions = AMMO_USES;

    // Special Results (Great Success / Big Failure events): each row needs its position, for its text box's name
    // (system.specialResults.<index>) and its delete button.
    context.specialResults = (context.system.specialResults ?? []).map((value, index) => ({ index, value }));

    return context;
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Let the Skill slot accept a dropped skill (only when the sheet can be edited; bindSkillSlot checks).
    bindSkillSlot(this);
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /** Add a blank Special Result row. */
  static async #onAddSpecialResult(event, target) {
    if (!this.isEditable) return;
    const current = this.item.system.specialResults ?? [];
    await this.item.update({ "system.specialResults": [...current, ""] });
  }

  /** Remove a Special Result row (data-index = its position). */
  static async #onDeleteSpecialResult(event, target) {
    if (!this.isEditable) return;
    await this._removeFromList("system.specialResults", target.dataset.index);
  }
}
