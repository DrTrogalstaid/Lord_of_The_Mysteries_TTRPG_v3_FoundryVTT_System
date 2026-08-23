import LordOfTheMysteriesDataModel from "../base-model.mjs";

const {
    HTMLField, SchemaField, NumberField, StringField, FilePathField, ArrayField, DocumentUUIDField
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
                base: new fields.NumberField({ ...requiredInteger, initial: 2, min: 2 }),
                beyonder_bonus: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0}),
                corruption: new fields.NumberField({...requiredInteger, initial: 0, min: 0}),
                total: new fields.NumberField({...requiredInteger, initial: 0})
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
        
        schema.skills = new fields.SchemaField(Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders).reduce((obj, compendiumCategory) => {
            obj[compendiumCategory] = new fields.ArrayField(
                new fields.SchemaField({
                    skill: new fields.DocumentUUIDField({type:"Item", required: true}),
                    level: new fields.StringField({
                        required: true,
                        initial: "untrained",
                        choices: () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels)
                    })
                })
            );
            return obj;
        }, {}));

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

    /** @override */
    prepareDerivedData() {
        for (const attr of Object.values(this.attributes)) {
            attr.total = (attr.base ?? 0) + (attr.beyonder_bonus ?? 0) + (attr.corruption ?? 0);
        }
    }

}