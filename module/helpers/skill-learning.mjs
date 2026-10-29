/**
 * Learning skills over time (rulebook ch. IV, "Skill Growth").
 *
 * Two kinds of progress, kept apart because the rulebook says fast (potion) growth doesn't count
 * toward slow growth:
 *
 *   Study   (slow growth)  Weeks of lessons or research fill a meter. The meter is a fraction (0.5 = halfway),
 *                          so the character can change how often they study partway through.
 *   Successes (fast growth) Sequence abilities that teach by doing ("each challenging theft raises a skill").
 *                          Each success counts 1; the next level needs 1, 2, 3, 4, 5, 6 of them.
 *
 * Both meters remember which level they started from (studyFrom / successesFrom). If the skill's level
 * changes some other way (the GM changes the dropdown, a related skill raises it), the old progress was
 * toward a level the character already has, so it counts as 0.
 *
 * Plain data in / data out (no game / CONFIG), so it can be unit tested under Node.
 */

import { SKILL_LEVEL_ORDER, levelIndex } from "./skill-associations.mjs";

export const WEEKS_PER_MONTH = 52 / 12;
export const WEEKS_PER_YEAR = 52;
const months = (n) => n * WEEKS_PER_MONTH;
const years = (n) => n * WEEKS_PER_YEAR;

/** Study schedules, slowest first. Each session is at least 2 hours of new, useful lessons or research. */
export const STUDY_SCHEDULES = ["weekly", "often", "daily"];

/**
 * Weeks of study (with a mentor) for each step up, per schedule:
 *   index 0 = Untrained -> Trained, 1 = Trained -> Proficient, ... 5 = Lore -> Grand Master.
 */
export const STUDY_WEEKS = {
  daily:  [1,         months(1), months(3),  months(6), years(1),   years(5)],    // 6-7 days a week
  often:  [2,         months(2), months(5),  months(8), years(1.5), years(7)],    // 3-5 days a week
  weekly: [months(1), months(5), months(10), years(2),  years(5),   years(10)],   // 1-2 days a week
};

/** Every this much Inspiration moves the character one schedule faster (1-2 days studies like 3-5, and so on). */
export const INSPIRATION_PER_STEP = 6;

/** Studying alone, with no mentor, takes this many times as long. */
export const SELF_STUDY_MULTIPLIER = 2;

/** Rounding slack, so 0.99999999 counts as a full meter. */
const EPSILON = 1e-9;

/**
 * The level after this one, or null at Grand Master.
 * @param {string} level
 * @returns {string|null}
 */
export function nextLevel(level) {
  return SKILL_LEVEL_ORDER[levelIndex(level) + 1] ?? null;
}

/**
 * How many weeks of study the next step up takes.
 *
 * Inspiration: each 6 moves the schedule one row faster. A Sequence's Knowledge and Training bonus
 * (its trainingBonus list) moves it one more row for those skills. Past the fastest row, it's half the
 * 6-7 days time, and that's as fast as it gets.
 *
 * @param {string} level  The level the character is at now.
 * @param {object} options
 * @param {string}  options.schedule      A key of STUDY_WEEKS.
 * @param {boolean} [options.selfStudy]   No mentor: twice as long.
 * @param {number}  [options.inspiration] The character's Inspiration total.
 * @param {number}  [options.extraSteps]  More rows faster, e.g. 1 for each Sequence with this skill in its trainingBonus.
 * @returns {number}  Weeks. Infinity at Grand Master (nothing left to learn).
 */
export function studyWeeksNeeded(level, { schedule, selfStudy = false, inspiration = 0, extraSteps = 0 }) {
  const step = levelIndex(level);
  if (!nextLevel(level)) return Infinity;

  const boost = Math.floor(Math.max(0, inspiration) / INSPIRATION_PER_STEP) + Math.max(0, extraSteps);
  const row = Math.max(0, STUDY_SCHEDULES.indexOf(schedule)) + boost;

  const weeks = row < STUDY_SCHEDULES.length
    ? STUDY_WEEKS[STUDY_SCHEDULES[row]][step]
    : STUDY_WEEKS.daily[step] / 2;   // faster than 6-7 days a week: half that time, no faster

  return selfStudy ? weeks * SELF_STUDY_MULTIPLIER : weeks;
}

