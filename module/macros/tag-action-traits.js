/**
 * Macro: give actions (and spells) their Traits, by name.
 *
 * Statuses check an action's Traits before it's used (effects/status-restrictions.mjs):
 *   speech    Silence           (language-related actions and spells)
 *   reaction  Off Guard         (can't take reactions)
 *   grapple   Bound             (can't grapple)
 *   parry     Bound             (can't parry)
 *   aimed     Blind             (anything aimed at someone: an Inspiration check first)
 * Traits can be ticked on an action's Details tab. This macro tags many at once, by name: run it after adding
 * actions or spells that should have Traits (add them to the TRAITS list first).
 *
 * It only ADDS traits: an action keeps any it already has. It looks at:
 *   - the Actions and Spells & Rituals compendiums (unlocked for the update, locked again after)
 *   - world Items
 *   - Items owned by world actors
 *   (Unlinked tokens on scenes keep their own copies: drag the action onto them again, or tick the boxes.)
 *
 * How to use:
 *   1. Check the TRAITS list below. Add, take out or change names to match your game. The rituals are commented
 *      out: take the "//" off any that need speech.
 *   2. Make a Script macro with this code and run it as the GM. It only REPORTS what it would change (console, F12,
 *      and a chat message only you see).
 *   3. If the report looks right, change APPLY to true and run it again.
 */

const APPLY = false;

/** Action or spell name (not case-sensitive) -> the traits it gets. */
const TRAITS = {
  "Grapple": ["grapple", "aimed"],
  "Limb parry": ["parry", "reaction"],
  "Borrow Protection": ["reaction"],
  "Leverage": ["reaction", "aimed"],
  "Intimidate": ["speech", "aimed"],

  "Attack (Short Blade)": ["aimed"],
  "Attack Two Combo (Short Blade)": ["aimed"],
  "Double Hit": ["aimed"],
  "Feint": ["aimed"],
  "Leg Sweep": ["aimed"],
  "Proximity Shot": ["aimed"],
  "Rush": ["aimed"],
  "Shoot (Bolt Action Rifle)": ["aimed"],
  "Shoot (Revolver)": ["aimed"],
  "Vital Strike": ["aimed"],

  // Rituals: most have an incantation. Take the "//" off the ones that should be stopped by Silence.
  // "Artificial Sleepwalking Ritual": ["speech"],
  // "Invocation of Power Ritual Magic": ["speech"],
  // "Magic Mirror Divination Ritual Magic": ["speech"],
  // "Mediumship Ritual Magic": ["speech"],
  // "Portrait Ritual Magic": ["speech"],
  // "Sacrifice Ritual Magic": ["speech"],
  // "Secret Ceremony": ["speech"],
  // "Solidification Ritual Magic": ["speech"],
  // "Summoning Ritual Magic": ["speech"],
  // "Sacrifice a Lamb": ["speech"],
};

const PACKS = ["lotm.action_compendium", "lotm.spell_and_rituals_compendium"];

const known = new Set(Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTraits));
const byName = new Map(Object.entries(TRAITS).map(([name, traits]) => [name.toLowerCase(), traits]));
const rows = [];   // { where, name, before, after }

for (const [name, traits] of Object.entries(TRAITS)) {
  const wrong = traits.filter((trait) => !known.has(trait));
  if (wrong.length) ui.notifications.warn(`Tag Action Traits: "${name}" has unknown traits: ${wrong.join(", ")}`);
}

/**
 * The update for one Item, or null when it isn't on the list or already has the traits.
 * @param {Item} item
 * @param {string} where   What it's in, for the report.
 */
function updateFor(item, where) {
  if (!["action", "spell"].includes(item.type)) return null;
  const wanted = (byName.get(item.name.trim().toLowerCase()) ?? []).filter((trait) => known.has(trait));
  if (!wanted.length) return null;

  const before = [...(item.system.traits ?? [])];
  const after = [...new Set([...before, ...wanted])];
  if (after.length === before.length) return null;

  rows.push({ where, name: item.name, before: before.join(", ") || "-", after: after.join(", ") });
  return { _id: item.id, "system.traits": after };
}

// Compendiums.
for (const id of PACKS) {
  const pack = game.packs.get(id);
  if (!pack) continue;
  const items = await pack.getDocuments();
  const updates = items.map((item) => updateFor(item, `Compendium: ${pack.metadata.label}`)).filter(Boolean);
  if (APPLY && updates.length) {
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });
    await Item.implementation.updateDocuments(updates, { pack: id });
    if (wasLocked) await pack.configure({ locked: true });
  }
}

// World Items.
const worldUpdates = game.items.map((item) => updateFor(item, "World Item")).filter(Boolean);
if (APPLY && worldUpdates.length) await Item.implementation.updateDocuments(worldUpdates);

// Items owned by world actors.
for (const actor of game.actors) {
  const updates = actor.items.map((item) => updateFor(item, `Actor: ${actor.name}`)).filter(Boolean);
  if (APPLY && updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}

// Report.
console.table(rows);
const esc = Handlebars.escapeExpression;
const list = rows.length
  ? `<ul>${rows.map((row) => `<li><strong>${esc(row.name)}</strong> (${esc(row.where)}): ${esc(row.before)} &rarr; ${esc(row.after)}</li>`).join("")}</ul>`
  : "<p>Nothing to change: every action on the list already has its traits.</p>";
await ChatMessage.create({
  content: `<h3>Tag Action Traits ${APPLY ? "(applied)" : "(report only)"}</h3>
    <p>${rows.length} item(s) ${APPLY ? "updated" : "would be updated"}.</p>${list}
    ${APPLY || !rows.length ? "" : "<p>Set APPLY to true and run it again to make these changes.</p>"}`,
  whisper: [game.user.id],
});
