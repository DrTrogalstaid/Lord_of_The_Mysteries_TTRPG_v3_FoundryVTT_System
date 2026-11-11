/**
 * Skill levels on the sheets and in rolls: the bonus each level adds, and its name.
 */

/** The flat bonus (or penalty) each skill level adds to its attribute's total. */
const LEVEL_BONUS = {
  untrained: -4,
  trained: 2,
  proficient: 4,
  advanced: 5,
  mastery: 6,
  lore: 7,
  grandMaster: 8,
};


/**
 * An attribute's total plus the bonus (or penalty) of a skill level.
 * Used by the character sheet and the skill check dialog.
 * @param {string} skillLevel     One of CONFIG.LORD_OF_THE_MYSTERIES.skillLevels' keys. An unknown level adds nothing.
 * @param {number} attributeTotal The linked attribute's total. Pass 0 to isolate
 *                                just the level's own bonus (used by the roll
 *                                dialog to build a separate `N[Label]` term).
 * @returns {number}
 */
export function calculateSkillModifier(skillLevel, attributeTotal) {
  return attributeTotal + (Object.hasOwn(LEVEL_BONUS, skillLevel) ? LEVEL_BONUS[skillLevel] : 0);
}


/**
 * A skill level's name, e.g. "Proficient".
 * @param {string} level   One of CONFIG.LORD_OF_THE_MYSTERIES.skillLevels' keys (anything else is shown as it is).
 * @returns {string}
 */
export function skillLevelLabel(level) {
  return game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[level] ?? level);
}
