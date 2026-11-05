/**
 * Macro: retire the old gun actions (Reload, Pull Bolt, a Rotate or Unload action...).
 *
 * Reloading, chambering, rotating and unloading used to be actions of their own on each gun's action list. They're
 * now buttons on the gun's Shoot action, and how long each takes is set on the gun's sheet, under Handling
 * (helpers/gun-handling.mjs). This macro finishes the move, gun by gun:
 *   - each action on the gun's list whose "Uses ammo" is Reloads, Chambers a round, Rotates the cylinder or Unloads
 *     has its Action Type copied onto the gun's Handling (a reload's Rounds per use goes to Rounds per Reload)
 *   - then that action is taken off the gun's action list (the action itself isn't deleted)
 *
 * It looks at:
 *   - the Containers and Gear compendium (unlocked for the update, locked again after)
 *   - world Items
 *   - Items owned by world actors, and by unlinked tokens on every scene
 * It also lists, without changing them, the old actions themselves (in the Actions compendium, the sidebar, or owned
 * by a character directly): delete those by hand once the guns are done.
 *
 * How to use:
 *   1. Make a Script macro with this code and run it as the GM. It only REPORTS what it would change (console, F12,
 *      and a chat message only you see).
 *   2. If the report looks right, change APPLY to true and run it again. Running it a third time finds nothing.
 */

const APPLY = false;

/** The old "Uses ammo" values that are now gun handling. */
const OLD_USES = ["reload", "chamber", "rotate", "unload"];
const GEAR_PACK = "lotm.containers_and_gear_compendium";
const ACTION_PACK = "lotm.action_compendium";

const actionTypes = CONFIG.LORD_OF_THE_MYSTERIES.actionTypes;
const typeName = (type) => game.i18n.localize(actionTypes[type] ?? type);
const isOldAction = (item) => item?.type === "action" && OLD_USES.includes(item.system?.ammoUse);

const rows = [];          // guns: { where, gun, moved }
const leftovers = [];     // old actions to delete by hand: { where, name }


/**
 * The update for one gun, or null when nothing on its action list is an old gun action.
 * @param {Item} gun
 * @param {string} where   What it's in, for the report.
 */
async function updateFor(gun, where) {
  if (gun.type !== "gear" || !gun.system.isFirearm) return null;

  const keep = [];
  const moved = [];
  const update = { _id: gun.id };
  for (const uuid of gun.system.actionList ?? []) {
    const action = uuid ? await fromUuid(uuid).catch(() => null) : null;
    if (!isOldAction(action)) {
      keep.push(uuid);
      continue;
    }
    const use = action.system.ammoUse;
    const type = action.system.actionType;
    if (type in actionTypes) update[`system.firearm.handling.${use}.actionType`] = type;
    if (use === "reload") update["system.firearm.handling.reload.rounds"] = action.system.ammoAmount ?? 0;
    moved.push(`${action.name} → ${game.i18n.localize(`LORD_OF_THE_MYSTERIES.Firearm.Buttons.${use}`)}: ${typeName(type)}`);
  }
  if (!moved.length) return null;

  update["system.actionList"] = keep;
  rows.push({ where, gun: gun.name, moved: moved.join("; ") });
  return update;
}


/** Note the old actions an actor owns directly (not through a gun). */
function noteOwnedActions(actor, where) {
  for (const item of actor.items) {
    if (isOldAction(item)) leftovers.push({ where, name: item.name });
  }
}


// The Containers and Gear compendium.
const gearPack = game.packs.get(GEAR_PACK);
if (gearPack) {
  const items = await gearPack.getDocuments();
  const updates = [];
  for (const item of items) {
    const update = await updateFor(item, `Compendium: ${gearPack.metadata.label}`);
    if (update) updates.push(update);
  }
  if (APPLY && updates.length) {
    const wasLocked = gearPack.locked;
    if (wasLocked) await gearPack.configure({ locked: false });
    await Item.implementation.updateDocuments(updates, { pack: GEAR_PACK });
    if (wasLocked) await gearPack.configure({ locked: true });
  }
}

// World Items (guns in the sidebar, and old actions there).
const worldUpdates = [];
for (const item of game.items) {
  const update = await updateFor(item, "World Item");
  if (update) worldUpdates.push(update);
  if (isOldAction(item)) leftovers.push({ where: "World Item", name: item.name });
}
if (APPLY && worldUpdates.length) await Item.implementation.updateDocuments(worldUpdates);

// Items owned by world actors, then unlinked tokens (they keep their own copies).
async function updateActor(actor, where) {
  const updates = [];
  for (const item of actor.items) {
    const update = await updateFor(item, where);
    if (update) updates.push(update);
  }
  if (APPLY && updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  noteOwnedActions(actor, where);
}
for (const actor of game.actors) await updateActor(actor, `Actor: ${actor.name}`);
for (const scene of game.scenes) {
  for (const token of scene.tokens) {
    if (token.actorLink || !token.actor) continue;
    await updateActor(token.actor, `Token: ${token.name} (${scene.name})`);
  }
}

// The old actions in the Actions compendium: listed, to delete by hand.
const actionPack = game.packs.get(ACTION_PACK);
if (actionPack) {
  for (const item of await actionPack.getDocuments()) {
    if (isOldAction(item)) leftovers.push({ where: `Compendium: ${actionPack.metadata.label}`, name: item.name });
  }
}

// Report.
console.table(rows);
console.table(leftovers);
const esc = Handlebars.escapeExpression;
const gunList = rows.length
  ? `<ul>${rows.map((row) => `<li><strong>${esc(row.gun)}</strong> (${esc(row.where)}): ${esc(row.moved)}</li>`).join("")}</ul>`
  : "<p>No gun has an old Reload, Chamber, Rotate or Unload action on its list.</p>";
const leftoverList = leftovers.length
  ? `<p>Old gun actions to delete by hand (they do nothing now):</p>
     <ul>${leftovers.map((row) => `<li><strong>${esc(row.name)}</strong> (${esc(row.where)})</li>`).join("")}</ul>`
  : "";
await ChatMessage.create({
  content: `<h3>Retire Gun Actions ${APPLY ? "(applied)" : "(report only)"}</h3>
    <p>${rows.length} gun(s) ${APPLY ? "updated" : "would be updated"}.</p>${gunList}${leftoverList}
    ${APPLY || !rows.length ? "" : "<p>Set APPLY to true and run it again to make these changes.</p>"}`,
  whisper: [game.user.id],
});
