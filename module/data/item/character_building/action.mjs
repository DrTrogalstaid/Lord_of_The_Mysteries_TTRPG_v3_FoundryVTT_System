import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAction extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.title = new fields.StringField({ required: true, initial: "Action Title" });
    //Action Type (e.i. Attack/Spell, quick action, free action)
    schema.action_type = new fields.StringField({ required: true, initial: "free", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTypes) });
    schema.description = new fields.StringField({ required: true, initial: "Results" });
    schema.category = new fields.StringField({ required: true, initial: "combat", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionCategories) });

    //Spirituatlity cost
    schema.spirituality_cost = new fields.NumberField({required: false, integer: true, min: 0});

    //Active effects?
    //Range
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});

    schema.modifiers = new fields.NumberField({required: false, integer: true});

    schema.attackRollMacro = new fields.StringField({ required: false});
    schema.damageRollMacro = new fields.StringField({ required: false});

    // The skill this action rolls with (UUID of a skill Item, e.g. Pistol). Blank = none.
    // Set by dropping a skill on the action sheet's Skill slot (see helpers/skill-slot.mjs).
    // When set, the action gets a dice button on the character sheet that opens the skill check
    // dialog: the Attack Roll Macro is rolled, plus the character's bonuses in this skill.
    schema.skill = new fields.StringField({ required: true, blank: true, initial: "" });

    //DC_Results
    schema.dcResults = new fields.StringField({ required: true, initial: "Results" });

    //Great Success and Big Failure events
    schema.specialResults = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" })
    );

    return schema;
  }

}