/**
 * Test macro: open every kind of item sheet and report anything that goes wrong.
 *
 * It opens the sheet of:
 *   1. a new, blank Item of every type (made in a folder called "Sheet smoke test", deleted again at the end)
 *   2. up to SAMPLES Items of every type from each of the system's Item compendiums (only opened, never changed)
 *   3. every Item owned by the first ACTOR_LIMIT actors (Sequences, abilities, gear, ... on a character)
 * Each sheet is opened, given a moment to draw, and closed. Errors thrown while opening, and errors printed to the
 * console while a sheet draws, are collected. The report goes to the console (F12) and to a chat message only you see.
 *
 * How to use:
 *   1. Make a Script macro with this code. Run it as the GM.
 *   2. Run it once BEFORE installing an update and once AFTER, then compare the two reports.
 *      Problems in both reports were already there (e.g. the old "item" / "feature" sheets); new ones came with the update.
 *
 * It only finds errors. Whether a sheet LOOKS right and SAVES right is in tests/MANUAL_QA.md ("Item sheets").
 */

const SAMPLES = 3;        // compendium Items opened per type, per compendium
const ACTOR_LIMIT = 5;    // actors whose Items are opened
const WAIT_MS = 150;      // time given to each sheet to finish drawing

const problems = [];      // { where, error }
let opened = 0;
let current = null;       // the sheet being tested, so console errors can be put against it

// Catch errors Foundry prints while drawing (they don't always make render() fail).
const originalError = console.error;
console.error = (...args) => {
  if (current) problems.push({ where: current, error: args.map((a) => a?.message ?? String(a)).join(" ") });
  originalError.apply(console, args);
};
const onRejection = (event) => {
  if (current) problems.push({ where: current, error: event.reason?.message ?? String(event.reason) });
};
window.addEventListener("unhandledrejection", onRejection);

/** Open one Item's sheet, wait, close it. */
async function check(item, where) {
  current = `${where}: ${item.name} (${item.type})`;
  try {
    const sheet = item.sheet;
    if (!sheet) throw new Error("no sheet is registered for this type");
    await sheet.render({ force: true });
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    if (!sheet.rendered) throw new Error("the sheet didn't open");
    await sheet.close({ animate: false });
    opened += 1;
  } catch (err) {
    problems.push({ where: current, error: err?.message ?? String(err) });
  } finally {
    current = null;
  }
}

try {
  // 1. One blank Item of every type.
  const types = Object.keys(CONFIG.Item.dataModels);
  const folder = await Folder.create({ name: "Sheet smoke test", type: "Item" });
  const blanks = await Item.createDocuments(types.map((type) => ({ name: `Smoke test ${type}`, type, folder: folder.id })));
  for (const item of blanks) await check(item, "Blank");
  await Item.deleteDocuments(blanks.map((item) => item.id));
  await folder.delete();

  // 2. Samples from the system's Item compendiums.
  const packs = game.packs.filter((pack) => pack.metadata.packageName === "lotm" && pack.documentName === "Item");
  for (const pack of packs) {
    const index = await pack.getIndex({ fields: ["type"] });
    const idsByType = {};
    for (const entry of index) (idsByType[entry.type] ??= []).push(entry._id);
    for (const ids of Object.values(idsByType)) {
      for (const id of ids.slice(0, SAMPLES)) {
        const item = await pack.getDocument(id);
        if (item) await check(item, pack.metadata.label);
      }
    }
  }

  // 3. Items owned by actors.
  for (const actor of game.actors.contents.slice(0, ACTOR_LIMIT)) {
    for (const item of actor.items) await check(item, actor.name);
  }
} finally {
  console.error = originalError;
  window.removeEventListener("unhandledrejection", onRejection);
}

// Report
console.log(`Sheet smoke test: ${opened} sheets opened, ${problems.length} problem(s).`);
if (problems.length) console.table(problems);

const escape = Handlebars.escapeExpression;
const rows = problems.map((p) => `<li><strong>${escape(p.where)}</strong><br>${escape(p.error)}</li>`).join("");
await ChatMessage.create({
  content: `<h3>Sheet smoke test</h3>
    <p>${opened} sheets opened, ${problems.length} problem(s).</p>
    ${problems.length ? `<ol>${rows}</ol>` : "<p>No errors.</p>"}`,
  whisper: [game.user.id],
});
