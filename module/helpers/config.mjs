export const LORD_OF_THE_MYSTERIES = {};

/**
 * The set of Attributes Scores used within the system.
 * @type {Object}
 */
LORD_OF_THE_MYSTERIES.attributes = {
    str: 'LORD_OF_THE_MYSTERIES.Attributes.Str.long',
    agi: 'LORD_OF_THE_MYSTERIES.Attributes.Agi.long',
    wil: 'LORD_OF_THE_MYSTERIES.Attributes.Wil.long',
    phy: 'LORD_OF_THE_MYSTERIES.Attributes.Phy.long',
    cha: 'LORD_OF_THE_MYSTERIES.Attributes.Cha.long',
    ins: 'LORD_OF_THE_MYSTERIES.Attributes.Ins.long',
    luc: 'LORD_OF_THE_MYSTERIES.Attributes.Luc.long',
    edu: 'LORD_OF_THE_MYSTERIES.Attributes.Edu.long',

};

LORD_OF_THE_MYSTERIES.attributeAbbreviations = {
    str: 'LORD_OF_THE_MYSTERIES.Attributes.Str.abbr',
    agi: 'LORD_OF_THE_MYSTERIES.Attributes.Agi.abbr',
    wil: 'LORD_OF_THE_MYSTERIES.Attributes.Wil.abbr',
    phy: 'LORD_OF_THE_MYSTERIES.Attributes.Phy.abbr',
    cha: 'LORD_OF_THE_MYSTERIES.Attributes.Cha.abbr',
    ins: 'LORD_OF_THE_MYSTERIES.Attributes.Ins.abbr',
    luc: 'LORD_OF_THE_MYSTERIES.Attributes.Luc.abbr',
    edu: 'LORD_OF_THE_MYSTERIES.Attributes.Edu.abbr'
};

LORD_OF_THE_MYSTERIES.resources = {
    hp: 'LORD_OF_THE_MYSTERIES.Attributes.Health.long',
    rp: 'LORD_OF_THE_MYSTERIES.Attributes.Rationality.long',
    lp: 'LORD_OF_THE_MYSTERIES.Attributes.Luck.long',
    spp: 'LORD_OF_THE_MYSTERIES.Attributes.Spirituality.long',

};

LORD_OF_THE_MYSTERIES.resourcesAbbreviations = {
    hp: 'LORD_OF_THE_MYSTERIES.Attributes.Health.abbr',
    sp: 'LORD_OF_THE_MYSTERIES.Attributes.Spirit.abbr',
    rp: 'LORD_OF_THE_MYSTERIES.Attributes.Rationality.abbr',
    lp: 'LORD_OF_THE_MYSTERIES.Attributes.Luck.abbr',
    spp: 'LORD_OF_THE_MYSTERIES.Attributes.Spirituality.abbr',
};

LORD_OF_THE_MYSTERIES.skillLevels = {
    untrained: 'LORD_OF_THE_MYSTERIES.Skill_Level.untrained',
    trained: 'LORD_OF_THE_MYSTERIES.Skill_Level.trained',
    proficient: 'LORD_OF_THE_MYSTERIES.Skill_Level.proficient',
    advanced: 'LORD_OF_THE_MYSTERIES.Skill_Level.advanced',
    mastery: 'LORD_OF_THE_MYSTERIES.Skill_Level.mastery',
    lore: 'LORD_OF_THE_MYSTERIES.Skill_Level.lore',
    grandMaster: 'LORD_OF_THE_MYSTERIES.Skill_Level.grandMaster',
};

