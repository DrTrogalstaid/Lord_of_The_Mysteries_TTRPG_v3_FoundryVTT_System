/**
 * Move characters' and NPCs' old skill data to skill keys (helpers/skill-data.mjs).
 *
 * You normally don't need this: it runs by itself for the GM when the world loads, and for actors created with old
 * data. Use it to see what it would do (a dry run), or to run it again after fixing something it reported.
 *
 * What it does for each actor that still has old-format skills (lists per attribute) or learning saved under UUIDs:
 *   - copies the old data into a backup on the actor first (flags.lotm.skillsBackups; never overwritten)
 *   - gives every old skill entry a record under its skill's key, with its level, analyses and study fields.
 *     A skill whose Item was deleted is kept as "missing_<id>" (the sheet lists it so it can be removed).
 *   - checks that every level and analysis made it across; if not, that actor is left as it is and reported
 * Actors that don't need it are skipped, so running it twice is safe. Actors in compendiums aren't changed: they're
 * moved when they're imported into the world.
 *
 * How to use:
 *   1. Make a Script macro with this code and run it as the GM. It only REPORTS what it would do (console, F12).
 *   2. If the report looks right, change APPLY to true and run it again.
 */

const APPLY = false;

await game.lotm.migrateSkillData({ apply: APPLY });