/**
 * How many rows faster the character studies because of their Inspiration (for showing in the dialog).
 * @param {number} inspiration
 * @returns {number}
 */
export function inspirationBoost(inspiration) {
  return Math.floor(Math.max(0, inspiration) / INSPIRATION_PER_STEP);
}

/**
 * A skill's study meter (0 to 1) toward the level after `level`.
 * Progress saved from a different level doesn't count (see the top of this file).
 * @param {{study?: number, studyFrom?: string}|undefined} entry  The skill's system.learning entry.
 * @param {string} level  The level the skill is at now.
 * @returns {number}
 */
export function studyProgressFor(entry, level) {
  if (!entry || entry.studyFrom !== level) return 0;
  return entry.study ?? 0;
}

/**
 * Add weeks of study. Weeks left over after a level-up carry on toward the next level, at that level's pace.
 *
 * Example: Untrained, 6-7 days a week, 6 weeks. Untrained -> Trained takes 1 week (5 left);
 * Trained -> Proficient takes about 4.3 weeks (about 0.7 left); that 0.7 is ~5% of the 13 weeks to Advanced.
 *
 * @param {object} params
 * @param {string}  params.level         The level now.
 * @param {number}  [params.progress=0]  The study meter now (0 to 1).
 * @param {number}  params.weeks         Weeks studied.
 * @param {string}  params.schedule
 * @param {boolean} [params.selfStudy]
 * @param {number}  [params.inspiration]
 * @param {number}  [params.extraSteps]  See studyWeeksNeeded.
 * @returns {{level: string, progress: number, gained: {from: string, to: string}[]}}
 *   The new level and meter, and each level-up on the way.
 */
export function applyStudyWeeks({ level, progress = 0, weeks, schedule, selfStudy = false, inspiration = 0, extraSteps = 0 }) {
  let current = level;
  let meter = progress;
  let weeksLeft = Math.max(0, weeks);
  const gained = [];

  while (weeksLeft > EPSILON && nextLevel(current)) {
    const needed = studyWeeksNeeded(current, { schedule, selfStudy, inspiration, extraSteps });
    const toFinish = (1 - meter) * needed;   // weeks still missing for this step

    if (weeksLeft + EPSILON >= toFinish) {
      // Enough to finish this step: level up, and keep going with what's left.
      weeksLeft -= toFinish;
      const to = nextLevel(current);
      gained.push({ from: current, to });
      current = to;
      meter = 0;
    } else {
      // Not enough: fill the meter part of the way.
      meter += weeksLeft / needed;
      weeksLeft = 0;
    }
  }

  return { level: current, progress: nextLevel(current) ? meter : 0, gained };
}

/**
 * Successes a Sequence ability needs for the next step up: 1 to reach Trained, 2 to reach Proficient,
 * 3 to reach Advanced, 4 to reach Mastery, and so on ("2, 3 and 4 times ... by analogy").
 * @param {string} level  The level now.
 * @returns {number}  Infinity at Grand Master.
 */
export function successesNeeded(level) {
  return nextLevel(level) ? levelIndex(level) + 1 : Infinity;
}

/**
 * A skill's success count toward the level after `level`. Counts saved from a different level don't count.
 * @param {{successes?: number, successesFrom?: string}|undefined} entry  The skill's system.learning entry.
 * @param {string} level
 * @returns {number}
 */
export function successesFor(entry, level) {
  if (!entry || entry.successesFrom !== level) return 0;
  return entry.successes ?? 0;
}

