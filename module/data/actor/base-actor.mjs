import LordOfTheMysteriesDataModel from "../base-model.mjs";

const {
    HTMLField, SchemaField, NumberField, StringField, FilePathField, ArrayField
} = foundry.data.fields;


export default class LordOfTheMysteriesActorBase extends LordOfTheMysteriesDataModel {

    static defineSchema() {
        const fields = foundry.data.fields;
        const requiredInteger = { required: true, nullable: false, integer: true };
        const schema = {};

        // Iterate over resources names and create a new SchemaField for each.
        //TODO: Find a way to do this and set Luck and luck and spirituality to 0 on init
        schema.resources = new fields.SchemaField(Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.resources).reduce((obj, resource) => {
            obj[resource] = new fields.SchemaField({
                value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
                max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0}),
            });
            return obj;
        }, {}));

        // Iterate over attributes names and create a new SchemaField for each.
        schema.attributes = new fields.SchemaField(Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.attributes).reduce((obj, attribute) => {
            obj[attribute] = new fields.SchemaField({
                base: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
                beyonder_bonus: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0}),
                corruption: new fields.NumberField({...requiredInteger, initial: 0, min: 0})
            });
            return obj;
        }, {}));

        schema.armor = new fields.NumberField({ required: true, integer: true, min: 0, initial: 0});
        schema.dodge = new fields.NumberField({ required: true, integer: true, min: 0, initial: 0});
        
        schema.damage_resistance = new fields.ArrayField(
            new fields.SchemaField({
                damage_type: new fields.StringField({ required: true}),
                value : new fields.NumberField({required: true, integer: true, min: 0})
            })
        );
        
        schema.languages = new fields.ArrayField(
            new fields.SchemaField({  
                language: new fields.StringField({ required: true}),
                mystical: new fields.BooleanField({ required: true, initial: false})
            })
        );

        schema.biography = new fields.StringField({ required: true, blank: true }); // equivalent to passing ({initial: ""}) for StringFields

        //TODO: Use sequence-data.mjs or something to define this.
        schema.SequenceData = new fields.SchemaField({
            pathway: new fields.SchemaField({
                common_name: new fields.StringField({ required: true}),
                other_names: new fields.ArrayField(
                    new fields.StringField({ required: true})
                ),
                tarrot_association: new fields.StringField({ required: true})
            }),

            current_sequence: new fields.SchemaField({
            title: new fields.StringField({ required: true}),
            sequence_number: new fields.NumberField({required: true, integer: true, min: 0})
            })
          });

        return schema;
    }

}