import LordOfTheMysteriesDataModel from "../base-model.mjs";
import { calculateCarrying, armoredMovement } from "../../helpers/inventory.mjs";

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

        schema.damageBonus = new fields.NumberField({...requiredInteger, initial: 0});

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
                // A key of CONFIG.LORD_OF_THE_MYSTERIES.damageTypes ("physical", "fire", ...).
                damageType: new fields.StringField({ required: true, initial: "physical" }),
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

        // Strength Bonus Calculation
        const strengthDamageBonusTable = CONFIG.LORD_OF_THE_MYSTERIES.strengthDamageBonus;
        const strength = this.attributes.str.total;
        const strengthRow = strengthDamageBonusTable.findLast((r) => strength >= r.strength) ?? strengthDamageBonusTable[0];
        this.damageBonus = strengthRow.bonus;

        // Inventory: slots carried, and -1 Agility per slot over the Strength limit (see helpers/inventory.mjs).
        // This has to happen before movement and defenses, because the Agility penalty lowers both.
        // Only agi.total is lowered; agi.base (what the player types in) is never touched.
        this.carrying = calculateCarrying(this.parent?.items ?? [], this.attributes.str.total);   // display only, not in the schema
        this.attributes.agi.total -= this.carrying.penalty;

        // Worn armor's temporary Agility penalty. Shown in the Corruption column for now, so the
        // breakdown still adds up to the total. Only the prepared value changes; the saved corruption doesn't.
        const armor = this.carrying.armor;
        this.attributes.agi.corruption -= armor.agilityPenalty;
        this.attributes.agi.total -= armor.agilityPenalty;

        // NOTE: Many resources are calculated one sequence at a time. To do this, we must loop through every sequence
        this._prepareResources();

        // Movement in meters (Strength + Agility), halved (rounded up) or stopped by armor that's too heavy,
        // then x3 for feet. The armor rule rounds in meters, so it's applied before the conversion.
        //TODO: Change the multiplication here to depend on the system's distance unit.
        const meters = this.attributes.str.total + this.attributes.agi.total;
        this.movement = armoredMovement(meters, armor.movement) * 3;

        this._prepareDefenseValues();
        this._prepareDamageReduction();

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
        // Armor: the worn suit's armor points (0 without one). Added to Physical below.
        this.defenses.armor = this.carrying?.armor.value ?? 0;
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
     * Damage reduction: the rows typed in on the sheet (damage_resistance) plus the worn armor's.
     * The saved rows are never changed; the totals are display / roll data only:
     *   damageReduction       { physical: 7, fire: 5, ... }  what damage should be reduced by, per type.
     *   armorReductionList    [{ damageType, label, value, source }]  the armor's rows, for a read-only list on the sheet.
     */
    _prepareDamageReduction() {
        const damageTypes = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes;
        // Rows should hold a key ("physical"), but accept a label ("LORD_OF_THE_MYSTERIES.DamageTypes.Physical") too.
        const keyOf = (type) => {
            if (!type) return null;
            if (type in damageTypes) return type;
            return Object.keys(damageTypes).find((key) => damageTypes[key] === type) ?? type;
        };

        const totals = {};
        for (const row of this.damage_resistance ?? []) {
            const key = keyOf(row.damageType);
            if (!key) continue;
            totals[key] = (totals[key] ?? 0) + (row.value ?? 0);
        }

        // Worn armor stacks with what's on the sheet (skin armor, abilities); only one suit counts (see inventory.mjs).
        const armor = this.carrying?.armor;
        this.armorReductionList = Object.entries(armor?.reduction ?? {}).map(([key, value]) => {
            totals[key] = (totals[key] ?? 0) + value;
            return { damageType: key, label: damageTypes[key] ?? key, value, source: armor.name };
        });

        this.damageReduction = totals;   // display only, not in the schema
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