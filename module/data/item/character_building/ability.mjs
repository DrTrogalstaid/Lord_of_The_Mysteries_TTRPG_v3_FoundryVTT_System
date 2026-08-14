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

    //Identification bonus/change
    //Knowledge gain??
    //Vistion/Senses gained
    //Spirituatlity consumption
    //Higher sequence bonuses (array containing all sequences?)
    //Range?

    return schema;
  }

}