LORD_OF_THE_MYSTERIES.skillCategories = {
    arrow: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Arrow',
    astronomy: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Astronomy',
    drug: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Drug',
    fighting: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Fighting',
    firearms: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Firearms',
    historical: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Historical',
    social: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Social',
    languageNorth: 'LORD_OF_THE_MYSTERIES.Skill_Categories.LanguageNorthern',
    languageSouth: 'LORD_OF_THE_MYSTERIES.Skill_Categories.LanguageSouth',
    mechanical: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Mechanical',
    medical: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Medical',
    music: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Music',
    mystical: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Mystical',
    natural: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Natural',
    performance: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Performance',
    psychological: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Psychological',
    reconnaissance: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Reconnaissance',
    writing: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Writing',
    extraordinaryKnowledge: 'LORD_OF_THE_MYSTERIES.Skill_Categories.ExtraordinaryKnowledge'
};

/** How a skill takes part in one of its related-skill categories (see helpers/skill-associations.mjs). */
LORD_OF_THE_MYSTERIES.skillCategoryModes = {
    both: 'LORD_OF_THE_MYSTERIES.SkillAssociation.Modes.both',
    gives: 'LORD_OF_THE_MYSTERIES.SkillAssociation.Modes.gives',
    receives: 'LORD_OF_THE_MYSTERIES.SkillAssociation.Modes.receives',
};

LORD_OF_THE_MYSTERIES.skillAttributes = {
    str: 'LORD_OF_THE_MYSTERIES.Attributes.Str.long',
    agi: 'LORD_OF_THE_MYSTERIES.Attributes.Agi.long',
    cha: 'LORD_OF_THE_MYSTERIES.Attributes.Cha.long',
    ins: 'LORD_OF_THE_MYSTERIES.Attributes.Ins.long',
    luc: 'LORD_OF_THE_MYSTERIES.Attributes.Luc.long',
    edu: 'LORD_OF_THE_MYSTERIES.Attributes.Edu.long',
};

LORD_OF_THE_MYSTERIES.skillCompendiumCategories = {
    str: 'LORD_OF_THE_MYSTERIES.Attributes.Str.long',
    agi: 'LORD_OF_THE_MYSTERIES.Attributes.Agi.long',
    cha: 'LORD_OF_THE_MYSTERIES.Attributes.Cha.long',
    ins: 'LORD_OF_THE_MYSTERIES.Attributes.Ins.long',
    edu: 'LORD_OF_THE_MYSTERIES.Attributes.Edu.long',
    languages: 'Languages'
};

LORD_OF_THE_MYSTERIES.skillsCompendiumId = 'lotm.skills_compendium';

/** The Dodge skill in the Skills compendium (its defense bonus is worked out in base-actor.mjs). */
LORD_OF_THE_MYSTERIES.dodgeSkillUuid = 'Compendium.lotm.skills_compendium.Item.iY814DRe7O6m6NLQ';

/**
 * The skill a spell rolls with when its Skill slot is empty: Occultism, in the Skills compendium
 * (see rollSkillUuid in helpers/action-roll.mjs).
 */
LORD_OF_THE_MYSTERIES.spellSkillUuid = 'Compendium.lotm.skills_compendium.Item.23huemg1lJ4Wk90O';

/**
 * Skills every character has at least this level in, keyed by skill UUID.
 * Rulebook: "Your dodge skill is trained by default." Picking Proficient (with Education) still works.
 */
LORD_OF_THE_MYSTERIES.defaultSkillLevels = {
    [LORD_OF_THE_MYSTERIES.dodgeSkillUuid]: 'trained',
};

LORD_OF_THE_MYSTERIES.skillCompendiumFolders = {
    str: 'Strength',
    agi: 'Agility',
    cha: 'Charisma',
    ins: 'Inspiration',
    edu: 'Education',
    languages: 'Languages'
};

LORD_OF_THE_MYSTERIES.actionTypes = {
    free: 'LORD_OF_THE_MYSTERIES.Action_Type.free',
    attack: 'LORD_OF_THE_MYSTERIES.Action_Type.attack',
    quick: 'LORD_OF_THE_MYSTERIES.Action_Type.quick',
    move: 'LORD_OF_THE_MYSTERIES.Action_Type.move',
    full: 'LORD_OF_THE_MYSTERIES.Action_Type.full',
};

