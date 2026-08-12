import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesSequence extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // Basic Information
    schema.pathway = new fields.StringField({ required: true, initial: "Pathway"});
    schema.sequence_number = new fields.NumberField({ required: true, nullable: false, integer: true , initial: 9});
    schema.description = new fields.StringField({ required: true, initial: "description"});
    schema.acting_principals = new fields.StringField({ required: true, initial: "NA"});
    
    // Bonuses
    schema.attribute_gain = new fields.ArrayField(
        new fields.SchemaField({
            // NOTE: Each attribute_name must match the name of an attribute
            attribute_name: new fields.StringField({ required: true}),
            value : new fields.NumberField({required: true, integer: true, min: 0})
        })
    );
    schema.skill_increase = new fields.ArrayField(
        new fields.SchemaField({
            // NOTE: Each skill_name must match the name of a skill
            skill_name: new fields.StringField({ required: true}),
            value : new fields.NumberField({required: true, integer: true, min: 0})
        })
    );

    // Abilities
    // NOTE: Each item in this list must mach the name of an ability/
    schema.abilities_gained = new fields.ArrayField(
        new fields.StringField({required: true})
    );
    return schema;
  }
}