import LordOfTheMysteriesDataModel from "../base-model.mjs";
import { calculateCarrying } from "../../helpers/inventory.mjs";

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
                damage_type: new fields.StringField({ required: true, initial: CONFIG.LORD_OF_THE_MYSTERIES.damageTypes.Physical }),
                value : new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 })
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
                    }),
                    // Abilities analyzed toward this skill (Extraordinary Knowledge). Only Education
                    // skills count here -- other skills' analyses go to a copy on the ability.
                    analysis: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
                })
            );
            return obj;
        }, {}));

        schema.biography = new fields.StringField({ required: true, blank: true }); // equivalent to passing ({initial: ""}) for StringFields

        schema.languages = new fields.SchemaField({
            common: new fields.ArrayField(
                new fields.StringField({ required: false, blank: true })
            ),
            mystical: new fields.ArrayField(
                new fields.StringField({ required: false, blank: true })
            )
        });

        return schema;
    }


    /** 
     * Prepare the derived data on the actor sheet 
     * @override 
    */
    prepareDerivedData() {
        const sequences = this.parent?.items.filter(i => i.type === "sequence") ?? [];


        // Attribute Bonus Calculation
        // Including sequence gains so resource calculations are correct.
        for (const [key, attr] of Object.entries(this.attributes)) {
            attr.sequence_bonus = sequences.reduce((sum, seq) =>
                sum + (seq.system.attribute_gain ?? [])
                    .filter(g => g.attribute_name === key)
                    .reduce((s, g) => s + (g.value ?? 0), 0), 0);   // display only, not in the schema
            attr.total = (attr.base ?? 0) + (attr.beyonder_bonus ?? 0)
                    + (attr.corruption ?? 0) + attr.sequence_bonus;
        }

        // Inventory: slots carried, and -1 Agility per slot over the Strength limit (see helpers/inventory.mjs).
        // This has to happen before movement and defenses, because the Agility penalty lowers both.
        // Only agi.total is lowered; agi.base (what the player types in) is never touched.
        this.carrying = calculateCarrying(this.parent?.items ?? [], this.attributes.str.total);   // display only, not in the schema
        this.attributes.agi.total -= this.carrying.penalty;

        // NOTE: Many resources are calculated one sequence at a time. To do this, we must loop through every sequence
        this._prepareResources();

        //TODO: Change the multiplication here to depend on the system's distance unit.
        this.movement = (this.attributes.str.total + this.attributes.agi.total) * 3;  // Multiply by 3 to get feet in stead of Meters

        this._prepareDefenseValues();

        // NOTE: THIS NEEDS TO BE CALLED LAST
        this._prepareSequenceCalculations(sequences);

    }


    /**
     * Initial resource calculations. 
     * This is the base that is added to when calculation sequence data improvements.
     */
    _prepareResources() {
        // Health
        this.resources.hp.max = (this.attributes.phy.base + 10);
        // Rationality
        this.resources.rp.max = (this.attributes.wil.total + 10);
        // Spirituality
        this.resources.spp.max = (this.attributes.wil.base + this.attributes.ins.base);
        // Luck
        this.resources.lp.max = this.attributes.luc.total;
        // Sequence Resource Increase
    }


    /**
     * Defense value calculations
     * Armor, Dodge, Physical, Will, and Physique
     */
    _prepareDefenseValues() {
        // Armor
        this.defenses.armor = 0;
        //Dodge
        // Loop through skills and find dodge
        this.defenses.dodge = 0;      
        for (var i in this.skills.agi){
            var skill = this.skills.agi[i];
            
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
    }


    /**
     * Sequence data calculations
     * This function adds to base data that has already been calculated, therefore
     * it needs to be called last.
     */
    _prepareSequenceCalculations(sequences) {

        let hasSequence4Flag = false;
        let hasSequence2Flag = false;

        // (initial will + initial inspiration) + (the number of currently promoted sequences * current inspiration value)
        this.resources.spp.max += (this.attributes.ins.total * sequences.length);
        this.resources.hp.max += (this.attributes.phy.total * sequences.length);

        // Loop through all sequence items
        for (const sequence of sequences) {
            
            // Digestion Bonuses
            this.resources.hp.max += Math.floor(sequence.system.digestionAmount / 5);
            this.resources.spp.max += Math.floor(sequence.system.digestionAmount / 5);

            // Sequence 4 and 2 bonus
            if (sequence.system.sequence_number == 4) {
                hasSequence4Flag = true;
            }
            if (sequence.system.sequence_number == 2) {
                hasSequence2Flag = true;
            }
        }

        // High sequence bonuses
        if (hasSequence4Flag == true) {
            this.resources.hp.max *= 2;
            this.resources.spp.max *= 2;
        }

        if (hasSequence2Flag == true) {
            this.resources.hp.max *= 3;
            this.resources.spp.max *= 3;
        }

    }

}