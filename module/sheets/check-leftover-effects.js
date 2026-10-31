/**
 * One-time macro: find Active Effects left over from before the system had its own statuses.
 *
 * The system's statuses (Bound, Fear, ...) replaced Foundry's own list (Prone, Poisoned, Stunned, ...). Effects
 * added from the Token HUD before that still carry the old statuses, which the system doesn't know: they show an
 * icon but do nothing. This macro lists:
 *   - OLD STATUS     effects whose statuses are all ones the system doesn't know, with no other changes.
 *                    These are the old Token HUD statuses. APPLY deletes them (world actors and tokens only).
 *   - UNKNOWN STATUS effects with some statuses the system doesn't know, next to other things. Only listed.
 *   - OLD TYPE       effects of Foundry's "base" type instead of the system's "effect" type. They still work,
 *                    but have none of the system's fields (source, ...). Only listed.
 * It looks at world actors and their Items, world Items, unlinked tokens on every scene, and (listing only)
 * the system's compendiums.
 *
 * How to use:
 *   1. Install the update with the system's statuses and reload.
 *   2. Make a Script macro with this code and run it as the GM. It only REPORTS (console, F12, and a chat message
 *      only you see).
 *   3. If the OLD STATUS list looks right, change APPLY to true and run it again to delete those.
 */

const APPLY = false;

const known = new Set(Object.keys(game.lotm.statusRules));
const rows = [];          // { kind, where, effect, statuses }
const toDelete = [];      // effects to delete when APPLY is on

/**
 * Sort one effect into a list, if it belongs in one.
 * @param {ActiveEffect} effect
 * @param {string} where      What it's on, for the report.
 * @param {boolean} canDelete World documents only; compendium contents are only listed.
 */
function check(effect, where, canDelete) {
  const statuses = [...effect.statuses];
  const unknown = statuses.filter((id) => !known.has(id));
  const changes = effect.system?.changes ?? effect.changes ?? [];

  if (statuses.length && unknown.length === statuses.length && !changes.length) {
    rows.push({ kind: "OLD STATUS", where, effect: effect.name, statuses: statuses.join(", ") });
    if (canDelete) toDelete.push(effect);
  } else if (unknown.length) {
    rows.push({ kind: "UNKNOWN STATUS", where, effect: effect.name, statuses: unknown.join(", ") });
  }
  if (effect.type !== "effect") {
    rows.push({ kind: "OLD TYPE", where, effect: effect.name, statuses: `type "${effect.type}"` });
  }
}

/** An actor's own effects and its Items' effects. */
function checkActor(actor, where, canDelete) {
  for (const effect of actor.effects) check(effect, where, canDelete);
  for (const item of actor.items) {
    for (const effect of item.effects) check(effect, `${where} > ${item.name}`, canDelete);
  }
}

// World actors and Items.
for (const actor of game.actors) checkActor(actor, `Actor: ${actor.name}`, true);
for (const item of game.items) {
  for (const effect of item.effects) check(effect, `Item: ${item.name}`, true);
}

// Unlinked tokens have their own copy of the actor (linked ones are the world actor, already checked).
for (const scene of game.scenes) {
  for (const token of scene.tokens) {
    if (token.actorLink || !token.actor) continue;
    checkActor(token.actor, `Token: ${token.name} (${scene.name})`, true);
  }
}

// The system's compendiums: listed only.
for (const pack of game.packs.filter((p) => p.metadata.packageName === "lotm" && ["Actor", "Item"].includes(p.documentName))) {
  for (const doc of await pack.getDocuments()) {
    if (doc.documentName === "Actor") checkActor(doc, `${pack.metadata.label}: ${doc.name}`, false);
    else for (const effect of doc.effects) check(effect, `${pack.metadata.label}: ${doc.name}`, false);
  }
}

// Delete the old Token HUD statuses.
let deleted = 0;
if (APPLY) {
  for (const effect of toDelete) {
    await effect.delete();
    deleted += 1;
  }
}

// Report
const counts = rows.reduce((sum, row) => ({ ...sum, [row.kind]: (sum[row.kind] ?? 0) + 1 }), {});
console.log("Leftover effects:", counts, APPLY ? `(${deleted} deleted)` : "(report only)");
if (rows.length) console.table(rows);

const escape = Handlebars.escapeExpression;
const list = rows.map((row) => `<li><strong>${row.kind}</strong> ${escape(row.where)}: ${escape(row.effect)} (${escape(row.statuses)})</li>`).join("");
await ChatMessage.create({
  content: `<h3>Leftover effects</h3>
    <p>${rows.length ? `${rows.length} found.` : "None found."} ${APPLY ? `${deleted} old statuses deleted.` : "Report only: nothing was changed."}</p>
    ${rows.length ? `<ol>${list}</ol>` : ""}`,
  whisper: [game.user.id],
});
