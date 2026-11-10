/**
 * The two ways a character learns a skill over time (helpers/skill-learning.mjs):
 *
 *   Study dialog     (📖 on a skill row)  Log weeks of lessons or research.
 *   Success dialog   (✋ on a skill row)  Record a success with a Sequence ability that teaches by doing
 *                                         (its "Learning by Doing" settings, on the ability sheet).
 *
 * Progress is saved on the actor in system.learning (one entry per skill, by the skill's key, see base-actor.mjs).
 * The skills passed in are { key, uuid, name, level }; a skill with no key is found by its uuid.
 * When a meter fills, the skill's level goes up straight away and a chat message says so.
 */

import { lowerLevel } from "../helpers/skill-associations.mjs";
import { skillLevelLabel } from "../helpers/skill-modifiers.mjs";
import { learningEntryFor, skillRecordUpdate } from "../helpers/skill-data.mjs";
import { skillKeyFor } from "../helpers/skill-registry.mjs";
import { renderTemplateSync } from "../helpers/render.mjs";
import { langSection } from "../helpers/lang.mjs";
import {
  applyStudyWeeks, applySuccess, canTeachTo, inspirationBoost, nextLevel, studyProgressFor, studyWeeksNeeded,
  successesFor, successesNeeded, STUDY_SCHEDULES, WEEKS_PER_MONTH, WEEKS_PER_YEAR,
} from "../helpers/skill-learning.mjs";

const { DialogV2 } = foundry.applications.api;

const LEARNING = "LORD_OF_THE_MYSTERIES.Learning";
const learningText = langSection(LEARNING);

const roundOne = (n) => Math.round(n * 10) / 10;

/**
 * A length of study as readable text: weeks for short ones, then months, then years.
 * @param {number} weeks
 * @returns {string}
 */
export function formatStudyTime(weeks) {
  if (weeks < 9) return learningText("Duration.Weeks", { n: roundOne(weeks) });
  const monthCount = weeks / WEEKS_PER_MONTH;
  if (monthCount < 24) return learningText("Duration.Months", { n: roundOne(monthCount) });
  return learningText("Duration.Years", { n: roundOne(weeks / WEEKS_PER_YEAR) });
}

/** A meter (0 to 1) as a percent for display. Anything above 0 shows as at least 1%. */
export function meterPercent(progress) {
  if (!(progress > 0)) return 0;
  return Math.max(1, Math.floor(progress * 100));
}

/* -------------------------------------------- */
/*  Shared: reading and saving progress          */
/* -------------------------------------------- */

/**
 * Whether this actor's data model has the system.learning field (added in base-actor.mjs).
 * Without it, Foundry silently drops everything written there, so progress would never save.
 * Shows an error and returns false when it's missing.
 * @param {Actor} actor
 * @returns {boolean}
 */
function canSaveLearning(actor) {
  if (actor.system?.schema?.fields?.learning) return true;
  ui.notifications.error(learningText("NoLearningField"));
  return false;
}

/**
 * A skill's key: the one given, or its uuid's (helpers/skill-registry.mjs).
 * @param {{key?: string, uuid?: string}} skill
 * @returns {string}
 */
function keyOf(skill) {
  return skill.key || skillKeyFor(skill.uuid);
}


/**
 * The update that sets a skill's level (the level the player sees in its dropdown), or {} if the skill has no key.
 * `level` is the level the skill is now rolled at. When a Sequence raises the skill, that raise is taken back off
 * before saving, because it's added again on top: a skill raised one level by a Sequence and studied up to
 * Mastery is saved as Advanced, so it doesn't count the Sequence twice.
 * @param {Actor} actor
 * @param {string} key   The skill's key.
 * @param {string} level
 * @returns {object}
 */
function skillLevelUpdate(actor, key, level) {
  if (!key) return {};
  return skillRecordUpdate(actor, key, { level: lowerLevel(level, actor.system.sequenceSkillSteps?.[key] ?? 0) });
}

