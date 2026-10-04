import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesSkill extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, initial: "Description" });
    schema.proficiency_level = new fields.StringField({ required: true, initial: "untrained", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels) });
    schema.skill_attribute = new fields.StringField({ required: true, initial: "str", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.attributes) });
    schema.modifier = new fields.NumberField({required: true, integer: true, min: 0, initial: 0})
    
    schema.category = new fields.StringField({ required: false, blank: true, initial: "", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories) });

    return schema;
  }

}