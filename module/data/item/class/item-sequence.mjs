import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesSequence extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};
    
    // Basic Information
    schema.title = new fields.StringField({ required: true});
    schema.appearance = new fields.StringField({ required: true});
    schema.pathway = new fields.StringField({ required: true});
    schema.sequence_number = new fields.NumberField(requiredInteger);
    
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
    // NOTE: Each item in this list must mach the name of an ability
    schema.abilities_gained = new fields.ArrayField(
        new fields.StringField({required: true})
    );

    return schema;
  }
}