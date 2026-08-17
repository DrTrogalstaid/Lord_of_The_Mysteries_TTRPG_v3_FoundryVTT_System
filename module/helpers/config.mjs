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
    writing: 'LORD_OF_THE_MYSTERIES.Skill_Categories.Writing'
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

/**
 * The collection id (package id + pack name) of the compendium that holds all Skill items.
 */
LORD_OF_THE_MYSTERIES.skillsCompendiumId = 'lotm.skills_compendium';

/**
 * Maps each system.skills bucket to the name of the Folder that holds those skills inside
 * the skills_compendium pack, so the character sheet can list every skill in that folder
 * without needing them individually dragged on first. Must match the folder names in
 * packs/skills_compendium exactly (case-sensitive). Categories without a folder here (e.g.
 * "luc", which has no in-compendium skill list) are simply skipped.
 */
LORD_OF_THE_MYSTERIES.skillCompendiumFolders = {
    str: 'Strength',
    agi: 'Agility',
    cha: 'Charisma',
    ins: 'Inspiration',
    edu: 'Education',
    languages: 'Languages'
};

LORD_OF_THE_MYSTERIES.actionTypes = {
    free: 'LORD_OF_THE_MYSTERIES.Skill_Level.free',
    attack: 'LORD_OF_THE_MYSTERIES.Skill_Level.attack',
    quick: 'LORD_OF_THE_MYSTERIES.Skill_Level.quick',
    move: 'LORD_OF_THE_MYSTERIES.Skill_Level.move',
    full: 'LORD_OF_THE_MYSTERIES.Skill_Level.full',
};