/**
 * Save a learning update, and when it raises the Education growth bonus (base-actor.mjs), say so.
 * @param {Actor} actor
 * @param {object} update
 * @returns {Promise<{key: string, data: object, strong: boolean}|null>}  The chat line for it (postLearningMessage),
 *   "Education growth: Education +1 (now +2)", or null when Education didn't grow.
 */
async function updateWithGrowth(actor, update) {
  const before = actor.system.educationGrowth?.bonus ?? 0;
  await actor.update(update);
  const after = actor.system.educationGrowth?.bonus ?? 0;
  if (after <= before) return null;
  return { key: "LORD_OF_THE_MYSTERIES.EducationGrowth.Chat", data: { gain: after - before, total: after }, strong: true };
}

/**
 * Post the chat message for a study or a success (templates/chat/learning.hbs).
 * @param {Actor} actor
 * @param {{key: string, data?: object, strong?: boolean}[]} lines   Lang keys and their values, one paragraph each.
 */
async function postLearningMessage(actor, lines) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: renderTemplateSync("systems/lotm/templates/chat/learning.hbs", { lines }),
  });
}

/* -------------------------------------------- */
/*  Study (slow growth)                          */
/* -------------------------------------------- */

/**
 * Open the Study dialog for a skill.
 * @param {Actor} actor
 * @param {{key?: string, uuid: string, name: string, level: string}} skill
 *   `level` is the level the skill is rolled at (a related skill may have raised it): study goes on from there.
 */
export async function openStudyDialog(actor, skill) {
  if (!canSaveLearning(actor)) return;
  const next = nextLevel(skill.level);
  if (!next) {
    ui.notifications.info(learningText("AtMax", { skill: skill.name }));
    return;
  }

  const key = keyOf(skill);
  const inspiration = actor.system.attributes.ins?.total ?? 0;
  // Sequences with this skill in their Knowledge and Training list: one schedule faster each (base-actor.mjs).
  const extraSteps = actor.system.sequenceTrainingSteps?.[key] ?? 0;
  const entry = actor.system.learningByKey?.[key];
  const progress = studyProgressFor(entry, skill.level);

  const content = renderTemplateSync("systems/lotm/templates/dialogs/study.hbs", {
    level: skillLevelLabel(skill.level),
    next: skillLevelLabel(next),
    percent: meterPercent(progress),
    // The schedule dropdown, fastest first. "3-5 days a week" is picked to start with.
    schedules: [...STUDY_SCHEDULES].reverse()
      .map((key) => ({ key, label: `${LEARNING}.Schedules.${key}`, selected: key === "often" })),
    inspiration,
    boost: inspirationBoost(inspiration),
    extraSteps,
  });

  /** What the form currently says, cleaned up. */
  const readForm = (form) => ({
    weeks: Math.max(1, Math.floor(Number(form.elements.weeks.value) || 1)),
    schedule: form.elements.schedule.value,
    selfStudy: form.elements.selfStudy.checked,
  });

  /** The line at the bottom: how long this step takes, and where these weeks would get the character. */
  const updatePreview = (form) => {
    const choice = readForm(form);
    const full = studyWeeksNeeded(skill.level, { ...choice, inspiration, extraSteps });
    const result = applyStudyWeeks({ level: skill.level, progress, inspiration, extraSteps, ...choice });
    const outcome = result.gained.length
      ? learningText("PreviewLevelUp", { level: skillLevelLabel(result.level) })
      : learningText("PreviewProgress", { percent: meterPercent(result.progress), next: skillLevelLabel(next) });
    form.querySelector(".study-preview").textContent =
      `${learningText("PreviewStep", { from: skillLevelLabel(skill.level), to: skillLevelLabel(next), time: formatStudyTime(full) })} ${outcome}`;
  };

  const choice = await DialogV2.wait({
    window: { title: learningText("Title", { skill: skill.name }), icon: "fa-solid fa-book-open" },
    classes: ["lotm", "study-dialog"],
    position: { width: 400 },
    content,
    buttons: [
      {
        action: "study",
        label: learningText("Log"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => readForm(button.form),
      },
      { action: "cancel", label: learningText("Cancel"), icon: "fa-solid fa-xmark" },
    ],
    // Keep the preview line up to date while the player changes the form.
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      if (!form) return;
      updatePreview(form);
      form.addEventListener("input", () => updatePreview(form));
      form.addEventListener("change", () => updatePreview(form));
    },
    rejectClose: false,
  });

  // Closed, or Cancel (which gives back the string "cancel").
  if (!choice || typeof choice !== "object") return;
  await logStudy(actor, skill, choice);
}

