import LordOfTheMysteriesDataModel from "./base-model.mjs";

const {
  HTMLField, SchemaField, NumberField, StringField, FilePathField, ArrayField
} = foundry.data.fields;


export default class LordOfTheMysteriesActorBase extends LordOfTheMysteriesDataModel {

    static defineSchema() {
      const fields = foundry.data.fields;
      const requiredInteger = { required: true, nullable: false, integer: true };
      const schema = {};

      schema.resources = new fields.SchemaField({
          health: new fields.SchemaField({
              value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 10 }),
              max: new fields.NumberField({ required: true, integer: true, min: 0, initial: 10 })
          }),
          spirit: new fields.SchemaField({
              value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 10}),
              max: new fields.NumberField({ required: true, integer: true, min: 0, initial: 10})
          }),
          rationality: new fields.SchemaField({
              value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 10}),
              max: new fields.NumberField({ required: true, integer: true, min: 0, initial: 10})
          }),
          luck: new fields.SchemaField({
              value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              max: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          spirituality: new fields.SchemaField({
              value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              max: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          })
      });

      schema.attributes = new fields.SchemaField({
          strength: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          agility: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          willpower: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          physique: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          charisma: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          inspiration: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          luck: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
          education: new fields.SchemaField({
              base: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              beyonder_bonus: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0}),
              corruption: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0})
          }),
      });

      schema.armor = new fields.NumberField({ required: true, integer: true, min: 0, initial: 0});
      schema.dodge = new fields.NumberField({ required: true, integer: true, min: 0, initial: 0});
      
      schema.damage_resistance = new fields.ArrayField(
          new fields.SchemaField({
              damage_type: new fields.StringField({ required: true}),
              value : new fields.NumberField({required: true, integer: true, min: 0})
          })
      );
      
      schema.languages = new ArrayField(
        new fields.StringField({ required: true})
      );

    
    schema.power = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 5, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 5 })
    });
    schema.biography = new fields.StringField({ required: true, blank: true }); // equivalent to passing ({initial: ""}) for StringFields

    return schema;
  }

}