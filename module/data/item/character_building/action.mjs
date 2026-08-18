import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAction extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    //Action Type (e.i. Attack/Spell, quick action, free action)
    schema.action_type = new fields.StringField({ required: true, initial: "free", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTypes) });

    //Spirituatlity cost
    schema.spirituality_cost = new fields.NumberField({required: false, integer: true, min: 0});

    //Active effects?
    //Range
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});

    //DC_Results
    //TODO: Make an array?? Mayebe, but it could also be a markdown table. Or the sheet would process the array into a markdown table??
    schema.dc_results = new fields.StringField({ required: true, initial: "Results" });

    //Great Success and Big Failure events
    schema.special_results = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" })
    );

    return schema;
  }

}