/**
 * Save weeks of study: fill the meter, raise the skill if it fills, and post a chat message.
 * @param {Actor} actor
 * @param {{key?: string, uuid: string, name: string, level: string}} skill
 * @param {{weeks: number, schedule: string, selfStudy: boolean}} choice
 */
export async function logStudy(actor, skill, { weeks, schedule, selfStudy }) {
  const key = keyOf(skill);
  const inspiration = actor.system.attributes.ins?.total ?? 0;
  const extraSteps = actor.system.sequenceTrainingSteps?.[key] ?? 0;
  const { learning, entry } = learningEntryFor(actor, key);

  const result = applyStudyWeeks({
    level: skill.level,
    progress: studyProgressFor(entry, skill.level),
    weeks, schedule, selfStudy, inspiration, extraSteps,
  });

  entry.study = result.progress;
  entry.studyFrom = result.level;
  // A record of every level gained after character creation, and how. The Education growth rule will use it.
  entry.gained.push(...result.gained.map((step) => ({ ...step, source: "study", detail: "" })));

  const update = { "system.learning": learning };
  if (result.gained.length) Object.assign(update, skillLevelUpdate(actor, key, result.level));
  const growthLine = await updateWithGrowth(actor, update);

  // "Studied Melee for 2 week(s) (3-5 days a week). Melee went up to Trained! 12% of the way to Proficient."
  const how = learningText(`Schedules.${schedule}`) + (selfStudy ? `, ${learningText("SelfStudyShort")}` : "");
  const lines = [{ key: `${LEARNING}.Chat.Studied`, data: { skill: skill.name, weeks, how } }];
  for (const step of result.gained) {
    lines.push({ key: `${LEARNING}.Chat.LevelUp`, data: { skill: skill.name, level: skillLevelLabel(step.to) }, strong: true });
  }
  const next = nextLevel(result.level);
  if (next) lines.push({ key: `${LEARNING}.Chat.Progress`, data: { percent: meterPercent(result.progress), next: skillLevelLabel(next) } });
  if (growthLine) lines.push(growthLine);
  await postLearningMessage(actor, lines);
}

/* -------------------------------------------- */
/*  Learning by Doing (fast growth)              */
/* -------------------------------------------- */

/**
 * Open the Success dialog: confirm a success with an ability that teaches this skill.
 * When more than one ability teaches it, the player picks which one the success came from.
 * @param {Actor} actor
 * @param {{key?: string, uuid: string, name: string, level: string}} skill  `level` = the level the skill is rolled at.
 * @param {string[]} abilityUuids  The abilities that teach this skill (from the skill row's data-teachers).
 */