/**
 * Whether an ability that teaches up to `maxLevel` can still raise a skill that's at `level`.
 * @param {string} level
 * @param {string} maxLevel
 * @returns {boolean}
 */
export function canTeachTo(level, maxLevel) {
  const next = nextLevel(level);
  return !!next && levelIndex(next) <= levelIndex(maxLevel);
}

/**
 * Whether an ability's Learning by Doing covers a skill: the skill is listed on the ability by itself,
 * or it's in one of the categories the ability lists.
 * @param {{skills?: string[], categories?: string[]}} fastLearning  The ability's system.fastLearning.
 * @param {{uuid: string, categories?: {category: string}[]}} skill    A skill, with its category memberships.
 * @returns {boolean}
 */
export function abilityTeaches(fastLearning, skill) {
  if ((fastLearning.skills ?? []).includes(skill.uuid)) return true;
  const taught = new Set(fastLearning.categories ?? []);
  return (skill.categories ?? []).some((membership) => taught.has(membership.category));
}

/**
 * Education growth (rulebook ch. IV, "Educational growth"): Education can go past its usual limit.
 *   every 5 skills that reach Mastery       -> Education +1
 *   every 3 skills that reach Lore          -> Education +1
 *   every 2 skills that reach Grand Master  -> Education +1
 * Only levels reached by learning after character creation count (study or Learning by Doing, saved in
 * system.learning's `gained` lists), not ones picked at creation or set by hand in the dropdown.
 */
export const EDUCATION_GROWTH = [
  { level: "mastery",     per: 5 },
  { level: "lore",        per: 3 },
  { level: "grandMaster", per: 2 },
];

/**
 * Work out the Education growth bonus.
 *
 * A skill counts toward a tier when either:
 *   - it has a recorded level-up *to* that level (study or Learning by Doing), and it's still at that level or
 *     higher now (so when the GM undoes a level-up with the dropdown, it stops counting). A skill picked at
 *     Mastery at creation and later studied to Lore counts toward Lore, not Mastery.
 *   - or a Sequence's skill increase is what lifts it to that level (the character's own level is below it,
 *     the raised level isn't). The rule counts potion learning too.
 *
 * @param {{skill: string, gained?: {to: string}[]}[]} learning  The actor's system.learning.
 * @param {Map<string, {own: string, raised: string}>} skills  Skill uuid -> the character's own level and
 *   the level after Sequence increases.
 * @returns {{bonus: number, tiers: {level: string, per: number, count: number, bonus: number}[]}}
 */
export function educationGrowth(learning, skills) {
  const tiers = EDUCATION_GROWTH.map(({ level, per }) => {
    const tier = levelIndex(level);
    const counted = new Set();   // a skill counts once per tier, even if it got there two ways

    // Learned to this level.
    for (const entry of learning ?? []) {
      const reached = (entry.gained ?? []).some((step) => step.to === level);
      const stillThere = levelIndex(skills.get(entry.skill)?.raised) >= tier;
      if (reached && stillThere) counted.add(entry.skill);
    }

    // Raised to this level by a Sequence.
    for (const [uuid, { own, raised }] of skills) {
      if (levelIndex(own) < tier && levelIndex(raised) >= tier) counted.add(uuid);
    }

    const count = counted.size;
    return { level, per, count, bonus: Math.floor(count / per) };
  });
  return { bonus: tiers.reduce((sum, tier) => sum + tier.bonus, 0), tiers };
}

/**
 * Add one success. When the count reaches what the level needs, the skill goes up and the count starts over.
 * @param {{level: string, successes?: number}} params
 * @returns {{level: string, successes: number, gained: {from: string, to: string}|null}}
 */
export function applySuccess({ level, successes = 0 }) {
  const next = nextLevel(level);
  if (!next) return { level, successes: 0, gained: null };
  const count = successes + 1;
  if (count >= successesNeeded(level)) return { level: next, successes: 0, gained: { from: level, to: next } };
  return { level, successes: count, gained: null };
}
