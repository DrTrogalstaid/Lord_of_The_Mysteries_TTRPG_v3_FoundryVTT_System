import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesSkill extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, initial: "Description" });
    schema.proficiency_level = new fields.StringField({ required: true, initial: "untrained", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels) });
    schema.skill_attribute = new fields.StringField({ required: true, initial: "str", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.attributes) });
    schema.modifier = new fields.NumberField({required: true, integer: true, min: 0, initial: 0})

    // Related-skill categories (helpers/skill-associations.mjs). A skill can be in several
    // (Psychology: Social, Psychological, Reconnaissance), and each membership has a mode:
    //   both     = raises the others and is raised by them
    //   gives    = only raises the others (Singing -> Music Theory)
    //   receives = only raised by the others (Biology in Medical)
    // This replaces the old single `category` field; migrateData below moves old data over.
    schema.categories = new fields.ArrayField(new fields.SchemaField({
      category: new fields.StringField({
        required: true, blank: false, initial: "fighting",
        choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories)
      }),
      mode: new fields.StringField({
        required: true, blank: false, initial: "both",
        choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategoryModes)
      })
    }));

    return schema;
  }

  /**
   * Skills saved before `categories` existed had one `category` string. Turn it into a one-entry list.
   * @override
   */
  static migrateData(source) {
    if (!Array.isArray(source.categories) && typeof source.category === "string") {
      source.categories = source.category ? [{ category: source.category, mode: "both" }] : [];
    }
    return super.migrateData(source);
  }

}
