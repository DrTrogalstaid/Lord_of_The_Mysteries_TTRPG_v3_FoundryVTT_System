/**
 * One-time macro: give the Skills compendium's skills the rulebook's related-skill categories
 * (chapter IV, "A list of skills that are related to each other").
 *
 * How to use:
 *   1. Update skill.mjs / config.mjs first and reload, so skills have the new `categories` field.
 *   2. Unlock the Skills compendium (right-click it > Toggle Edit Lock).
 *   3. Make a Script macro with this code and run it. It only REPORTS what it would do (see the console, F12).
 *   4. If the report looks right, change APPLY to true and run it again. Then lock the compendium.
 *
 * Skills are matched by name (upper/lower case doesn't matter). Names that aren't found are listed,
 * so you can fix the spelling below if your compendium names a skill differently.
 * A skill's categories that aren't in this list (e.g. Extraordinary Knowledge) are kept.
 */

const APPLY = false;

// category key (config.mjs skillCategories) -> { mode: [skill names] }
const RULEBOOK = {
  fighting:       { both: ["Melee", "Sword", "Pole Weapon", "Giant Weapon", "Special"] },
  firearms:       { both: ["Pistol", "Rifle", "Shotgun"] },
  arrow:          { both: ["Bow", "Crossbow"] },
  social:         { both: ["Charm", "Speech", "Persuasion", "Deception", "Intimidate", "Psychology"] },
  psychological:  { both: ["Psychology", "Hypnosis", "Psychotherapy"] },   // "psychological guidance" = Hypnosis + Psychotherapy
  drug:           { both: ["Chemistry", "Pharmacy"] },
  mystical:       { both: ["Occultism", "Religion", "Hermes", "Ancient Hermes", "Ancient Feysac", "Dragonese", "Jotun", "Elvish"] },
  historical:     { both: ["History", "Archeology"] },
  languageNorth:  { both: ["Loenese", "Intisian", "Feysac", "Ancient Feysac"] },
  languageSouth:  { both: ["Dutanese", "Highland"] },
  reconnaissance: { both: ["Reconnaissance", "Lip Reading", "Psychology", "Tracking"] },
  astronomy:      { both: ["Navigate", "Astronomy"] },                      // the rulebook also lists astrology, which has no skill
  mechanical:     { both: ["Craft Manufacturing", "Mechanical Maintenance"] },
  // One-way: Medicine and Pharmacy raise Biology, but Biology alone doesn't raise them.
  medical:        { both: ["Medicine", "Pharmacy"], receives: ["Biology"] },
  natural:        { both: ["Agriculture", "Botany", "Biology", "Natural History"] },
  // One-way: Singing raises Music Theory, not the other way round.
  music:          { both: ["Music Theory"], gives: ["Singing"] },
  performance:    { both: ["Performance", "Disguise"] },
  writing:        { both: ["Library Use", "Writing"] },
};

const pack = game.packs.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
if (!pack) {
  ui.notifications.error("Skills compendium not found.");
  return;
}

const skills = await pack.getDocuments();
const byName = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]));
const ruleCategories = new Set(Object.keys(RULEBOOK));

// skill id -> the categories this list gives it
const wanted = new Map();
const missing = [];

for (const [category, modes] of Object.entries(RULEBOOK)) {
  for (const [mode, names] of Object.entries(modes)) {
    for (const name of names) {
      const skill = byName.get(name.toLowerCase());
      if (!skill) {
        missing.push(`${name} (${category})`);
        continue;
      }
      if (!wanted.has(skill.id)) wanted.set(skill.id, []);
      wanted.get(skill.id).push({ category, mode });
    }
  }
}

const updates = [];
const report = [];
for (const [id, categories] of wanted) {
  const skill = pack.get(id);
  // Keep any categories the GM added that aren't part of the rulebook list.
  const kept = (skill.system.categories ?? []).filter((entry) => !ruleCategories.has(entry.category));
  const final = [...kept, ...categories];
  updates.push({ _id: id, "system.categories": final });
  report.push({ skill: skill.name, categories: final.map((entry) => `${entry.category} (${entry.mode})`).join(", ") });
}

console.table(report);
if (missing.length) console.warn("Not found in the compendium:", missing);

if (!APPLY) {
  ui.notifications.info(`Dry run: ${updates.length} skills would be updated, ${missing.length} names not found. See the console (F12).`);
  return;
}
if (pack.locked) {
  ui.notifications.warn("Unlock the Skills compendium first.");
  return;
}

await Item.implementation.updateDocuments(updates, { pack: pack.collection });
ui.notifications.info(`Updated ${updates.length} skills.`);
