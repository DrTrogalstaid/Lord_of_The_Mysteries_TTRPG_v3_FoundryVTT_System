/**
 * Related-skill improvement (rulebook ch. IV, "Subdivided skill correlation improvement").
 *
 * When one skill in a category reaches Advanced, every other skill in that category goes up one level.
 * At Mastery (or higher) they go up two. A skill raised this way never goes above Proficient, and a
 * skill the character already trained higher on their own is left alone.
 *
 * Example (Fighting): Sword is Advanced -> Melee goes Untrained -> Trained.
 *                     Sword is Mastery  -> Melee goes Untrained -> Proficient.
 *
 * A skill can be in several categories (Psychology is in Social, Psychological and Reconnaissance).
 * When more than one category raises it, the biggest raise wins; they don't add up.
 *
 * Each membership has a mode, for the rulebook's one-way links:
 *   "both"     raises the others and is raised by them (most skills)
 *   "gives"    raises the others, but isn't raised by them   (Singing -> Music Theory)
 *   "receives" is raised by the others, but raises nothing   (Biology in Medical)
 *
 * Plain data in / data out (no game / CONFIG), so it can be unit tested under Node like granted-skills.mjs.
 * The levels the player picks are never changed: this only works out the level a skill is *rolled* at.
 */

/** Skill levels from lowest to highest. Must match the keys of CONFIG.LORD_OF_THE_MYSTERIES.skillLevels. */
export const SKILL_LEVEL_ORDER = ["untrained", "trained", "proficient", "advanced", "mastery", "lore", "grandMaster"];

/**
 * How many levels a skill at each level raises the rest of its category.
 * Levels not listed here raise nothing. Change these numbers if your table reads the rule differently.
 */
export const ASSOCIATION_STEPS = {
  advanced: 1,
  mastery: 2,
  lore: 2,
  grandMaster: 2,
};

/** A skill raised by its category never goes above this level. */
export const ASSOCIATION_CAP = "proficient";

/** The three membership modes (see the top of this file). */
export const CATEGORY_MODES = ["both", "gives", "receives"];

/**
 * Position of a level in SKILL_LEVEL_ORDER (untrained = 0). Unknown levels count as untrained.
 * @param {string} level
 * @returns {number}
 */
export function levelIndex(level) {
  const index = SKILL_LEVEL_ORDER.indexOf(level);
  return index < 0 ? 0 : index;
}

/**
 * The higher of two levels. Used for skills every character starts with (Dodge is always at least Trained).
 * @param {string} level      The level the player picked.
 * @param {string} [minimum]  The lowest the skill can be; nothing (undefined) means no minimum.
 * @returns {string}
 */
export function atLeastLevel(level, minimum) {
  if (!minimum) return level ?? "untrained";
  return levelIndex(level) >= levelIndex(minimum) ? (level ?? "untrained") : minimum;
}

/**
 * A level moved up some steps (a Sequence's skill increase), stopping at Grand Master.
 * @param {string} level
 * @param {number} [steps=0]
 * @returns {string}
 */
export function raiseLevel(level, steps = 0) {
  const index = Math.min(levelIndex(level) + Math.max(0, steps), SKILL_LEVEL_ORDER.length - 1);
  return SKILL_LEVEL_ORDER[index];
}

/**
 * A level moved down some steps, stopping at Untrained. Used to take a Sequence's raise back off a level,
 * so a level learned while the Sequence was raising the skill is saved as the character's own level.
 * @param {string} level
 * @param {number} [steps=0]
 * @returns {string}
 */
export function lowerLevel(level, steps = 0) {
  return SKILL_LEVEL_ORDER[Math.max(0, levelIndex(level) - Math.max(0, steps))];
}

/**
 * A skill's category memberships, read from its system data.
 * Understands both the current `categories` list and the old single `category` string
 * (compendium index entries aren't migrated, so they can still have the old field).
 * @param {object} system  A skill Item's system data, or a compendium index entry's `system`.
 * @returns {{category: string, mode: string}[]}
 */
export function skillCategoriesOf(system) {
  const result = [];
  const list = Array.isArray(system?.categories) ? system.categories : [];

  for (const membership of list) {
    if (!membership?.category) continue;
    const mode = CATEGORY_MODES.includes(membership.mode) ? membership.mode : "both";
    result.push({ category: membership.category, mode });
  }

  // Old data: one category, no mode.
  if (result.length === 0 && system?.category) {
    result.push({ category: system.category, mode: "both" });
  }
  return result;
}

/**
 * Work out the level every skill is rolled at, after related-skill improvement.
 *
 * @param {{uuid: string, name: string, level: string, categories: {category: string, mode: string}[]}[]} skills
 *   Every skill the character has, with the level the player picked.
 * @returns {Map<string, {level: string, raised: boolean, sources: {uuid: string, name: string, level: string, category: string}[]}>}
 *   Keyed by skill uuid. `level` is the level to roll at; `raised` is true when that's higher than the
 *   player's own pick; `sources` are the skills that raised it (empty when not raised).
 */
export function computeAssociatedLevels(skills) {
  // Step 1: for each category, which skills in it are high enough to raise the others.
  //   raisersByCategory = { fighting: [ { uuid, name, level, category, steps }, ... ], ... }
  const raisersByCategory = {};
  for (const skill of skills) {
    const steps = ASSOCIATION_STEPS[skill.level] ?? 0;
    if (steps === 0) continue;

    for (const { category, mode } of skill.categories ?? []) {
      if (mode === "receives") continue;   // this skill can't raise others in this category
      if (!raisersByCategory[category]) raisersByCategory[category] = [];
      raisersByCategory[category].push({ uuid: skill.uuid, name: skill.name, level: skill.level, category, steps });
    }
  }

  // Step 2: for each skill, find the biggest raise from any of its categories.
  const cap = levelIndex(ASSOCIATION_CAP);
  const results = new Map();

  for (const skill of skills) {
    const own = levelIndex(skill.level);
    let bestSteps = 0;
    let sources = new Map();   // uuid -> raiser; a Map so a skill sharing two categories is only listed once

    for (const { category, mode } of skill.categories ?? []) {
      if (mode === "gives") continue;      // this skill can't be raised in this category

      for (const raiser of raisersByCategory[category] ?? []) {
        if (raiser.uuid === skill.uuid) continue;   // a skill doesn't raise itself

        if (raiser.steps > bestSteps) {
          // A bigger raise than anything found so far: it replaces the earlier ones.
          bestSteps = raiser.steps;
          sources = new Map([[raiser.uuid, raiser]]);
        } else if (raiser.steps === bestSteps && !sources.has(raiser.uuid)) {
          // Same size raise from another skill: list it too.
          sources.set(raiser.uuid, raiser);
        }
      }
    }

    // Already at or above the cap on its own: nothing to add. Otherwise add the raise, but stop at the cap.
    const target = own >= cap ? own : Math.min(own + bestSteps, cap);
    const raised = target > own;
    results.set(skill.uuid, {
      level: SKILL_LEVEL_ORDER[target],
      raised,
      sources: raised ? [...sources.values()] : [],
    });
  }

  return results;
}
