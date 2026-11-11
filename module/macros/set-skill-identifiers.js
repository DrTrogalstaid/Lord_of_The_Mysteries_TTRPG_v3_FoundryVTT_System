/**
 * One-time macro: fill in every skill's Identifier and "Standard skill" box, in the Skills compendium and the world.
 *
 * Why: actors and Active Effects know a skill by its key (helpers/skill-keys.mjs). While a skill's Identifier is
 * blank, its key comes from its name, and its Standard box comes from which compendium folder it's in. That works,
 * but renaming the skill or moving it to another folder would then change them. Filling them in once pins them down.
 * Nothing that's already filled in is changed.
 *
 * What it sets, only where it's blank / never saved:
 *   Identifier       the key from the skill's name ("Knowledge of the Dead" -> "knowledgeOfTheDead")
 *   Standard skill   ticked for skills in the Skills compendium's attribute folders (Strength, Agility, Charisma,
 *                    Inspiration, Education), unticked for everything else (Languages, Extraordinary Knowledge,
 *                    Knowledge of the Dead, world skills)
 *
 * How to use:
 *   1. Unlock the Skills compendium (right-click it > Toggle Edit Lock).
 *   2. Make a Script macro with this code and run it. It only REPORTS what it would do (see the console, F12).
 *      It also lists skills that share a key: two skills with the same name. Give one its own Identifier if they're
 *      really different skills.
 *   3. If the report looks right, change APPLY to true and run it again. Then lock the compendium.
 *   4. Commit the compendium's files (packs/skills_compendium) so other worlds get the Identifiers too.
 */

const APPLY = false;

const config = CONFIG.LORD_OF_THE_MYSTERIES;
const { skillKeyFromName } = game.lotm;

const pack = game.packs.get(config.skillsCompendiumId);
if (!pack) {
  ui.notifications.error("Skills compendium not found.");
  return;
}
if (APPLY && pack.locked) {
  ui.notifications.error("Unlock the Skills compendium first (right-click it > Toggle Edit Lock).");
  return;
}

const standardFolders = new Set((config.skillTabAttributes ?? []).map((key) => config.skillCompendiumFolders?.[key]).filter(Boolean));
const packSkills = (await pack.getDocuments()).filter((item) => item.type === "skill");
const worldSkills = game.items.filter((item) => item.type === "skill");

const report = [];
const byKey = new Map();   // key -> [names], to find skills that share one
const packUpdates = [];
const worldUpdates = [];

for (const [source, skills, updates] of [["compendium", packSkills, packUpdates], ["world", worldSkills, worldUpdates]]) {
  for (const skill of skills) {
    const saved = skill._source.system ?? {};
    const update = { _id: skill.id };
    const identifier = String(saved.identifier ?? "").trim();
    const key = identifier || skillKeyFromName(skill.name);
    if (!identifier && key) update["system.identifier"] = key;

    if (typeof saved.isStandard !== "boolean") {
      update["system.isStandard"] = source === "compendium" && standardFolders.has(skill.folder?.name ?? "");
    }

    // World copies of compendium skills share the compendium skill's key on purpose; only list real clashes.
    const isCopy = source === "world" && skill._stats?.compendiumSource?.startsWith(`Compendium.${pack.collection}.`);
    if (!isCopy) (byKey.get(key) ?? byKey.set(key, []).get(key)).push(`${skill.name} (${source})`);

    if (Object.keys(update).length > 1) {
      updates.push(update);
      report.push({
        skill: skill.name, source, folder: skill.folder?.name ?? "",
        identifier: update["system.identifier"] ?? `(kept) ${identifier}`,
        standard: "system.isStandard" in update ? update["system.isStandard"] : `(kept) ${saved.isStandard}`,
      });
    }
  }
}

const clashes = [...byKey].filter(([, names]) => names.length > 1).map(([key, names]) => ({ key, skills: names.join(", ") }));

console.groupCollapsed(`Lord of the Mysteries | Skill identifiers: ${report.length} skill(s) to update, ${clashes.length} shared key(s)`);
console.table(report);
if (clashes.length) {
  console.warn("These skills share a key, so actors treat them as one skill. Give one of each its own Identifier if they're different:");
  console.table(clashes);
}
console.groupEnd();

if (!APPLY) {
  ui.notifications.info(`Dry run: ${report.length} skills would be updated, ${clashes.length} shared keys. See the console (F12).`);
  return;
}

if (packUpdates.length) await Item.implementation.updateDocuments(packUpdates, { pack: pack.collection });
if (worldUpdates.length) await Item.implementation.updateDocuments(worldUpdates);
game.lotm.rebuildSkillRegistry({ refreshActors: true, force: true });
ui.notifications.info(`Updated ${packUpdates.length} compendium skill(s) and ${worldUpdates.length} world skill(s). Lock the compendium again.`);
