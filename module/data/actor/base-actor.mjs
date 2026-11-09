import LordOfTheMysteriesDataModel from "../base-model.mjs";
import { calculateCarrying, armoredMovement } from "../../helpers/inventory.mjs";
import { calculateSkillModifier } from "../../helpers/skill-modifiers.mjs";
import { raiseLevel } from "../../helpers/skill-associations.mjs";
import { educationGrowth } from "../../helpers/skill-learning.mjs";
import { isSkillKey, isSkillUuid, legacySkillKey } from "../../helpers/skill-keys.mjs";
import { buildSkillRecords, computeSkillLevels, skillTotal } from "../../helpers/skill-records.mjs";
import { skillInfo, skillKeyFor, standardSkillKeys } from "../../helpers/skill-registry.mjs";
import { collectSkillBonuses, skillBonusRows, skillBonusTotal } from "../../effects/skill-bonuses.mjs";
import { activeStatusRules } from "../../effects/status-effects.mjs";
import { combineStatusRules, movementAgility, physicalDefense } from "../../effects/status-math.mjs";
import { syncHealthStatuses } from "../../effects/health-statuses.mjs";
import { syncGrantedEffects } from "../../effects/granted-effects.mjs";
import { collectSkillRaises, isEffectActive } from "../../effects/effect-grants.mjs";
import { syncSanityStatuses } from "../../helpers/sanity.mjs";
import { normalizeDamageType } from "../../helpers/damage-math.mjs";


export default class LordOfTheMysteriesActorBase extends LordOfTheMysteriesDataModel {

