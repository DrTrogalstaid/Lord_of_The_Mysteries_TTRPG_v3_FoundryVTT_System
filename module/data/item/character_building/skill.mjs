import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAbility extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.proficiency_level = new fields.StringField({ required: true, initial: CONFIG.LORD_OF_THE_MYSTERIES.Skill_Level});
    schema.category = new fields.StringField({ required: true, initial: CONFIG.LORD_OF_THE_MYSTERIES.Attributes.Str});
    schema.subcategory = new fields.StringField({ required: false});
    schema.description = new fields.StringField({ required: true, initial: "Description"});

    return schema;
  }

}