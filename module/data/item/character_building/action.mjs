import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAction extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, initial: "Description" });

    //Action Length (e.i. Attack/Spell, quick action, free action)
    //Spirituatlity consumption
    //Active effects?
    //Range
    //DC_Results
    //Great Success and Big Failure events

    return schema;
  }

}