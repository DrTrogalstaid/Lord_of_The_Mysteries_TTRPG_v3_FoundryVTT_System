/**
 * The flat bonus/penalty a proficiency level adds on top of an attribute's total.
 * Pulled out of PlayerCharacterSheet (which used to own this as a private static
 * method) so it can be shared with SkillCheckDialog without the two modules
 * importing each other.
 * @param {string} skillLevel     One of CONFIG.LORD_OF_THE_MYSTERIES.skillLevels' keys.
 * @param {number} attributeTotal The linked attribute's total. Pass 0 to isolate
 *                                just the level's own bonus (used by the roll
 *                                dialog to build a separate `N[Label]` term).
 * @returns {number}
 */
export function calculateSkillModifier(skillLevel, attributeTotal) {
  var skillModifier = attributeTotal;

  switch (skillLevel) {
    case "untrained":
      skillModifier -= 4;
      break;
    case "trained":
      skillModifier += 2;
      break;
    case "proficient":
      skillModifier += 4;
      break;
    case "advanced":
      skillModifier += 5;
      break;
    case "mastery":
      skillModifier += 6;
      break;
    case "lore":
      skillModifier += 7;
      break;
    case "grandMaster":
      skillModifier += 8;
      break;
  }
  return skillModifier;
}