LORD_OF_THE_MYSTERIES.actionCategories = {
    combat: 'LORD_OF_THE_MYSTERIES.Action_Category.combat',
    downTime: 'LORD_OF_THE_MYSTERIES.Action_Category.downtime',
};

LORD_OF_THE_MYSTERIES.damageTypes = {
    physical: 'LORD_OF_THE_MYSTERIES.DamageTypes.Physical',
    curse: 'LORD_OF_THE_MYSTERIES.DamageTypes.Curse',
    fire: 'LORD_OF_THE_MYSTERIES.DamageTypes.Fire',
    cold: 'LORD_OF_THE_MYSTERIES.DamageTypes.Cold',
    holy: 'LORD_OF_THE_MYSTERIES.DamageTypes.Holy',
    lightning: 'LORD_OF_THE_MYSTERIES.DamageTypes.Lightning',
    mental: 'LORD_OF_THE_MYSTERIES.DamageTypes.Mental',
    poison: 'LORD_OF_THE_MYSTERIES.DamageTypes.Poison',
};

LORD_OF_THE_MYSTERIES.commonLanguages = {
    ancientFeysac: "Ancient Feysac",
    loenese: "Loenese",
    intisian: "Intisian",
    feysac: "Faysac",
    highlander: "Highlander",
    lenburg: "Lenburg",
    duntanese: "Duntanese"
};

LORD_OF_THE_MYSTERIES.mysticalLanguages = {
    elvish: "Elvish",
    dragonese: "Dragonese",
    jotun: "Jotun",
    devil: "Devil",
    ancientHermes: "Ancient Hermes",
    hermes: "Hermes",
    death: "Death"
};

LORD_OF_THE_MYSTERIES.strengthDamageBonus = [
    { strength: 0,  bonus: "-2" },
    { strength: 1,  bonus: "-1" },
    { strength: 2,  bonus: "0" },
    { strength: 3,  bonus: "1" },
    { strength: 4,  bonus: "1d2" },
    { strength: 5,  bonus: "1d4" },
    { strength: 6,  bonus: "1d6" },
    { strength: 7,  bonus: "1d8" },
    { strength: 8,  bonus: "1d10" },
    { strength: 9,  bonus: "1d12" },
    { strength: 10, bonus: "2d6" },
    { strength: 11, bonus: "2d8" },
    { strength: 12, bonus: "2d10" },
    { strength: 13, bonus: "2d12" },
    { strength: 14, bonus: "3d8" },
    { strength: 15, bonus: "3d10" },
    { strength: 20, bonus: "3d12" },
    { strength: 25, bonus: "4d10" },
    { strength: 30, bonus: "4d12" },
];
/**
 * How an effect stored on a spell or action is handed out when it's used (system.application.mode,
 * see data/effect/effect.mjs).
 */
LORD_OF_THE_MYSTERIES.effectApplicationModes = {
    targets: 'LORD_OF_THE_MYSTERIES.Effects.Application.Modes.targets',
    self: 'LORD_OF_THE_MYSTERIES.Effects.Application.Modes.self',
    area: 'LORD_OF_THE_MYSTERIES.Effects.Application.Modes.area',
    zone: 'LORD_OF_THE_MYSTERIES.Effects.Application.Modes.zone',
};

/** The shape placed on the scene for an "area" or "zone" effect (system.application.shape). */
LORD_OF_THE_MYSTERIES.effectAreaShapes = {
    circle: 'LORD_OF_THE_MYSTERIES.Effects.Application.Shapes.circle',
    cone: 'LORD_OF_THE_MYSTERIES.Effects.Application.Shapes.cone',
    ray: 'LORD_OF_THE_MYSTERIES.Effects.Application.Shapes.ray',
    rectangle: 'LORD_OF_THE_MYSTERIES.Effects.Application.Shapes.rectangle',
    emanation: 'LORD_OF_THE_MYSTERIES.Effects.Application.Shapes.emanation',
};
