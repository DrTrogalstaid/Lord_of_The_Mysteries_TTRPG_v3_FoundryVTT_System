/**
 * Macro: move Spirit Vision's +2 from every Inspiration check to spiritual intuition checks only.
 *
 * The rulebook gives Spirit Vision "+2 to spiritual intuition checks". The old Spirit Vision effects added +2 to
 * system.attributes.ins.checkBonus instead, which put +2 on every Inspiration check and Inspiration skill (Listening,
 * Reconnaissance, Psychology, Occultism, and so every spell attack). Spiritual intuition now has its own bonus,
 * system.spiritualIntuitionBonus (the Inspiration check dialog's "Spiritual Intuition" box). This macro changes each
 * Spirit Vision effect's change key from the first to the second. Nothing else about the effects changes.
 *
 * It looks at effects whose name has "Spirit Vision" in it (set ONLY_SPIRIT_VISION to false for every effect with
 * that change key) in:
 *   - the Effects, Abilities and Actions compendiums (unlocked for the update, locked again after)
 *   - world Items, and Items and effects on world actors and on unlinked tokens on every scene
 *
 * How to use:
 *   1. Make a Script macro with this code and run it as the GM. It only REPORTS what it would change (console, F12,
 *      and a chat message only you see).
 *   2. If the report looks right, change APPLY to true and run it again. Running it a third time finds nothing.
 */

const APPLY = false;
const ONLY_SPIRIT_VISION = true;

const OLD_KEY = "system.attributes.ins.checkBonus";
const NEW_KEY = "system.spiritualIntuitionBonus";
const ITEM_PACKS = ["lotm.ability_compendium", "lotm.action_compendium"];
const EFFECT_PACK = "lotm.effects";

const rows = [];   // { where, effect }


/**
 * The update for one effect, or null when it has no change to move.
 * @param {ActiveEffect} effect
 * @param {string} where   For the report.
 */
function updateFor(effect, where) {
  if (ONLY_SPIRIT_VISION && !/spirit vision/i.test(effect.name ?? "")) return null;
  const inSystem = Array.isArray(effect.system?.changes);
  const changes = (inSystem ? effect.system.changes : effect.changes) ?? [];
  if (!changes.some((change) => change?.key === OLD_KEY)) return null;
  const moved = changes.map((change) => (change?.key === OLD_KEY ? { ...change, key: NEW_KEY } : change));
  rows.push({ where, effect: effect.name });
  return { _id: effect.id, [inSystem ? "system.changes" : "changes"]: moved };
}


/** Update the effects on one document (an Item or an Actor). */
async function updateParent(parent, where, { pack } = {}) {
  const updates = [];
  for (const effect of parent.effects ?? []) {
    const update = updateFor(effect, where);
    if (update) updates.push(update);
  }
  if (APPLY && updates.length) await parent.updateEmbeddedDocuments("ActiveEffect", updates, pack ? { pack } : {});
}


/** Run a step on an unlocked compendium, locking it again after. */
async function withUnlocked(pack, step) {
  const wasLocked = pack.locked;
  if (APPLY && wasLocked) await pack.configure({ locked: false });
  try {
    await step();
  } finally {
    if (APPLY && wasLocked) await pack.configure({ locked: true });
  }
}


// Compendiums of Items (abilities and actions carry Spirit Vision's effect).
for (const id of ITEM_PACKS) {
  const pack = game.packs.get(id);
  if (!pack) continue;
  await withUnlocked(pack, async () => {
    for (const item of await pack.getDocuments()) await updateParent(item, `Compendium: ${pack.metadata.label} / ${item.name}`);
  });
}

// The Effects compendium (effects on their own).
const effectPack = game.packs.get(EFFECT_PACK);
if (effectPack) {
  await withUnlocked(effectPack, async () => {
    const updates = [];
    for (const effect of await effectPack.getDocuments()) {
      const update = updateFor(effect, `Compendium: ${effectPack.metadata.label}`);
      if (update) updates.push(update);
    }
    if (APPLY && updates.length) await ActiveEffect.implementation.updateDocuments(updates, { pack: EFFECT_PACK });
  });
}

// World Items.
for (const item of game.items) await updateParent(item, `World Item: ${item.name}`);

// Actors: their own effects (copies of granted effects, toggled Spirit Vision) and their Items' effects.
async function updateActor(actor, where) {
  await updateParent(actor, where);
  for (const item of actor.items) await updateParent(item, `${where} / ${item.name}`);
}
for (const actor of game.actors) await updateActor(actor, `Actor: ${actor.name}`);
for (const scene of game.scenes) {
  for (const token of scene.tokens) {
    if (token.actorLink || !token.actor) continue;
    await updateActor(token.actor, `Token: ${token.name} (${scene.name})`);
  }
}

// Report.
console.table(rows);
const esc = Handlebars.escapeExpression;
const list = rows.length
  ? `<ul>${rows.map((row) => `<li><strong>${esc(row.effect)}</strong> (${esc(row.where)})</li>`).join("")}</ul>`
  : "<p>No effect adds to Inspiration's check bonus any more.</p>";
await ChatMessage.create({
  content: `<h3>Move Spirit Vision Bonus ${APPLY ? "(applied)" : "(report only)"}</h3>
    <p>${rows.length} effect(s) ${APPLY ? "moved" : "would be moved"} from every Inspiration check to spiritual intuition checks.</p>${list}
    ${APPLY || !rows.length ? "" : "<p>Set APPLY to true and run it again to make these changes.</p>"}`,
  whisper: [game.user.id],
});