    static defineSchema() {
        const fields = foundry.data.fields;
        const requiredInteger = { required: true, nullable: false, integer: true };
        const schema = {};

        // Iterate over resources names and create a new SchemaField for each.
        // Health can go below 0: Dying starts at 0, and death comes at minus Physique (twice that for Beyonders),
        // see effects/health-statuses.mjs. The other resources stop at 0.
        schema.resources = new fields.SchemaField(Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.resources).reduce((obj, resource) => {
            obj[resource] = new fields.SchemaField({
                value: new fields.NumberField({ ...requiredInteger, initial: 0, min: resource === "hp" ? undefined : 0 }),
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
                total: new fields.NumberField({...requiredInteger, initial: 0}),
                // Added to rolls with this attribute, but not to its total (so Spirituality, Health... don't change).
                // 0 unless an Active Effect adds to it, e.g. Spirit Vision: +2 to Inspiration checks.
                // See helpers/check-bonuses.mjs.
                checkBonus: new fields.NumberField({...requiredInteger, initial: 0})
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

        // Damage reduction rows typed in on the sheet (rulebook: Damage reduction). Taken off each hit once, never
        // below 1 damage. Worn armor adds its own (see _prepareDamageReduction). Saved as `damage_resistance` before;
        // migrateData below moves those rows here.
        schema.reductions = new fields.ArrayField(
            new fields.SchemaField({
                // A key of CONFIG.LORD_OF_THE_MYSTERIES.damageReductionTypes: "all", or a damage type ("physical", "fire", ...).
                damageType: new fields.StringField({ required: true, initial: "physical" }),
                value : new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 })
            })
        );

        // Damage resistance rows (rulebook: Damage resistance, Immunity). Resistance takes its type's damage down,
        // all the way to 0 if it's big enough; isImmune means that type does no damage at all.
        schema.resistances = new fields.ArrayField(
            new fields.SchemaField({
                damageType: new fields.StringField({ required: true, initial: "fire" }),
                value: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
                isImmune: new fields.BooleanField({ required: true, initial: false })
            })
        );

        // Quick Dodge (fast / high-speed dodge): true = this creature can dodge bullets, so attacks that are too fast
        // to dodge (defenseTarget "physicalNoEvasion", e.g. firearms) still face its full Physical Defense
        // (helpers/check-results.mjs). An ability's passive effect can turn it on: system.isQuickDodgable Override true.
        schema.isQuickDodgable = new fields.BooleanField({ required: true, initial: false });

        // Health recovery: the wounds were treated with a successful Medicine check. Long Rest heals Physique when
        // true, half Physique when false, then sets it back to false (sheets/player-character-sheet.mjs).
        schema.hasBeenTreated = new fields.BooleanField({ required: true, initial: false });

        // Added to spiritual intuition checks only (Inspiration, DC 25; apps/attribute-check-dialog.mjs).
        // 0 unless an Active Effect adds to it, e.g. Spirit Vision: +2.
        schema.spiritualIntuitionBonus = new fields.NumberField({ ...requiredInteger, initial: 0 });
        
        // Skills: one record per skill the actor has saved, keyed by the skill's key (helpers/skill-keys.mjs):
        //   system.skills.pistol = { uuid, level, analysis, bonus, study }
        // Only what's saved is here. Each time the actor is prepared, every skill it has gets a record (standard skills,
        // skills a Sequence or effect gives, ...) with its levels and totals worked out (prepareBaseData and
        // _prepareSkills below, helpers/skill-records.mjs). Sheets, rolls and Dodge defense all read those.
        // Saved per attribute before (system.skills.agi = [{ skill, level, ... }]); migrateData moves old lists to
        // legacySkills until the world's skill data is migrated (helpers/skill-data.mjs).
        const levelChoices = () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels);
        // Learning a skill over time, an older version of system.learning. Not used any more; kept so no saved data is lost.
        const oldStudy = () => new fields.SchemaField({
            days: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 7, initial: 0 }),
            method: new fields.StringField({ required: true, blank: false, initial: "teacher", choices: ["teacher", "self"] }),
            progress: new fields.NumberField({ required: true, nullable: false, min: 0, max: 1, initial: 0 }),
            studiedLevels: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
        });
        schema.skills = new fields.TypedObjectField(new fields.SchemaField({
            // The skill Item it was saved from. For reference: the key is what finds the skill.
            uuid: new fields.StringField({ required: true, blank: true, initial: "" }),
            // The level the player picked (the dropdown).
            level: new fields.StringField({ required: true, initial: "untrained", choices: levelChoices }),
            // Abilities analyzed toward this skill (Extraordinary Knowledge). Only Education skills count here --
            // other skills' analyses go to a copy on the ability.
            analysis: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
            // Added to this skill's rolls. 0 unless an Active Effect adds to it: system.skills.pistol.bonus  Add  2
            // (effects/skill-bonuses.mjs). Worked out fresh every time, like the attributes' checkBonus.
            bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
            study: oldStudy()
        }), { validateKey: isSkillKey });

        // Skills saved in the old format (lists per attribute), word for word, until the world's skill data is migrated
        // (helpers/skill-data.mjs). Read the same as system.skills in the meantime, so nothing is missing.
        schema.legacySkills = new fields.ArrayField(new fields.SchemaField({
            list: new fields.StringField({ required: true, blank: true, initial: "" }),      // "agi", "edu", ...
            skill: new fields.StringField({ required: true, blank: true, initial: "" }),     // the skill's UUID
            level: new fields.StringField({ required: true, blank: true, initial: "untrained" }),
            analysis: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
            study: oldStudy()
        }));

