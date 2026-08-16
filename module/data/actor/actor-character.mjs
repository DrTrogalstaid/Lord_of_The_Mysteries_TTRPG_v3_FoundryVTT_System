import LordOfTheMysteriesActorBase from "./base-actor.mjs";

export default class LordOfTheMysteriesCharacter extends LordOfTheMysteriesActorBase {

    static defineSchema() {
        const fields = foundry.data.fields;
        const requiredInteger = { required: true, nullable: false, integer: true };
        const schema = super.defineSchema();

        schema.age = new fields.NumberField({ required: true, integer: true, min: 0 });
        schema.occupation = new fields.StringField({ required: true, blank: true });
        schema.race = new fields.StringField({ required: true, blank: true });
        schema.gender = new fields.StringField({ required: true, blank: true });

        return schema;
    }

  // getRollData() {
  //   const data = {};

  //   // Copy the attribute scores to the top level, so that rolls can use
  //   // formulas like `@str.mod + 4`.
  //   if (this.attributes) {
  //     for (let [k,v] of Object.entries(this.attributes)) {
  //       data[k] = foundry.utils.deepClone(v);
  //     }
  //   }

  //   data.lvl = this.attributes.level.value;

  //   return data
  // }
}