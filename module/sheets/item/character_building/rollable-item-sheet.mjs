import { LordOfTheMysteriesItemSheetBase, ACTION_TRAITS_PARTIAL, ITEM_EFFECTS_PARTIAL, TEXT_ROWS_PARTIAL } from "../../base-item-sheet.mjs";
import { SKILL_SLOT_ACTIONS, prepareSkillSlot, bindSkillSlot } from "../../../helpers/skill-slot.mjs";
import { TABLE_SLOT_ACTIONS, prepareTableSlots, bindTableSlots } from "../../../helpers/table-slot.mjs";

/**
 * The fields that say how an action or spell rolls (Modifiers, Skill, Attack Roll Macro, Defense Targeted, DC,
 * outcome tables, damage). In a template: `{{> "systems/lotm/templates/item/parts/roll-fields.hbs"}}`.
 */
export const ROLL_FIELDS_PARTIAL = "systems/lotm/templates/item/parts/roll-fields.hbs";

/** The partials the action and spell templates use; list them in the sheet's form part. */
export const ROLLABLE_PARTIALS = [ROLL_FIELDS_PARTIAL, ACTION_TRAITS_PARTIAL, TEXT_ROWS_PARTIAL, ITEM_EFFECTS_PARTIAL];


/**
 * What the action and spell sheets share, because both roll the same way (helpers/action-roll.mjs):
 *   - the roll fields (ROLL_FIELDS_PARTIAL): the Skill slot (helpers/skill-slot.mjs) and the On Success / On
 *     Failure table slots (helpers/table-slot.mjs), with their buttons and drops
 *   - the Traits checkboxes, the Description box, and the Effects tab
 *
 *   LordOfTheMysteriesItemSheetBase
 *     └─ RollableItemSheet                    (this file)
 *          ├─ LordOfTheMysteriesActionSheet   (action-sheet.mjs)
 *          └─ LordOfTheMysteriesSpellSheet    (spell-sheet.mjs)
 */
export class RollableItemSheet extends LordOfTheMysteriesItemSheetBase {
  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      ...SKILL_SLOT_ACTIONS,
      ...TABLE_SLOT_ACTIONS,
    },
  };

  /** The Effects tab (sheets/base-item-sheet.mjs). */
  static HAS_EFFECTS = true;

  /** @override */
  static TABS = LordOfTheMysteriesItemSheetBase.EFFECTS_TABS;

  /**
   * The hints under the Skill slot (lang keys): when it's empty, and how to fill it.
   * @type {{empty: string, drop: string}}
   */
  static SKILL_HINTS = {
    empty: "LORD_OF_THE_MYSTERIES.ActionSkill.None",
    drop: "LORD_OF_THE_MYSTERIES.ActionSkill.Hint",
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;

    context.enrichedDescription = await this._enrich(system.description);
    context.actionSkill = await prepareSkillSlot(this.item);
    context.outcomeTables = await prepareTableSlots(this.item);
    // The Traits checkboxes (templates/item/parts/action-traits.hbs).
    context.traitOptions = this._traitOptions();

    const hints = this.constructor.SKILL_HINTS;
    context.rollFields = {
      skillEmptyHint: hints.empty,
      skillHint: hints.drop,
      // Defense Targeted left blank: no hit check, except a gun shot, which is "too fast to dodge" (effectiveDefenseTarget).
      defenseBlank: system.ammoUse === "fire"
        ? "LORD_OF_THE_MYSTERIES.DefenseTargets.gunDefault"
        : "LORD_OF_THE_MYSTERIES.DefenseTargets.none",
    };
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // The Skill slot takes a dropped skill, the table slots a dropped Roll Table (only when the sheet can be edited).
    bindSkillSlot(this);
    bindTableSlots(this);
  }
}