        // Added to the rolls of every skill in a related-skill category (helpers/skill-associations.mjs). 0 unless an
        // Active Effect adds to it: system.skillCategoryBonuses.firearms  Add  1  (effects/skill-bonuses.mjs).
        schema.skillCategoryBonuses = new fields.SchemaField(Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories).reduce((obj, category) => {
            obj[category] = new fields.NumberField({ ...requiredInteger, initial: 0 });
            return obj;
        }, {}));

        // Learning progress, one entry per skill being learned (helpers/skill-learning.mjs, apps/study-dialog.mjs).
        // Kept apart from `skills` (it used to be wiped by the Character tab's form, which saved whole skill lists).
        schema.learning = new fields.ArrayField(
            new fields.SchemaField({
                // The skill's key ("pistol"). Entries saved before skill keys have its UUID; both are read.
                skill: new fields.StringField({ required: true, blank: false }),
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

        // How the creature looks to Spirit Vision and Death Vision (canvas/spirit-aura.mjs). Both are on the NPC
        // sheet header, and Active Effects can change them (e.g. a red aura while Angry).
        //   isUndead   Death Sight sees it (glowing, even in the dark), and its Death Vision aura is at full strength.
        //   auraColor  Its Spirit Vision aura colour ("#rrggbb"): mood, nature. Empty: the colour shows its Health.
        schema.spirit = new fields.SchemaField({
            isUndead: new fields.BooleanField({ required: true, initial: false }),
            auraColor: new fields.StringField({ required: true, blank: true, initial: "" }),
        });

        return schema;
    }


    /**
     * Runs every time an actor's saved data is loaded, before the fields above check it.
     * Damage reduction rows used to be saved as `damage_resistance` (the name was a translation mix-up: they were
     * always reduction). Copy them to `reductions` until the actor saves its own `reductions`.
     * @override
     */
    static migrateData(source) {
        if (Array.isArray(source.damage_resistance) && !("reductions" in source)) {
            source.reductions = source.damage_resistance;
        }

        // Damage reduction and resistance rows hold a damage type key ("physical"). Older rows saved the sheet's old
        // choice ("Physical") or the full language key; they're read as the key (helpers/damage-math.mjs), and saved
        // that way the next time the actor is.
        const damageTypes = globalThis.CONFIG?.LORD_OF_THE_MYSTERIES?.damageTypes ?? {};
        for (const field of ["reductions", "resistances"]) {
            for (const row of Array.isArray(source[field]) ? source[field] : []) {
                if (row?.damageType) row.damageType = normalizeDamageType(row.damageType, damageTypes);
            }
        }

        // Skills saved per attribute (system.skills.agi = [{ skill, level, analysis, study }, ...]): the lists move to
        // legacySkills word for word, so system.skills only has records keyed by skill. Nothing is converted here:
        // that needs the skill registry, which isn't ready this early. Data preparation reads legacySkills too, and the
        // world's skill migration (helpers/skill-data.mjs) turns them into records and saves them.
        const skills = source.skills;
        if (skills && typeof skills === "object" && !Array.isArray(skills)) {
            const legacy = [];
            for (const [list, entries] of Object.entries(skills)) {
                if (!Array.isArray(entries)) continue;
                for (const entry of entries) {
                    if (!entry?.skill) continue;
                    legacy.push({ list, skill: entry.skill, level: entry.level ?? "untrained", analysis: Number(entry.analysis) || 0,
                        ...(entry.study ? { study: entry.study } : {}) });
                }
                delete skills[list];
            }
            if (legacy.length) source.legacySkills = [...(Array.isArray(source.legacySkills) ? source.legacySkills : []), ...legacy];
        }
        return super.migrateData(source);
    }


    /**
     * Before effects are applied: every skill this actor has gets a record in system.skills, so an effect's change to
     * one (system.skills.pistol.bonus) always has somewhere to go. See helpers/skill-records.mjs for which skills.
     * @override
     */
    prepareBaseData() {
        super.prepareBaseData();
        this._prepareSkillRecords();
    }


    /**
     * Whether this actor has every standard skill (the player sheet's full skill list). NPCs override this: they only
     * have the skills the GM drops on them (actor-npc.mjs).
     * @returns {boolean}
     */
    _includesStandardSkills() {
        return true;
    }


    /**
     * The active effects on this actor, including the ones its Items lend it.
     * @returns {ActiveEffect[]}
     */
    _activeEffects() {
        return [...(this.parent?.allApplicableEffects?.() ?? [])].filter(isEffectActive);
    }


    /**
     * Build system.skills: one record per skill the actor has (buildSkillRecords in helpers/skill-records.mjs), with
     * what the skill Item says (name, picture, attribute, categories, flat modifier) from the skill registry.
     * Display and roll data only: what's saved is untouched.
     *   isBroken  the skill Item can't be found (deleted): listed as missing on the sheets, so it can be removed.
     *   canSave   its attribute has a tab on the player sheet, so its level can be saved (the same rule as dropping).
     */
    _prepareSkillRecords() {
        const hidden = new Set(this.hiddenGrants ?? []);
        const effects = this._activeEffects();

        // Skills an owned Sequence raises or trains (its skill_increase and trainingBonus lists).
        const granted = new Map();   // key -> Sequence names
        for (const item of this.parent?.items ?? []) {
            if (item.type !== "sequence") continue;
            const uuids = [...(item.system.skill_increase ?? []).map((row) => row?.skill_uuid), ...(item.system.trainingBonus ?? [])];
            for (const uuid of uuids) {
                if (!uuid || hidden.has(uuid)) continue;
                const key = skillKeyFor(uuid);
                if (!key) continue;
                const names = granted.get(key) ?? [];
                if (!names.includes(item.name)) names.push(item.name);
                granted.set(key, names);
            }
        }

        // Skills an active effect raises (Skill Increases).
        const raised = new Map();   // key -> effect names
        for (const effect of effects) {
            for (const row of effect.system?.skillIncreases ?? []) {
                if (!row?.skillUuid || !(Number(row.value) > 0)) continue;
                const key = skillKeyFor(row.skillUuid);
                if (!key) continue;
                const names = raised.get(key) ?? [];
                if (!names.includes(effect.name)) names.push(effect.name);
                raised.set(key, names);
            }
        }

        // What's saved comes from the source data, so nothing an effect did can look like a saved skill. If Foundry has
        // already applied the effects' changes (it normally does that after this step), their bonuses are kept.
        const saved = this._source?.skills ?? this.skills ?? {};
        const applied = {};
        for (const [key, record] of Object.entries(this.skills ?? {})) {
            const bonus = (Number(record?.bonus) || 0) - (Number(saved[key]?.bonus) || 0);
            if (bonus) applied[key] = bonus;
        }

        const records = buildSkillRecords({
            saved,
            legacy: this.legacySkills,
            standard: this._includesStandardSkills() ? standardSkillKeys() : [],
            granted,
            raised,
            bonusTargets: [...collectSkillBonuses(effects).targets, ...Object.keys(applied)],
            keyOf: skillKeyFor,
        });
        for (const [key, bonus] of Object.entries(applied)) records[key].bonus = bonus;

        const tabs = CONFIG.LORD_OF_THE_MYSTERIES.skillTabAttributes ?? [];
        for (const record of Object.values(records)) this._describeSkill(record, tabs);
        this.skills = records;
        // Filled in by prepareDerivedData; skillFor uses them for skills the actor has no record for.
        this._skillContext = null;
        this._transientSkills = {};
    }


    /**
     * Fill in what the skill Item says about a record (display and roll data only).
     * @param {object} record
     * @param {string[]} tabs   The player sheet's skill tab attributes.
     */
    _describeSkill(record, tabs) {
        const info = skillInfo(record.key, record.uuid);
        record.isBroken = !info;
        record.uuid = info?.uuid ?? record.uuid ?? "";
        record.name = info?.name ?? "";
        record.img = info?.img ?? "icons/svg/hazard.svg";
        record.attribute = info?.attribute ?? "";
        record.categories = info?.categories ?? [];
        record.flatModifier = info?.flatModifier ?? 0;
        record.canSave = !record.isBroken && tabs.includes(record.attribute);
    }


    /**
     * Everything worked out from the saved data and the actor's Items and effects, in this order (each step uses the
     * ones before it):
     *   skill levels -> learning and Education growth -> attributes -> carrying and armor -> statuses -> resources
     *   -> movement -> skill totals -> defenses -> damage reduction -> per-Sequence calculations (last)
     * Everything set here is display / roll data only, not in the schema.
     * @override
     */
    prepareDerivedData() {
        const sequences = this.parent?.items.filter(i => i.type === "sequence") ?? [];
        const effects = this._activeEffects();

        this._prepareSkillLevels(sequences, effects);
        this._prepareLearning();
        this._prepareAttributes(sequences);
        this._prepareCarrying();

        // Statuses (Loss of Balance, Bound, Disadvantage, ...): what they do to movement and Physical Defense.
        // Each status's settings are in effects/status-effects.mjs, the math in effects/status-math.mjs.
        // Agility itself isn't changed, so Agility checks are unaffected; only movement and defense use these.
        // Display only, not in the schema: { defense: {agility, dodge, modifier, sources}, movement: {agility, sources} }.
        this.statusModifiers = combineStatusRules(activeStatusRules(this.parent));

        // NOTE: Many resources are calculated one sequence at a time. To do this, we must loop through every sequence
        this._prepareResources();
        this._prepareMovement();

        // Every skill's total, now that the attributes are final (after armor and carrying), and its bonuses from
        // effects. Before defenses: Dodge's goes into Dodge defense.
        this._prepareSkillTotals(effects);

        this._prepareDefenseValues();
        this._prepareDamageReduction();

        // NOTE: THIS NEEDS TO BE CALLED LAST
        this._prepareSequenceCalculations(sequences);
    }


    /**
     * Every skill's levels: what Sequences and effects raise, and the player's pick, the learned level and the rolled
     * level of each (helpers/skill-records.mjs). They don't depend on attributes, so they come first: Education
     * growth needs them.
     * @param {Item[]} sequences   The actor's Sequences.
     * @param {ActiveEffect[]} effects   Its active effects.
     */
    _prepareSkillLevels(sequences, effects) {
        // Sequence skill increases: how many levels each owned Sequence raises a skill (its skill_increase rows).
        // Like attribute_gain, it's worked out fresh every time, so removing the Sequence takes the raise away,
        // and the player's own pick in the skill dropdown is never changed.
        // Display only, not in the schema: { [skill key]: levels }. Read with sequenceSkillSteps[key] ?? 0.
        // A raise the GM hid on an NPC (its hiddenGrants list, see actor-npc.mjs) doesn't count. Player characters have no such list.
        this.sequenceSkillSteps = {};
        const hiddenGrants = new Set(this.hiddenGrants ?? []);
        for (const sequence of sequences) {
            for (const { skill_uuid, value } of sequence.system.skill_increase ?? []) {
                if (!skill_uuid || hiddenGrants.has(skill_uuid)) continue;
                const key = skillKeyFor(skill_uuid);
                if (key) this.sequenceSkillSteps[key] = (this.sequenceSkillSteps[key] ?? 0) + (value ?? 0);
            }
        }

        // Active Effects' skill increases (effects/effect-grants.mjs): +levels while the effect is active, each capped at
        // its own "at most" level. Display only, not in the schema: { [skill key]: [{ value, maxLevel, name, effectId }] }.
        // They're temporary, so Education growth below and studying go by the level without them (learnLevel).
        this.effectSkillRaises = collectSkillRaises(effects, skillKeyFor);

        // Sequence Knowledge and Training bonus: skills in a Sequence's trainingBonus list study one schedule
        // faster (helpers/skill-learning.mjs), one step per owned Sequence that lists the skill.
        // Display only, not in the schema: { [skill key]: steps }. Read with sequenceTrainingSteps[key] ?? 0.
        this.sequenceTrainingSteps = {};
        for (const sequence of sequences) {
            for (const uuid of sequence.system.trainingBonus ?? []) {
                const key = uuid ? skillKeyFor(uuid) : "";
                if (key) this.sequenceTrainingSteps[key] = (this.sequenceTrainingSteps[key] ?? 0) + 1;
            }
        }

        // Every skill's levels (helpers/skill-records.mjs): the player's pick, the learned level, the rolled level.
        // They don't depend on attributes, so they're worked out first: Education growth needs them.
        this._skillContext = {
            minimums: CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels ?? {},
            sequenceSteps: this.sequenceSkillSteps,
            effectRaises: this.effectSkillRaises,
        };
        const levels = computeSkillLevels(this.skills, { infoOf: (key) => this.skills[key], ...this._skillContext });
        for (const [key, result] of levels) Object.assign(this.skills[key], result);
    }


    /** Learning progress by skill key, and Education growth from the skills learned to Mastery and above. */
    _prepareLearning() {
        // Learning progress by skill key. Entries saved before skill keys have the skill's UUID instead; they're
        // read the same until the skill migration saves them with keys. Display only: { [skill key]: entry }.
        this.learningByKey = {};
        const learning = [];
        for (const entry of this.learning ?? []) {
            if (!entry?.skill) continue;
            const key = isSkillUuid(entry.skill) ? (skillKeyFor(entry.skill) || legacySkillKey(entry.skill)) : entry.skill;
            this.learningByKey[key] ??= entry;
            learning.push({ ...entry, skill: key });
        }

        // Education growth: +1 Education per 5 skills learned to Mastery, 3 to Lore, 2 to Grand Master
        // (helpers/skill-learning.mjs). Display only, not in the schema: { bonus, tiers: [...] }.
        // A skill counts at the level the character has learned plus their Sequences' raises (no effects, no related skills).
        const skillLevels = new Map();   // skill key -> { own, raised }
        for (const record of Object.values(this.skills)) {
            skillLevels.set(record.key, { own: record.ownLevel, raised: raiseLevel(record.ownLevel, record.sequenceSteps) });
        }
        this.educationGrowth = educationGrowth(learning, skillLevels);
    }


    /**
     * Attribute totals (with Sequence gains and Education growth), whether the actor is a Beyonder, and the Strength
     * damage bonus.
     * @param {Item[]} sequences
     */
    _prepareAttributes(sequences) {
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

        // Beyonder: owns a Sequence. Physical improvement: any Physique gain from a potion (a Sequence's Physique gain,
        // Beyonder Bonus) or from corruption. The Bloodbath, Dying and Bleeding rules check these
        // (effects/rules/), and death comes later for Beyonders (effects/health-statuses.mjs).
        // Display only, not in the schema.
        const physique = this.attributes.phy;
        this.isBeyonder = sequences.length > 0;
        this.hasPhysicalImprovement = (physique.sequence_bonus ?? 0) > 0 || (physique.beyonder_bonus ?? 0) > 0
            || (physique.corruption ?? 0) > 0;

        // Strength Bonus Calculation
        const strengthDamageBonusTable = CONFIG.LORD_OF_THE_MYSTERIES.strengthDamageBonus;
        const strength = this.attributes.str.total;
        const strengthRow = strengthDamageBonusTable.findLast((r) => strength >= r.strength) ?? strengthDamageBonusTable[0];
        this.damageBonus = strengthRow.bonus;
    }


    /**
     * What the actor carries (helpers/inventory.mjs) and what that does to Agility: the carrying penalty and the worn
     * armor's penalty. Before movement and defenses, because the Agility penalties lower both.
     */
    _prepareCarrying() {
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
    }


    /** Movement in feet (Strength + Agility in meters, after armor and statuses, x3). */
    _prepareMovement() {
        const armor = this.carrying.armor;
        // Movement in meters (Strength + Agility), halved (rounded up) or stopped by armor that's too heavy,
        // then x3 for feet. The armor rule rounds in meters, so it's applied before the conversion.
        //TODO: Change the multiplication here to depend on the system's distance unit.
        // Loss of Balance halves the Agility used here (rounded up).
        const meters = this.attributes.str.total + movementAgility(this.attributes.agi.total, this.statusModifiers.movement);
        this.movement = armoredMovement(meters, armor.movement) * 3;
    }


    /**
     * Before the actor is changed: remember its Sanity, so losing control only happens when Sanity drops to 0
     * (not when a new actor that never had its Sanity filled in is edited).
     * @override
     */
    async _preUpdate(changes, options, user) {
        const allowed = await super._preUpdate(changes, options, user);
        if (allowed === false) return false;
        if (foundry.utils.hasProperty(changes, "system.resources.rp.value")) {
            options.lotmSanityBefore = Number(this.resources?.rp?.value) || 0;
        }
    }


    /**
     * After the actor is changed: when its Health changed, turn Bloodbath, Dying and Dead on or off to match
     * (effects/health-statuses.mjs); when its Sanity changed, Indeterminate Madness and Out of Control
     * (helpers/sanity.mjs). Only on the client that made the change, so it happens once.
     * @override
     */
    _onUpdate(changed, options, userId) {
        super._onUpdate(changed, options, userId);
        if (userId !== game.user.id) return;
        if (changed.system?.resources?.hp?.value !== undefined) syncHealthStatuses(this.parent);
        if (changed.system?.resources?.rp?.value !== undefined) {
            syncSanityStatuses(this.parent, { before: options.lotmSanityBefore });
        }
        // An NPC's hidden grants changed: hidden abilities' passive effects stop applying (effects/granted-effects.mjs).
        if (changed.system?.hiddenGrants !== undefined) syncGrantedEffects(this.parent);
    }


    /**
     * Every skill's total and its bonuses from Active Effects (effects/skill-bonuses.mjs). On each record:
     *   attributeTotal  the linked attribute's total
     *   levelBonus      the rolled level's bonus (+2 Trained, -4 Untrained, ...)
     *   bonusRows       the effects' bonuses, one row per effect (the roll window lists these)
     *   bonusTotal      those added together (system.skills.<key>.bonus plus its categories' bonuses)
     *   total           attribute + level bonus + the skill's own modifier + bonuses: the sheet's number
     * @param {ActiveEffect[]} effects   The active effects (_activeEffects).
     */
    _prepareSkillTotals(effects) {
        this._skillContext.collected = collectSkillBonuses(effects);
        for (const record of Object.values(this.skills)) this._finishSkill(record);
    }


    /**
     * Work out one record's totals (see _prepareSkillTotals). Needs the levels to be on the record already.
     * @param {object} record
     */
    _finishSkill(record) {
        const { collected } = this._skillContext ?? {};
        record.attributeTotal = this.attributes?.[record.attribute]?.total ?? 0;
        record.levelBonus = calculateSkillModifier(record.effectiveLevel, 0);
        record.bonusRows = skillBonusRows({
            key: record.key,
            categories: (record.categories ?? []).map((membership) => membership.category),
            collected,
            skillTotal: record.bonus,
            categoryTotals: this.skillCategoryBonuses,
        });
        record.bonusTotal = skillBonusTotal(record.bonusRows);
        record.total = skillTotal({
            attributeTotal: record.attributeTotal,
            levelBonus: record.levelBonus,
            flatModifier: record.flatModifier,
            bonus: record.bonusTotal,
        });
    }


    /**
     * A skill as this actor rolls it: its record from system.skills, with levels and totals.
     * A skill the actor doesn't have (an action that uses Melee, on an NPC who was never given Melee) gets a record
     * worked out the same way at Untrained, so starting levels, related skills and effect bonuses still count.
     * Needs the actor to be prepared.
     * @param {string|object} ref   The skill's key, UUID, or the skill Item.
     * @returns {object|null}  The record (see helpers/skill-records.mjs and _finishSkill), or null when it isn't a skill.
     */
    skillFor(ref) {
        const key = skillKeyFor(ref);
        if (!key) return null;
        if (this.skills?.[key]) return this.skills[key];
        if (this._transientSkills?.[key]) return this._transientSkills[key];
        if (!this._skillContext) return null;   // not prepared yet

        const record = buildSkillRecords({ standard: [key], keyOf: skillKeyFor })[key];
        record.isStandard = false;
        record.isTransient = true;
        this._describeSkill(record, CONFIG.LORD_OF_THE_MYSTERIES.skillTabAttributes ?? []);
        // Related skills can raise it, so its level is worked out together with the actor's other skills.
        const levels = computeSkillLevels({ ...this.skills, [key]: record }, {
            infoOf: (k) => (k === key ? record : this.skills[k]), ...this._skillContext,
        });
        Object.assign(record, levels.get(key));
        this._finishSkill(record);
        (this._transientSkills ??= {})[key] = record;
        return record;
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
        // Sanity
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
        // Dodge: the Dodge skill's level bonus (+2 Trained, +4 Proficient, ...), the same table as every other skill,
        // plus its bonuses from Active Effects (system.skills.dodge.bonus, effects/skill-bonuses.mjs).
        // Every character has Dodge at Trained or better (CONFIG.LORD_OF_THE_MYSTERIES.defaultSkillLevels), so
        // a character who has never touched it gets +2. A Sequence or an active effect that raises Dodge raises it too.
        const dodge = this.skillFor(CONFIG.LORD_OF_THE_MYSTERIES.dodgeSkillKey);
        this.defenses.dodge = dodge ? calculateSkillModifier(dodge.effectiveLevel, 0) + (dodge.bonusTotal ?? 0) : 0;
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
     * Damage reduction, resistance and immunity (rulebook: Defense and Dodge Types). The saved rows are never
     * changed; the totals are display / roll data only, used when damage is applied from chat
     * (applyDamageFromMessage and reduceDamage in helpers/action-roll.mjs):
     *   damageReduction       { physical: 7, fire: 5, all: 0, ... }  reduction per type. An "all" row counts for every
     *                         type (and for untyped damage, under "all"). Rows typed in on the sheet plus the worn armor's.
     *   armorReductionList    [{ damageType, label, value, source }]  the armor's rows, for a read-only list on the sheet.
     *   damageResistance      { fire: 5, ... }  resistance per type (the resistance rows that aren't immunities).
     *   damageImmunities      ["poison", ...]   types that do no damage.
     */
    _prepareDamageReduction() {
        const damageTypes = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes;
        // Every total uses the damage type's key (old rows are converted by migrateData), the same as armor and damage
        // rolls (helpers/action-roll.mjs), so applying damage can look each type up directly.
        const reduction = { all: 0 };
        for (const row of this.reductions ?? []) {
            const key = row.damageType;
            if (!key) continue;
            reduction[key] = (reduction[key] ?? 0) + (row.value ?? 0);
        }

        // Worn armor stacks with what's on the sheet (skin armor, abilities); only one suit counts (see inventory.mjs).
        const armor = this.carrying?.armor;
        this.armorReductionList = Object.entries(armor?.reduction ?? {}).map(([key, value]) => {
            reduction[key] = (reduction[key] ?? 0) + value;
            return { damageType: key, label: damageTypes[key] ?? key, value, source: armor.name };
        });

        // "All" counts for every damage type too.
        if (reduction.all) {
            for (const key of Object.keys(damageTypes)) reduction[key] = (reduction[key] ?? 0) + reduction.all;
        }
        this.damageReduction = reduction;   // display only, not in the schema

        const resistance = {};
        const immunities = new Set();
        for (const row of this.resistances ?? []) {
            const key = row.damageType;
            if (!key) continue;
            if (row.isImmune) immunities.add(key);
            else resistance[key] = (resistance[key] ?? 0) + (row.value ?? 0);
        }
        this.damageResistance = resistance;          // display only, not in the schema
        this.damageImmunities = [...immunities];     // display only, not in the schema
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
