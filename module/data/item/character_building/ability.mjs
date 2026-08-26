import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAbility extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};
    
    schema.description = new fields.StringField({ required: true, initial: "Description" });
    schema.trigger = new fields.StringField({ required: false, initial: "na" });
    schema.special = new fields.StringField({ required: false, initial: "na" });
    schema.canBeStolen = new fields.BooleanField({ required: true, initial: true})

    //Action Type (e.i. Attack/Spell, quick action, free action)
    schema.actionType = new fields.StringField({ required: false, blank: true, initial:"", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTypes) });


    //Roll modifiers

    //Vistion/Senses gained
    //TODO: Vistion object? How does foundry handle this??

    //Spirituatlity Cost
    schema.spiritualityCost = new fields.NumberField({required: false, integer: true, min: 0});

    //Higher sequence bonuses (array containing all sequences?)
    //TODO: What should this be besides a string?
    schema.higherSequenceUpgrades = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" }),
    );

    //Range
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});

    // Spell List
    schema.spellList = new fields.SchemaField({
      name: new fields.StringField({required: false, initial: "Spells"}),
      spells: new fields.ArrayField(
        new fields.DocumentUUIDField({ type: "Item", required: false })
      ) 
    });

    return schema;
  }

}