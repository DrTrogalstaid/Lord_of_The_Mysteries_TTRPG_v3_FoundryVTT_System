/**
 * Saving an actor's skills, and moving old skill data to skill keys.
 *
 * Saving: every change to a skill record goes through skillRecordUpdate / deleteSkillUpdate, which build the update
 * for one skill (system.skills.<key>). A skill that's still in the old format (system.legacySkills) gets its old level,
 * analyses and study fields copied into the new record first, so changing its level never resets its analyses.
 *
 * Migration (migrateActorSkillData, migrateWorldSkillData): turns an actor's old-format skills into records keyed by
 * skill, and its learning entries' UUIDs into keys. The work is done by migrateSkillData (helpers/skill-records.mjs),
 * which checks its own result. For each actor:
 *   1. the old data is copied into a backup flag first: flags.lotm.skillsBackups (one entry per migration, never
 *      overwritten; flags are never stripped by Foundry). Restore by hand from there if anything looks wrong.
 *   2. if the check finds a problem, that actor is left as it is and reported. Its skills keep working from the
 *      old format.
 *   3. otherwise system.skills is replaced with the records, system.legacySkills emptied, system.learning updated.
 *   4. the saved result is compared with what was meant to be saved, and any difference reported.
 * It runs by itself for the GM when the world loads (only actors that need it), for actors created with old data
 * (imported from a compendium), and from module/macros/migrate-skill-data.js (with a dry run).
 */

import { isSkillUuid, legacySkillKey } from "./skill-keys.mjs";
import { EMPTY_SKILL_RECORD, mergeLegacySkills, migrateSkillData } from "./skill-records.mjs";
import { skillInfo, skillKeyFor, whenSkillRegistryReady } from "./skill-registry.mjs";
import { langSection } from "./lang.mjs";


/* -------------------------------------------- */
/*  Update helpers                               */
/* -------------------------------------------- */

/**
 * An update that removes one entry of an object field, e.g. "system.skills.pistol".
 * Foundry v14's ForcedDeletion; the older "-=" key if it isn't there.
 * @param {string} path
 * @returns {object}
 */
export function deletionUpdate(path) {
  const op = foundry.data?.operators?.ForcedDeletion;
  if (op?.create) return { [path]: op.create() };
  const dot = path.lastIndexOf(".");
  return { [`${path.slice(0, dot)}.-=${path.slice(dot + 1)}`]: null };
}


/**
 * An update value that replaces a whole field instead of merging into it (Foundry v14's ForcedReplacement).
 * @param {string} path
 * @param {any} value
 * @returns {object}
 */
export function replacementUpdate(path, value) {
  const op = foundry.data?.operators?.ForcedReplacement;
  if (op?.create) return { [path]: op.create(value) };
  const dot = path.lastIndexOf(".");
  return { [`${path.slice(0, dot)}.==${path.slice(dot + 1)}`]: value };
}


/**
 * The actor's saved system data (not the prepared data). For a token's actor, its base actor's merged with the token's.
 * @param {Actor} actor
 * @returns {object}
 */
function savedSystem(actor) {
  return actor?._source?.system ?? {};
}


/**
 * A level the record field accepts: one of CONFIG.LORD_OF_THE_MYSTERIES.skillLevels' keys, otherwise Untrained.
 * (The old format accepted anything; the new record field only accepts real levels.)
 * @param {string} level
 * @returns {string}
 */
function validLevel(level) {
  return level in (CONFIG.LORD_OF_THE_MYSTERIES.skillLevels ?? {}) ? level : "untrained";
}


/**
 * The update that saves one skill's record: what's saved now (or the old-format entry, or nothing), with `changes`.
 * @param {Actor} actor
 * @param {string} key              The skill's key.
 * @param {object} [changes]        Fields to set: { level }, { analysis }, ...
 * @returns {object}  e.g. { "system.skills.pistol": { uuid, level, analysis, bonus, study } }, or {} without a key.
 */
export function skillRecordUpdate(actor, key, changes = {}) {
  if (!key) return {};
  const system = savedSystem(actor);
  let base = system.skills?.[key];
  if (!base) {
    const legacy = mergeLegacySkills(system.legacySkills, skillKeyFor).get(key);
    base = legacy
      ? { uuid: legacy.uuid, level: legacy.level, analysis: legacy.analysis, ...(legacy.study ? { study: legacy.study } : {}) }
      : { ...EMPTY_SKILL_RECORD };
  }
  const record = foundry.utils.deepClone(base);
  Object.assign(record, changes);
  record.level = validLevel(record.level);
  record.analysis = Math.max(0, Math.floor(Number(record.analysis) || 0));
  record.bonus = 0;
  if (!record.uuid) record.uuid = skillInfo(key)?.uuid ?? "";
  return { [`system.skills.${key}`]: record };
}