export async function openSuccessDialog(actor, skill, abilityUuids) {
  if (!canSaveLearning(actor)) return;
  const abilities = (await Promise.all(abilityUuids.map((uuid) => fromUuid(uuid).catch(() => null))))
    .filter((ability) => ability?.system?.fastLearning?.enabled);
  if (!abilities.length) return;

  const next = nextLevel(skill.level);
  if (!next) {
    ui.notifications.info(learningText("AtMax", { skill: skill.name }));
    return;
  }

  const entry = actor.system.learningByKey?.[keyOf(skill)];
  const count = successesFor(entry, skill.level);
  const needed = successesNeeded(skill.level);

  const content = renderTemplateSync("systems/lotm/templates/dialogs/learning-success.hbs", {
    count, needed, next: skillLevelLabel(next),
    abilities: abilities.map((ability) => ({ uuid: ability.uuid, name: ability.name })),
    hasChoice: abilities.length > 1,
    isLevelUp: count + 1 >= needed,
    nextCount: count + 1,
  });

  /** Show what counts as a success for the picked ability. */
  const showCondition = (form) => {
    const ability = abilities.find((a) => a.uuid === form.elements.ability.value) ?? abilities[0];
    const condition = ability.system.fastLearning.condition?.trim();
    form.querySelector(".success-condition").textContent = condition
      ? learningText("Fast.ConditionShown", { ability: ability.name, condition })
      : ability.name;
  };

  const abilityUuid = await DialogV2.wait({
    window: { title: learningText("Fast.DialogTitle", { skill: skill.name }), icon: "fa-solid fa-hand-sparkles" },
    classes: ["lotm", "study-dialog"],
    position: { width: 400 },
    content,
    buttons: [
      {
        action: "record",
        label: learningText("Fast.Record"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => button.form.elements.ability.value,
      },
      { action: "cancel", label: learningText("Cancel"), icon: "fa-solid fa-xmark" },
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      if (!form) return;
      showCondition(form);
      form.addEventListener("change", () => showCondition(form));
    },
    rejectClose: false,
  });

  const ability = abilities.find((a) => a.uuid === abilityUuid);
  if (!ability) return;   // closed or cancelled
  await recordSuccess(actor, skill, ability);
}

/**
 * Save one success: add to the count, raise the skill if the count is reached, and post a chat message.
 * @param {Actor} actor
 * @param {{key?: string, uuid: string, name: string, level: string}} skill
 * @param {Item} ability  The ability the success came from.
 */
export async function recordSuccess(actor, skill, ability) {
  const maxLevel = ability.system.fastLearning?.maxLevel ?? "mastery";
  if (!canTeachTo(skill.level, maxLevel)) {
    ui.notifications.warn(learningText("Fast.AtAbilityMax", { ability: ability.name, skill: skill.name, level: skillLevelLabel(maxLevel) }));
    return;
  }

  const key = keyOf(skill);
  const { learning, entry } = learningEntryFor(actor, key);
  const result = applySuccess({ level: skill.level, successes: successesFor(entry, skill.level) });

  entry.successes = result.successes;
  entry.successesFrom = result.level;
  if (result.gained) entry.gained.push({ ...result.gained, source: "ability", detail: ability.name });

  const update = { "system.learning": learning };
  if (result.gained) Object.assign(update, skillLevelUpdate(actor, key, result.level));
  const growthLine = await updateWithGrowth(actor, update);

  // "Recorded a success for Clever Hands with Thief's Hand. 1 of 2 successes toward Proficient."
  const lines = [{ key: `${LEARNING}.Fast.Chat.Success`, data: { skill: skill.name, ability: ability.name } }];
  if (result.gained) {
    lines.push({ key: `${LEARNING}.Chat.LevelUp`, data: { skill: skill.name, level: skillLevelLabel(result.level) }, strong: true });
  }
  const next = nextLevel(result.level);
  if (next && canTeachTo(result.level, maxLevel)) {
    lines.push({ key: `${LEARNING}.Fast.Progress`,
      data: { count: result.successes, needed: successesNeeded(result.level), next: skillLevelLabel(next) } });
  } else if (next) {
    lines.push({ key: `${LEARNING}.Fast.Chat.Maxed`, data: { ability: ability.name, level: skillLevelLabel(maxLevel) } });
  }
  if (growthLine) lines.push(growthLine);
  await postLearningMessage(actor, lines);
}
