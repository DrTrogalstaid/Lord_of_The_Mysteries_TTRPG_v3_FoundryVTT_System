import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAbility extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, initial: "Description" });

    schema.trigger = new fields.StringField({ required: false, initial: "na" });
    schema.special = new fields.StringField({ required: false, initial: "na" });

    // Actions
    // Each entry is the UUID of an Action granted by this aability
    schema.actions = new fields.ArrayField(
      new fields.DocumentUUIDField({ type: "Item", required: true })
    );

    schema.can_be_stolen = new fields.BooleanField({ required: true, initial: true})

    //Roll modifiers

    //Knowledge gain??

    //Vistion/Senses gained
    //TODO: Vistion object? How does foundry handle this??

    //Spirituatlity Cost
    schema.spirituality_cost = new fields.NumberField({required: false, integer: true, min: 0});

    //Higher sequence bonuses (array containing all sequences?)
    //TODO: What should this be besides a string?
    schema.higher_sequence_upgrades = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" })
    );

    //Range
    //TODO: Is there something better than int??
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});


    return schema;
  }

}