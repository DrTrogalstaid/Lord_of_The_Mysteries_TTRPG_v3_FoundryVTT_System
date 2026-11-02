/**
 * The two ways a character learns a skill over time (helpers/skill-learning.mjs):
 *
 *   Study dialog     (📖 on a skill row)  Log weeks of lessons or research.
 *   Success dialog   (✋ on a skill row)  Record a success with a Sequence ability that teaches by doing
 *                                         (its "Learning by Doing" settings, on the ability sheet).
 *
 * Progress is saved on the actor in system.learning (one entry per skill, see base-actor.mjs).
 * When a meter fills, the skill's level goes up straight away and a chat message says so.
 */

import { findSkillEntry } from "../helpers/action-roll.mjs";
import { lowerLevel } from "../helpers/skill-associations.mjs";
import {
  applyStudyWeeks, applySuccess, canTeachTo, inspirationBoost, nextLevel, studyProgressFor, studyWeeksNeeded,
  successesFor, successesNeeded, STUDY_SCHEDULES, WEEKS_PER_MONTH, WEEKS_PER_YEAR,
} from "../helpers/skill-learning.mjs";

const { DialogV2 } = foundry.applications.api;

/** Localize a LORD_OF_THE_MYSTERIES.Learning.* key, filling in {values} when given. */
function L(key, data) {
  const full = `LORD_OF_THE_MYSTERIES.Learning.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

const levelLabel = (level) => game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[level] ?? level);
const roundOne = (n) => Math.round(n * 10) / 10;
const escape = (text) => Handlebars.escapeExpression(text ?? "");

/**
 * A length of study as readable text: weeks for short ones, then months, then years.
 * @param {number} weeks
 * @returns {string}
 */
export function formatStudyTime(weeks) {
  if (weeks < 9) return L("Duration.Weeks", { n: roundOne(weeks) });
  const monthCount = weeks / WEEKS_PER_MONTH;
  if (monthCount < 24) return L("Duration.Months", { n: roundOne(monthCount) });
  return L("Duration.Years", { n: roundOne(weeks / WEEKS_PER_YEAR) });
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
  ui.notifications.error(L("NoLearningField"));
  return false;
}

/**
 * The actor's learning list as plain data (safe to change), and this skill's entry in it
 * (added to the list if it's the skill's first time).
 * @param {Actor} actor
 * @param {string} uuid  The skill's uuid.
 * @returns {{learning: object[], entry: object}}
 */
function learningData(actor, uuid) {
  const learning = foundry.utils.deepClone(actor.toObject().system.learning ?? []);
  let entry = learning.find((e) => e.skill === uuid);
  if (!entry) {
    entry = { skill: uuid, study: 0, studyFrom: "", successes: 0, successesFrom: "", gained: [] };
    learning.push(entry);
  }
  entry.gained ??= [];
  return { learning, entry };
}

/**
 * The update that sets a skill's level (the level the player sees in its dropdown), or {} if the skill is gone.
 * `level` is the level the skill is now rolled at. When a Sequence raises the skill, that raise is taken back off
 * before saving, because it's added again on top: a skill raised one level by a Sequence and studied up to
 * Mastery is saved as Advanced, so it doesn't count the Sequence twice.
 * @param {Actor} actor
 * @param {string} uuid
 * @param {string} level
 * @returns {Promise<object>}
 */
async function skillLevelUpdate(actor, uuid, level) {
  const skillItem = await fromUuid(uuid).catch(() => null);
  if (!skillItem) return {};
  level = lowerLevel(level, actor.system.sequenceSkillSteps?.[uuid] ?? 0);
  const { uuid: storedUuid, category } = findSkillEntry(actor, skillItem, uuid);
  const list = foundry.utils.deepClone(actor.toObject().system.skills?.[category] ?? []);
  const index = list.findIndex((e) => e.skill === storedUuid);
  if (index >= 0) list[index].level = level;
  else list.push({ skill: storedUuid, level, analysis: 0 });
  return { [`system.skills.${category}`]: list };
}

/**
 * Save a learning update, and when it raises the Education growth bonus (base-actor.mjs), say so.
 * @param {Actor} actor
 * @param {object} update
 * @returns {Promise<string|null>}  A chat line like "Education growth: Education +1 (now +2)", or null.
 */
async function updateWithGrowth(actor, update) {
  const before = actor.system.educationGrowth?.bonus ?? 0;
  await actor.update(update);
  const after = actor.system.educationGrowth?.bonus ?? 0;
  if (after <= before) return null;
  return `<strong>${game.i18n.format("LORD_OF_THE_MYSTERIES.EducationGrowth.Chat", { gain: after - before, total: after })}</strong>`;
}

/** Post the chat message for a study or a success. `lines` are already-safe HTML. */
async function postLearningMessage(actor, lines) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="lotm chat-study">${lines.map((line) => `<p>${line}</p>`).join("")}</div>`,
  });
}

