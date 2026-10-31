/**
 * Macro: bring every actor's copies of granted abilities' passive effects up to date.
 *
 * Abilities a Sequence or gear grants aren't owned by the actor, so their passive effects are copied onto the owned
 * Sequence or gear (effects/granted-effects.mjs). Those copies update themselves when the actor's own Items change,
 * but not when you edit the ability itself (in a compendium or the sidebar). Run this after doing that, or after
 * importing actors, so every character's copies match their abilities.
 *
 * It makes missing copies, removes extra ones, and replaces out-of-date ones (keeping copies you turned off, off).
 * It looks at world actors and the unlinked tokens on every scene.
 *
 * How to use: make a Script macro with this code and run it as the GM. The result is in the console (F12) and in a
 * chat message only you see. Running it again changes nothing.
 */

const { syncGrantedEffects } = game.lotm;

const rows = [];   // { where, created, removed }

async function sync(actor, where) {
  const result = await syncGrantedEffects(actor);
  if (result && (result.created || result.removed)) rows.push({ where, ...result });
}

for (const actor of game.actors) await sync(actor, `Actor: ${actor.name}`);
for (const scene of game.scenes) {
  for (const token of scene.tokens) {
    if (token.actorLink || !token.actor) continue;
    await sync(token.actor, `Token: ${token.name} (${scene.name})`);
  }
}

console.table(rows);
const esc = Handlebars.escapeExpression;
const list = rows.length
  ? `<ul>${rows.map((row) => `<li>${esc(row.where)}: ${row.created} made, ${row.removed} removed</li>`).join("")}</ul>`
  : "<p>Everything was already up to date.</p>";
await ChatMessage.create({
  content: `<h3>Sync Granted Effects</h3><p>${rows.length} actor(s) changed.</p>${list}`,
  whisper: [game.user.id],
});
