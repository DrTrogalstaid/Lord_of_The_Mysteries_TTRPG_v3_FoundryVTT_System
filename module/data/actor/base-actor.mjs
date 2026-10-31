import LordOfTheMysteriesDataModel from "../base-model.mjs";
import { calculateCarrying, armoredMovement } from "../../helpers/inventory.mjs";
import { calculateSkillModifier } from "../../helpers/skill-modifiers.mjs";
import { atLeastLevel, raiseLevel } from "../../helpers/skill-associations.mjs";
import { educationGrowth } from "../../helpers/skill-learning.mjs";
import { activeStatusRules } from "../../effects/status-effects.mjs";
import { combineStatusRules, movementAgility, physicalDefense } from "../../effects/status-math.mjs";

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
                    analysis: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
                    // Learning this skill over time (helpers/skill-study.mjs).
                    study: new fields.SchemaField({
                        // Study days a week (one 2-hour session a day). 0 = not studying it.
                        days: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 7, initial: 0 }),
                        // "teacher" = taught (normal speed), "self" = studying alone (twice as long).
                        method: new fields.StringField({ required: true, blank: false, initial: "teacher", choices: ["teacher", "self"] }),
                        // How far toward the next level, 0 to 1 (0.25 = a quarter of the way).
                        progress: new fields.NumberField({ required: true, nullable: false, min: 0, max: 1, initial: 0 }),
                        // Levels gained by studying, not at character creation. For the Education growth rule later.
                        studiedLevels: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
                    })
                })
            );
            return obj;
        }, {}));

        // Learning progress, one entry per skill being learned (helpers/skill-learning.mjs, apps/study-dialog.mjs).
        // Kept apart from `skills` on purpose: the Character tab saves the whole `skills` lists from its form,
        // and these values aren't in that form, so a form save would wipe them if they lived there.
        const levelChoices = () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels);
        schema.learning = new fields.ArrayField(
            new fields.SchemaField({
                skill: new fields.DocumentUUIDField({ type: "Item", required: true }),
                // Study meter (slow growth): 0 to 1 of the way to the next level, counted from studyFrom.
                study: new fields.NumberField({ required: true, nullable: false, min: 0, max: 1, initial: 0 }),
                studyFrom: new fields.StringField({ required: true, blank: true, initial: "" }),
                // Sequence ability successes (fast growth), counted from successesFrom. Counted separately from study.
                successes: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
                successesFrom: new fields.StringField({ required: true, blank: true, initial: "" }),
                // Every level gained after character creation, and how. For the Education growth rule.
                gained: new fields.ArrayField(new fields.SchemaField({
                    from: new fields.StringField({ required: true, choices: levelChoices }),
                    to: new fields.StringField({ required: true, choices: levelChoices }),
                    source: new fields.StringField({ required: true, initial: "study", choices: ["study", "ability"] }),
                    detail: new fields.StringField({ required: true, blank: true, initial: "" })   // e.g. the ability's name
                }))
            })
        );

        // Money that isn't on the character ("accumulated deposits": a bank account, a safe at home).
        // One balance per currency, in that currency's smallest coin. Cash on the person is in purse / wallet gear.
        schema.storedMoney = new fields.TypedObjectField(
            new fields.NumberField({ ...requiredInteger, min: 0, initial: 0 })
        );

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

        // Sequence skill increases: how many levels each owned Sequence raises a skill (its skill_increase rows).
        // Like attribute_gain, it's worked out fresh every time, so removing the Sequence takes the raise away,
        // and the player's own pick in the skill dropdown is never changed.
        // Display only, not in the schema: { [skill uuid]: levels }. Read with sequenceSkillSteps[uuid] ?? 0.
        // A raise the GM hid on an NPC (its hiddenGrants list, see actor-npc.mjs) doesn't count. Player characters have no such list.
        this.sequenceSkillSteps = {};
        const hiddenGrants = new Set(this.hiddenGrants ?? []);
        for (const sequence of sequences) {
            for (const { skill_uuid, value } of sequence.system.skill_increase ?? []) {
                if (!skill_uuid || hiddenGrants.has(skill_uuid)) continue;
                this.sequenceSkillSteps[skill_uuid] = (this.sequenceSkillSteps[skill_uuid] ?? 0) + (value ?? 0);
            }
        }

        // Sequence Knowledge and Training bonus: skills in a Sequence's trainingBonus list study one schedule
        // faster (helpers/skill-learning.mjs), one step per owned Sequence that lists the skill.
        // Display only, not in the schema: { [skill uuid]: steps }. Read with sequenceTrainingSteps[uuid] ?? 0.
        this.sequenceTrainingSteps = {};
        for (const sequence of sequences) {
            for (const uuid of sequence.system.trainingBonus ?? []) {
                if (!uuid) continue;
                this.sequenceTrainingSteps[uuid] = (this.sequenceTrainingSteps[uuid] ?? 0) + 1;
            }
        }

        // Education growth: +1 Education per 5 skills learned to Mastery, 3 to Lore, 2 to Grand Master
        // (helpers/skill-learning.mjs). Display only, not in the schema: { bonus, tiers: [...] }.
        const minimums = CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels ?? {};
        const skillLevels = new Map();   // skill uuid -> { own, raised }
        for (const list of Object.values(this.skills ?? {})) {
            for (const entry of list ?? []) {
                if (!entry?.skill) continue;
                const own = atLeastLevel(entry.level, minimums[entry.skill]);
                skillLevels.set(entry.skill, { own, raised: raiseLevel(own, this.sequenceSkillSteps[entry.skill]) });
            }
        }
        // A Sequence can raise a skill the character has never touched (no level saved yet).
        for (const uuid of Object.keys(this.sequenceSkillSteps)) {
            if (skillLevels.has(uuid)) continue;
            const own = atLeastLevel("untrained", minimums[uuid]);
            skillLevels.set(uuid, { own, raised: raiseLevel(own, this.sequenceSkillSteps[uuid]) });
        }
        this.educationGrowth = educationGrowth(this.learning ?? [], skillLevels);

        // Attribute Bonus Calculation
        // Including sequence gains so resource calculations are correct.
        for (const [key, attr] of Object.entries(this.attributes)) {
            attr.sequence_bonus = sequences.reduce((sum, seq) =>
                sum + (seq.system.attribute_gain ?? [])
                    .filter(g => g.attribute_name === key)
                    .reduce((s, g) => s + (g.value ?? 0), 0), 0);   // display only, not in the schema
            attr.growth_bonus = key === "edu" ? this.educationGrowth.bonus : 0;   // display only, not in the schema
            attr.total = (attr.base ?? 0) + (attr.beyonder_bonus ?? 0)
                    + (attr.corruption ?? 0) + attr.sequence_bonus + attr.growth_bonus;
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
        this.attributes.agi.total -= this._carryingAgilityPenalty();

        // Worn armor's temporary Agility penalty. Shown in the Corruption column for now, so the
        // breakdown still adds up to the total. Only the prepared value changes; the saved corruption doesn't.
        const armor = this.carrying.armor;
        this.attributes.agi.corruption -= armor.agilityPenalty;
        this.attributes.agi.total -= armor.agilityPenalty;

        // Statuses (Loss of Balance, Bound, Disadvantage, ...): what they do to movement and Physical Defense.
        // Each status's settings are in effects/status-effects.mjs, the math in effects/status-math.mjs.
        // Agility itself isn't changed, so Agility checks are unaffected; only movement and defense use these.
        // Display only, not in the schema: { defense: {agility, dodge, modifier, sources}, movement: {agility, sources} }.
        this.statusModifiers = combineStatusRules(activeStatusRules(this.parent));

        // NOTE: Many resources are calculated one sequence at a time. To do this, we must loop through every sequence
        this._prepareResources();

        // Movement in meters (Strength + Agility), halved (rounded up) or stopped by armor that's too heavy,
        // then x3 for feet. The armor rule rounds in meters, so it's applied before the conversion.
        //TODO: Change the multiplication here to depend on the system's distance unit.
        // Loss of Balance halves the Agility used here (rounded up).
        const meters = this.attributes.str.total + movementAgility(this.attributes.agi.total, this.statusModifiers.movement);
        this.movement = armoredMovement(meters, armor.movement) * 3;

        this._prepareDefenseValues();
        this._prepareDamageReduction();

        // NOTE: THIS NEEDS TO BE CALLED LAST
        this._prepareSequenceCalculations(sequences);

    }


    /**
     * Agility lost for carrying more than Strength allows (whole slots over the limit, see helpers/inventory.mjs).
     * NPCs override this to 0 (actor-npc.mjs), so the GM never has to manage their gear.
     * @returns {number}
     */
    _carryingAgilityPenalty() {
        return this.carrying.penalty;
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
        // Dodge: the Dodge skill's level bonus (+2 Trained, +4 Proficient, ...), the same table as every other skill.
        // Every character has Dodge at Trained or better (CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels), so
        // a character who has never touched it gets +2. (Before, that case gave 0, and a saved "untrained" gave -4.)
        const dodgeUuid = CONFIG.LORD_OF_THE_MYSTERIES.dodgeSkillUuid;
        const dodgeEntry = (this.skills.agi ?? []).find((entry) => entry.skill === dodgeUuid);
        const dodgeLevel = raiseLevel(
            atLeastLevel(dodgeEntry?.level ?? "untrained", CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels?.[dodgeUuid]),
            this.sequenceSkillSteps?.[dodgeUuid] ?? 0   // a Sequence that raises Dodge raises the defense too
        );
        this.defenses.dodge = calculateSkillModifier(dodgeLevel, 0);
        // Physical: Agility + Armor + Dodge + 10. Statuses can halve or remove the Agility and Dodge parts, or lower
        // them (Disadvantage), see physicalDefense in effects/status-math.mjs. The Dodge value above isn't changed.
        this.defenses.physical = physicalDefense({
            agility: this.attributes.agi.total,
            armor: this.defenses.armor,
            dodge: this.defenses.dodge,
            defense: this.statusModifiers?.defense,
        });
        // Will
        this.defenses.will = (this.attributes.wil.total + 10);
        // Physique
        this.defenses.physique = (this.attributes.phy.total + 10);
    }


    /**
     * Damage reduction: the rows typed in on the sheet (damage_resistance) plus the worn armor's.
     * The saved rows are never changed; the totals are display / roll data only:
     *   damageReduction       { physical: 7, fire: 5, ... }  what damage should be reduced by, per type. Used when
     *                         damage is applied from chat (applyDamageFromMessage in helpers/action-roll.mjs).
     *   armorReductionList    [{ damageType, label, value, source }]  the armor's rows, for a read-only list on the sheet.
     */
    _prepareDamageReduction() {
        const damageTypes = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes;
        // Rows should hold a key ("physical"). The sheet's dropdown saves "Physical" (its language key), and older
        // rows may hold the full label key ("LORD_OF_THE_MYSTERIES.DamageTypes.Physical"), so those are matched too.
        // Every total uses the lower-case key, the same as armor and damage rolls (helpers/action-roll.mjs), so
        // applying damage can look each type up directly.
        const keyOf = (type) => {
            if (!type) return null;
            if (type in damageTypes) return type;
            const lower = String(type).toLowerCase();
            return Object.keys(damageTypes).find((key) =>
                key === lower
                || damageTypes[key] === type
                || damageTypes[key].split(".").pop().toLowerCase() === lower
            ) ?? type;
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