/**
 * The update that removes one skill from the actor: its record, and any old-format entry for it (so it doesn't come
 * back from there).
 * @param {Actor} actor
 * @param {string} key
 * @returns {object}  {} when there's nothing saved to remove.
 */
export function deleteSkillUpdate(actor, key) {
  if (!key) return {};
  const system = savedSystem(actor);
  const update = system.skills?.[key] ? deletionUpdate(`system.skills.${key}`) : {};
  const legacy = system.legacySkills ?? [];
  const kept = legacy.filter((entry) => (skillKeyFor(entry.skill) || legacySkillKey(entry.skill)) !== key);
  if (kept.length !== legacy.length) update["system.legacySkills"] = kept;
  return update;
}


/**
 * The actor's learning entry for a skill, from a copy of system.learning that's safe to change and save, added if it's
 * the skill's first. An entry saved under the skill's UUID (before skill keys) is found too, and switched to the key.
 * @param {Actor} actor
 * @param {string} key
 * @returns {{learning: object[], entry: object}}
 */
export function learningEntryFor(actor, key) {
  const learning = foundry.utils.deepClone(savedSystem(actor).learning ?? []);
  let entry = learning.find((e) => e.skill === key)
    ?? learning.find((e) => isSkillUuid(e.skill) && (skillKeyFor(e.skill) || legacySkillKey(e.skill)) === key);
  if (!entry) {
    entry = { skill: key, study: 0, studyFrom: "", successes: 0, successesFrom: "", gained: [] };
    learning.push(entry);
  }
  entry.skill = key;
  entry.gained ??= [];
  return { learning, entry };
}


/* -------------------------------------------- */
/*  Migration                                    */
/* -------------------------------------------- */

/**
 * Whether an actor has skill data in the old format: old skill lists, or learning entries saved under UUIDs.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function needsSkillMigration(actor) {
  const system = savedSystem(actor);
  return (system.legacySkills ?? []).length > 0 || (system.learning ?? []).some((entry) => isSkillUuid(entry?.skill));
}


/**
 * Move one actor's old-format skill data to skill keys (see the top of this file).
 * @param {Actor} actor
 * @param {{apply?: boolean}} [options]   apply false: only work out and report what would happen.
 * @returns {Promise<{actor: Actor, status: "skipped"|"dry-run"|"migrated"|"problems"|"mismatch"|"error",
 *                    report?: object, problems?: string[], error?: Error}>}
 */
export async function migrateActorSkillData(actor, { apply = true } = {}) {
  if (!needsSkillMigration(actor)) return { actor, status: "skipped" };
  const system = savedSystem(actor);
  const legacySkills = foundry.utils.deepClone(system.legacySkills ?? []);
  const learning = foundry.utils.deepClone(system.learning ?? []);
  const result = migrateSkillData({ skills: foundry.utils.deepClone(system.skills ?? {}), legacySkills, learning }, skillKeyFor);

  if (result.problems.length) return { actor, status: "problems", report: result.report, problems: result.problems };
  if (!apply) return { actor, status: "dry-run", report: result.report };

  for (const record of Object.values(result.skills)) {
    record.level = validLevel(record.level);
    record.bonus = 0;
  }

  const backups = foundry.utils.deepClone(actor.getFlag?.("lotm", "skillsBackups") ?? []);
  backups.push({ savedAt: new Date().toISOString(), systemVersion: game.system?.version ?? "", legacySkills, learning });

  try {
    await actor.update({
      ...replacementUpdate("system.skills", result.skills),
      "system.legacySkills": [],
      "system.learning": result.learning,
      "flags.lotm.skillsBackups": backups,
    }, { lotmSkillMigration: true });
  } catch (error) {
    return { actor, status: "error", report: result.report, error };
  }

  // Check what was saved against what was meant to be.
  const saved = savedSystem(actor).skills ?? {};
  const mismatches = Object.entries(result.skills)
    .filter(([key, record]) => saved[key]?.level !== record.level || (saved[key]?.analysis ?? 0) !== (record.analysis ?? 0))
    .map(([key]) => key);
  if (mismatches.length) {
    return { actor, status: "mismatch", report: result.report, problems: mismatches.map((key) => `${key} wasn't saved as expected`) };
  }
  return { actor, status: "migrated", report: result.report };
}


