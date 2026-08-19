import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesSequence extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // Basic Information
    schema.pathway = new fields.StringField({ required: true, initial: "Pathway"});
    schema.sequence_number = new fields.NumberField({ required: true, nullable: false, integer: true , initial: 9});
    schema.description = new fields.StringField({ required: true, initial: "Description" });
    schema.acting_principals = new fields.StringField({ required: true, initial: "NA"});
    
    // Bonuses
    schema.attribute_gain = new fields.ArrayField(
        new fields.SchemaField({
            // NOTE: Each attribute_name must match a key in CONFIG.LORD_OF_THE_MYSTERIES.attributes (e.g. "str", "agi")
            attribute_name: new fields.StringField({ required: true, blank: false }),
            value : new fields.NumberField({required: true, integer: true, min: 0, initial: 1})
        })
    );
    schema.skill_increase = new fields.ArrayField(
        new fields.SchemaField({
            // The UUID of the Skill Item this increase applies to
            skill_uuid: new fields.DocumentUUIDField({ type: "Item", required: true }),
            value : new fields.NumberField({required: true, integer: true, min: 0, initial: 1})
        })
    );

    // Abilities
    // Each entry is the UUID of an Item (e.g. a ability) granted by this Sequence
    schema.abilities_gained = new fields.ArrayField(
        new fields.DocumentUUIDField({ type: "Item", required: true })
    );

    // Knowledge and Training bonus
    schema.trainingBonus = new fields.ArrayField(
        new fields.DocumentUUIDField({ type: "Item", required: true })
    )

    return schema;
  }
}