/* -------------------------------------------- */
/*  Study (slow growth)                          */
/* -------------------------------------------- */

/**
 * Open the Study dialog for a skill.
 * @param {Actor} actor
 * @param {{uuid: string, name: string, level: string}} skill
 *   `level` is the level the skill is rolled at (a related skill may have raised it): study goes on from there.
 */
export async function openStudyDialog(actor, skill) {
  if (!canSaveLearning(actor)) return;
  const next = nextLevel(skill.level);
  if (!next) {
    ui.notifications.info(L("AtMax", { skill: skill.name }));
    return;
  }

  const inspiration = actor.system.attributes.ins?.total ?? 0;
  // Sequences with this skill in their Knowledge and Training list: one schedule faster each (base-actor.mjs).
  const extraSteps = actor.system.sequenceTrainingSteps?.[skill.uuid] ?? 0;
  const entry = (actor.system.learning ?? []).find((e) => e.skill === skill.uuid);
  const progress = studyProgressFor(entry, skill.level);

  // The schedule dropdown, fastest first. "3-5 days a week" is picked to start with.
  const scheduleOptions = [...STUDY_SCHEDULES].reverse()
    .map((key) => `<option value="${key}" ${key === "often" ? "selected" : ""}>${L(`Schedules.${key}`)}</option>`)
    .join("");

  const boost = inspirationBoost(inspiration);
  const content = `
    <p class="study-current">${L("Current", {
      level: levelLabel(skill.level), next: levelLabel(next), percent: meterPercent(progress),
    })}</p>
    <div class="form-group">
      <label>${L("Weeks")}</label>
      <div class="form-fields"><input type="number" name="weeks" value="1" min="1" step="1" autofocus></div>
    </div>
    <div class="form-group">
      <label>${L("Schedule")}</label>
      <div class="form-fields"><select name="schedule">${scheduleOptions}</select></div>
      <p class="hint">${L("ScheduleHint")}</p>
    </div>
    <div class="form-group">
      <label>${L("SelfStudy")}</label>
      <div class="form-fields"><input type="checkbox" name="selfStudy"></div>
      <p class="hint">${L("SelfStudyHint")}</p>
    </div>
    ${boost ? `<p class="hint">${L("InspirationBoost", { inspiration, steps: boost })}</p>` : ""}
    ${extraSteps ? `<p class="hint">${L("SequenceBoost", { steps: extraSteps })}</p>` : ""}
    <p class="study-preview"></p>`;

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
      ? L("PreviewLevelUp", { level: levelLabel(result.level) })
      : L("PreviewProgress", { percent: meterPercent(result.progress), next: levelLabel(next) });
    form.querySelector(".study-preview").textContent =
      `${L("PreviewStep", { from: levelLabel(skill.level), to: levelLabel(next), time: formatStudyTime(full) })} ${outcome}`;
  };

  const choice = await DialogV2.wait({
    window: { title: L("Title", { skill: skill.name }), icon: "fa-solid fa-book-open" },
    classes: ["lotm", "study-dialog"],
    position: { width: 400 },
    content,
    buttons: [
      {
        action: "study",
        label: L("Log"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => readForm(button.form),
      },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" },
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
 * @param {{uuid: string, name: string, level: string}} skill
 * @param {{weeks: number, schedule: string, selfStudy: boolean}} choice
 */
export async function logStudy(actor, skill, { weeks, schedule, selfStudy }) {
  const inspiration = actor.system.attributes.ins?.total ?? 0;
  const extraSteps = actor.system.sequenceTrainingSteps?.[skill.uuid] ?? 0;
  const { learning, entry } = learningData(actor, skill.uuid);

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
  if (result.gained.length) Object.assign(update, await skillLevelUpdate(actor, skill.uuid, result.level));
  const growthLine = await updateWithGrowth(actor, update);

  // "Studied Melee for 2 week(s) (3-5 days a week). Melee went up to Trained! 12% of the way to Proficient."
  const name = escape(skill.name);
  const how = L(`Schedules.${schedule}`) + (selfStudy ? `, ${L("SelfStudyShort")}` : "");
  const lines = [L("Chat.Studied", { skill: name, weeks, how })];
  for (const step of result.gained) {
    lines.push(`<strong>${L("Chat.LevelUp", { skill: name, level: levelLabel(step.to) })}</strong>`);
  }
  const next = nextLevel(result.level);
  if (next) lines.push(L("Chat.Progress", { percent: meterPercent(result.progress), next: levelLabel(next) }));
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
 * @param {{uuid: string, name: string, level: string}} skill  `level` = the level the skill is rolled at.
 * @param {string[]} abilityUuids  The abilities that teach this skill (from the skill row's data-teachers).
 */
export async function openSuccessDialog(actor, skill, abilityUuids) {
  if (!canSaveLearning(actor)) return;
  const abilities = (await Promise.all(abilityUuids.map((uuid) => fromUuid(uuid).catch(() => null))))
    .filter((ability) => ability?.system?.fastLearning?.enabled);
  if (!abilities.length) return;

  const next = nextLevel(skill.level);
  if (!next) {
    ui.notifications.info(L("AtMax", { skill: skill.name }));
    return;
  }

  const entry = (actor.system.learning ?? []).find((e) => e.skill === skill.uuid);
  const count = successesFor(entry, skill.level);
  const needed = successesNeeded(skill.level);

  const abilityPicker = abilities.length > 1
    ? `<div class="form-group">
         <label>${L("Fast.Ability")}</label>
         <div class="form-fields"><select name="ability">
           ${abilities.map((a) => `<option value="${a.uuid}">${escape(a.name)}</option>`).join("")}
         </select></div>
       </div>`
    : `<input type="hidden" name="ability" value="${abilities[0].uuid}">`;

  const content = `
    <p class="study-current">${L("Fast.Progress", { count, needed, next: levelLabel(next) })}</p>
    ${abilityPicker}
    <p class="hint success-condition"></p>
    <p class="study-preview">${count + 1 >= needed
      ? L("Fast.PreviewLevelUp", { level: levelLabel(next) })
      : L("Fast.PreviewProgress", { count: count + 1, needed })}</p>`;

  /** Show what counts as a success for the picked ability. */
  const showCondition = (form) => {
    const ability = abilities.find((a) => a.uuid === form.elements.ability.value) ?? abilities[0];
    const condition = ability.system.fastLearning.condition?.trim();
    form.querySelector(".success-condition").textContent = condition
      ? L("Fast.ConditionShown", { ability: ability.name, condition })
      : ability.name;
  };

  const abilityUuid = await DialogV2.wait({
    window: { title: L("Fast.DialogTitle", { skill: skill.name }), icon: "fa-solid fa-hand-sparkles" },
    classes: ["lotm", "study-dialog"],
    position: { width: 400 },
    content,
    buttons: [
      {
        action: "record",
        label: L("Fast.Record"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => button.form.elements.ability.value,
      },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" },
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
 * @param {{uuid: string, name: string, level: string}} skill
 * @param {Item} ability  The ability the success came from.
 */
export async function recordSuccess(actor, skill, ability) {
  const maxLevel = ability.system.fastLearning?.maxLevel ?? "mastery";
  if (!canTeachTo(skill.level, maxLevel)) {
    ui.notifications.warn(L("Fast.AtAbilityMax", { ability: ability.name, skill: skill.name, level: levelLabel(maxLevel) }));
    return;
  }

  const { learning, entry } = learningData(actor, skill.uuid);
  const result = applySuccess({ level: skill.level, successes: successesFor(entry, skill.level) });

  entry.successes = result.successes;
  entry.successesFrom = result.level;
  if (result.gained) entry.gained.push({ ...result.gained, source: "ability", detail: ability.name });

  const update = { "system.learning": learning };
  if (result.gained) Object.assign(update, await skillLevelUpdate(actor, skill.uuid, result.level));
  const growthLine = await updateWithGrowth(actor, update);

  // "Recorded a success for Clever Hands with Thief's Hand. 1 of 2 successes toward Proficient."
  const name = escape(skill.name);
  const lines = [L("Fast.Chat.Success", { skill: name, ability: escape(ability.name) })];
  if (result.gained) lines.push(`<strong>${L("Chat.LevelUp", { skill: name, level: levelLabel(result.level) })}</strong>`);
  const next = nextLevel(result.level);
  if (next && canTeachTo(result.level, maxLevel)) {
    lines.push(L("Fast.Progress", { count: result.successes, needed: successesNeeded(result.level), next: levelLabel(next) }));
  } else if (next) {
    lines.push(L("Fast.Chat.Maxed", { ability: escape(ability.name), level: levelLabel(maxLevel) }));
  }
  if (growthLine) lines.push(growthLine);
  await postLearningMessage(actor, lines);
}