/**
 * The actors whose skill data may need moving: world actors, then unlinked tokens whose own changes include skills.
 * @returns {Actor[]}
 */
function actorsToMigrate() {
  const actors = [...(game.actors ?? [])];
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink) continue;
      const delta = token.delta?._source?.system ?? {};
      if (!("skills" in delta) && !("legacySkills" in delta) && !("learning" in delta)) continue;
      try {
        if (token.actor) actors.push(token.actor);
      } catch (error) {
        console.warn(`Lord of the Mysteries | Couldn't load the actor of token ${token.name} (${scene.name})`, error);
      }
    }
  }
  return actors;
}


/**
 * Move every actor's old-format skill data to skill keys, and report what happened (console, and a notification).
 * GM only. Actors that don't need it are skipped, so running it again does nothing.
 * @param {{apply?: boolean, quiet?: boolean}} [options]
 *   apply  false: a dry run that only reports what would happen.
 *   quiet  no notification when nothing needed moving.
 * @returns {Promise<object[]>}  One result per actor that needed it (see migrateActorSkillData).
 */
export async function migrateWorldSkillData({ apply = true, quiet = false } = {}) {
  if (!game.user?.isGM) {
    ui.notifications?.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.SkillKeys.Migration.GMOnly"));
    return [];
  }
  await whenSkillRegistryReady();

  const results = [];
  for (const actor of actorsToMigrate()) {
    try {
      const result = await migrateActorSkillData(actor, { apply });
      if (result.status !== "skipped") results.push(result);
    } catch (error) {
      results.push({ actor, status: "error", error });
    }
  }
  reportMigration(results, { apply, quiet });
  return results;
}


/**
 * Console table and notification for a migration run.
 * @param {object[]} results
 * @param {{apply: boolean, quiet: boolean}} options
 */
function reportMigration(results, { apply, quiet }) {
  const migrationText = langSection("LORD_OF_THE_MYSTERIES.SkillKeys.Migration");
  if (!results.length) {
    if (!quiet) ui.notifications?.info(migrationText("NothingToDo"));
    return;
  }

  const rows = results.map(({ actor, status, report, problems, error }) => ({
    actor: actor?.name,
    uuid: actor?.uuid,
    status,
    moved: report?.moved ?? 0,
    merged: report?.merged ?? 0,
    keptNewer: report?.kept ?? 0,
    missingItems: (report?.missing ?? []).join(", "),
    learningMoved: report?.learningMoved ?? 0,
    problems: (problems ?? []).join("; ") || (error ? String(error.message ?? error) : ""),
  }));
  console.groupCollapsed(`Lord of the Mysteries | Skill data ${apply ? "migration" : "dry run"}: ${results.length} actor(s)`);
  console.table(rows);
  for (const { actor, error } of results) if (error) console.error(actor?.name, error);
  console.groupEnd();

  const failed = results.filter((r) => ["problems", "mismatch", "error"].includes(r.status)).length;
  const done = results.length - failed;
  if (!apply) ui.notifications?.info(migrationText("DryRun", { count: results.length }));
  else if (done) ui.notifications?.info(migrationText("Done", { count: done }));
  if (failed) ui.notifications?.warn(migrationText("Failed", { count: failed }), { permanent: true });
}


/**
 * Called once, in the init hook (lotm.mjs): move old skill data when the world loads (GM), and for actors created
 * with old data (an actor imported from a compendium, or duplicated from one that wasn't moved yet).
 */
export function registerSkillDataMigration() {
  Hooks.once("ready", async () => {
    if (!game.user?.isActiveGM) return;
    try {
      await migrateWorldSkillData({ quiet: true });
    } catch (error) {
      console.error("Lord of the Mysteries | Skill data migration failed", error);
    }
  });

  Hooks.on("createActor", async (actor, options, userId) => {
    if (userId !== game.user?.id || !needsSkillMigration(actor)) return;
    await whenSkillRegistryReady();
    const result = await migrateActorSkillData(actor);
    if (["problems", "mismatch", "error"].includes(result.status)) reportMigration([result], { apply: true, quiet: true });
  });
}
