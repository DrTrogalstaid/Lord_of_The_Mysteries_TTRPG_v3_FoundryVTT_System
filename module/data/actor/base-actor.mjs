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
        schema.resources = new fields.SchemaField(Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.resources).reduce((obj, resource) => {
            obj[resource] = new fields.SchemaField({
                value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
                max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0}),
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

        schema.movement = new fields.NumberField({ required: true, integer: true});
        
        schema.defenses = new fields.SchemaField({
            armor: new fields.NumberField({ required: true, integer: true}),
            physical: new fields.NumberField({ required: true, integer: true}),
            dodge: new fields.NumberField({ required: true, integer: true}),
            physique: new fields.NumberField({ required: true, integer: true}),
            will: new fields.NumberField({ required: true, integer: true})
        });

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

        schema.beyonderData = new fields.SchemaField({
            pathway: new fields.StringField({required: false, blank: true}),
            sequenceList: new fields.ArrayField(
                new fields.SchemaField({
                    sequenceItem: new fields.DocumentUUIDField({type:"Item", required: true}),
                    sequenceNumber: new fields.NumberField({required: true, integer: true, min:0}),
                    title: new fields.StringField({ required: true}),
                    digestionAmount: new fields.NumberField({required: true, integer: true, min:0, initial: 0})
                })
            ),
            currentSequence: new fields.DocumentUUIDField({type:"Item", required: true})
        });

        return schema;
    }

    /** @override */
    prepareDerivedData() {
        
        /**
         * Sequence Calculations
         */

        /**
         * Attribute Bonus Calculation
         */
        for (const attr of Object.values(this.attributes)) {
            attr.total = (attr.base ?? 0) + (attr.beyonder_bonus ?? 0) + (attr.corruption ?? 0);
        }

        /**
         * Resource Calculations
         * NOTE: Many resources are calculated one sequence at a time. To do this, we must loop through every sequence
         *       calculating as we go. 
         */
        // Health
        this.resources.hp.max = (this.attributes.phy.total + 10);
        // Rationality
        this.resources.rp.max = (this.attributes.wil.total + 10);
        // Spirituality
        this.resources.spp.max = (this.attributes.wil.total + this.attributes.ins.total);
        // Luck
        this.resources.lp.max = this.attributes.luc.total;

        // Loop through beyonderData.sequenceList for full calculation
        // for (const sequence of Object.values(this.beyonderData.sequenceList)) {
        //     sequence.
        // }

        /**
         * Movement
         */
        this.movement = (this.attributes.str.total + this.attributes.agi.total);

        /**
         * Defense Calculations
         */
        // Armor
        this.defenses.armor = 0;
        //Dodge
        // Loop through skills and find dodge
        this.defenses.dodge = 0;      
        for (var i in this.skills.agi){
            var skill = this.skills.agi[i];
            
            //TODO: Will this uuid change??
            if (skill.skill == "Compendium.lotm.skills_compendium.Item.iY814DRe7O6m6NLQ")
            {
                //TODO: Make this better by storing modifier in skill item??
                switch(skill.level)
                {
                case "untrained":
                    this.defenses.dodge -= 4;
                    break;
                case "trained":
                    this.defenses.dodge += 2;
                    break;
                case "proficient":
                    this.defenses.dodge += 4;
                    break;
                case "advanced":
                    this.defenses.dodge += 5;
                    break;
                case "mastery":
                    this.defenses.dodge += 6;
                    break;
                case "lore":
                    this.defenses.dodge += 7;
                    break;
                case "grandMaster":
                    this.defenses.dodge += 8;
                    break;
                }
            }
        }
        // Physical
        this.defenses.physical = (this.attributes.agi.total + this.defenses.armor + this.defenses.dodge + 10);
        // Will
        this.defenses.will = (this.attributes.wil.total + 10);
        // Physique
        this.defenses.physique = (this.attributes.phy.total + 10);
        
        /**
         * Damage Resistances
         */

    }

}