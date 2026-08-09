import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesPathway extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    return schema;
  }
}