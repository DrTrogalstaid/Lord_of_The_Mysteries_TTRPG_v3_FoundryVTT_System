/**
 * Firearms and ammunition. Goes in helpers/ next to inventory.mjs.
 *
 * How it fits together:
 *   - An ammo Item is gear with "Ammunition" ticked. Quantity = boxes. system.ammo.rounds = rounds left in the
 *     open box; every other box is full (system.ammo.perBox). For loose rounds, set perBox to 1.
 *   - A gun is gear with "Firearm" ticked. The rounds are stored ON the gun: system.firearm.magazine (a list)
 *     and system.firearm.chamber (one round, or null). Each round keeps its name, image and the id of the
 *     ammo Item it came from.
 *   - An action's "Uses ammo" setting (system.ammoUse) decides what it does to the gun:
 *       fire     the attack button spends rounds (system.ammoAmount per use, 0 = 1)
 *       reload   moves rounds from a box into the magazine (system.ammoAmount per use, 0 = fill it)
 *       chamber  moves the next round from the magazine into the chamber
 *       unload   puts every round back in its box
 *
 * Rounds fire in the order they were loaded.
 */

import { autoPlacement } from "./inventory.mjs";

const L = "LORD_OF_THE_MYSTERIES.Firearm";

/** Translate a key under LORD_OF_THE_MYSTERIES.Firearm, filling in {placeholders} when data is given. */
const t = (key, data) => (data ? game.i18n.format(`${L}.${key}`, data) : game.i18n.localize(`${L}.${key}`));

/** Show a yellow warning and return null, so callers can write `return warn(...)`. */
function warn(key, data) {
  ui.notifications.warn(t(key, data));
  return null;
}

const esc = (text) => Handlebars.escapeExpression(text ?? "");

/** The choices for an action's "Uses ammo" dropdown. Same keys as ammoUse in action.mjs. */
export const AMMO_USES = {
  none: `${L}.AmmoUse.none`,
  fire: `${L}.AmmoUse.fire`,
  reload: `${L}.AmmoUse.reload`,
  chamber: `${L}.AmmoUse.chamber`,
  unload: `${L}.AmmoUse.unload`,
};


/* -------------------------------------------- */
/*  Ammo boxes                                   */
/* -------------------------------------------- */

/** Rounds in an ammo stack (the open box plus the full ones). Worked out in gear.mjs prepareDerivedData. */
export const ammoTotal = (item) => item.system.ammoTotal ?? 0;

/**
 * Turn a number of rounds back into boxes: full boxes, plus one open box on top.
 * 47 rounds at 20 a box -> 3 boxes, 7 rounds in the open one.
 */
export function boxesFor(total, perBox) {
  if (total <= 0) return { quantity: 0, rounds: 0 };
  const quantity = Math.ceil(total / perBox);
  return { quantity, rounds: total - (quantity - 1) * perBox };
}

/** The update that leaves an ammo stack holding `total` rounds. */
function boxUpdate(box, total) {
  const { quantity, rounds } = boxesFor(total, box.system.ammo.perBox);
  return { _id: box.id, "system.quantity": quantity, "system.ammo.rounds": rounds };
}

const sameText = (a, b) => (a ?? "").trim().toLocaleLowerCase() === (b ?? "").trim().toLocaleLowerCase();

/** Whether this ammo fits this gun. A gun with no caliber takes anything. */
export function fitsGun(gun, box) {
  const caliber = gun.system.firearm.caliber?.trim();
  return !caliber || sameText(caliber, box.system.ammo.caliber);
}

/** Whether the character can reach an Item: not packed in a bag that was left behind (see calculateCarrying in inventory.mjs). */
function onPerson(actor, item) {
  return actor.system.carrying?.gear?.[item.id]?.place !== "leftBehind";
}

/** Ammo the character has on them that fits this gun and isn't empty. */
export function ammoFor(actor, gun) {
  return actor.items.filter((item) =>
    item.type === "gear" && item.system.isAmmo && ammoTotal(item) > 0 && fitsGun(gun, item) && onPerson(actor, item)
  );
}


/* -------------------------------------------- */
/*  Which gun                                    */
/* -------------------------------------------- */

/**
 * The gun an action uses.
 *   - An action that comes from a gun's own action list knows its gun (gunId, the gun's id on the actor).
 *   - An action the character owns by itself uses the gun in their hand, if they hold exactly one.
 * @param {Actor} actor
 * @param {string} [gunId]
 * @param {{quiet?: boolean}} [options]  quiet: no warning when there's no gun (for the sheet display).
 * @returns {Item|null}
 */
export function gunFor(actor, gunId, { quiet = false } = {}) {
  if (gunId) {
    const gun = actor.items.get(gunId);
    if (gun?.system.isFirearm) return gun;
    return quiet ? null : warn("Warnings.NotAFirearm", { name: gun?.name ?? "?" });
  }
  const held = actor.items.filter((item) => item.type === "gear" && item.system.isFirearm && item.system.carry === "held");
  if (held.length === 1) return held[0];
  if (quiet) return null;
  return warn(held.length ? "Warnings.WhichGun" : "Warnings.NoGun");
}


/* -------------------------------------------- */
/*  What's in the gun                            */
/* -------------------------------------------- */

/** A copy of the gun's rounds that can be changed freely, then saved with gunFields(). */
function gunState(gun) {
  const { magazine, chamber } = gun.toObject().system.firearm;
  return { magazine: [...magazine], chamber: chamber ?? null };
}

/** The update fields that save a gunState back onto the gun. */
const gunFields = (state) => ({
  "system.firearm.magazine": state.magazine,
  "system.firearm.chamber": state.chamber,
});

/** "Silver bullet ×2, Lead round ×3" (or "Empty"). */
function describeRounds(rounds) {
  if (!rounds.length) return t("Empty");
  const counts = new Map();   // name -> how many
  for (const round of rounds) {
    const name = round.name || t("Round");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ");
}

/**
 * Everything the sheets show about a gun.
 * @returns {{loaded: number, capacity: number, hasChamber: boolean, chambered: boolean, empty: boolean,
 *            label: string, contents: string, chamberName: string, nextName: string, tooltip: string}}
 */
export function firearmStatus(gun) {
  const { capacity, hasChamber, magazine, chamber } = gun.system.firearm;
  const next = hasChamber ? chamber : magazine[0];

  const contents = describeRounds(magazine);
  const chamberName = chamber ? (chamber.name || t("Round")) : t("Empty");
  // What fires next. A chambered gun with an empty chamber won't fire, even with a full magazine.
  const nextName = next ? (next.name || t("Round")) : t(hasChamber && magazine.length ? "NeedsChambering" : "Empty");

  const lines = [`${t("Loaded")}: ${magazine.length}/${capacity} (${contents})`];
  if (hasChamber) lines.push(`${t("Chamber")}: ${chamberName}`);
  lines.push(`${t("Next")}: ${nextName}`);

  return {
    loaded: magazine.length,
    capacity,
    hasChamber,
    chambered: !!chamber,
    empty: !next,
    label: `${magazine.length}/${capacity}`,
    contents,
    chamberName,
    nextName,
    // The tooltip is HTML, so the names in it are escaped.
    tooltip: lines.map(esc).join("<br>"),
  };
}

/** What the sheets show about an ammo stack: "47 rounds", with the boxes on hover. */
export function ammoBoxStatus(box) {
  const total = ammoTotal(box);
  const { perBox, caliber } = box.system.ammo;
  const lines = [];
  if (caliber) lines.push(`${t("Caliber")}: ${caliber}`);
  if (perBox > 1 && total > 0) {
    lines.push(t("BoxTooltip", { boxes: box.system.quantity, open: total - (box.system.quantity - 1) * perBox, perBox }));
  }
  return {
    total,
    empty: total === 0,
    label: t("Rounds", { n: total }),
    tooltip: lines.map(esc).join("<br>"),
  };
}


/* -------------------------------------------- */
/*  Firing                                       */
/* -------------------------------------------- */

/**
 * Work out what firing `amount` rounds would do, without saving anything.
 * @returns {{fired: object[], state: {magazine: object[], chamber: object|null}}}
 *   fired  The rounds that would come out (fewer than `amount` if the gun runs dry or needs chambering).
 *   state  What would be left in the gun.
 */
function planShots(gun, amount) {
  const { hasChamber, selfLoading } = gun.system.firearm;
  const state = gunState(gun);
  const fired = [];

  // One shot each time round, until we've fired enough or the gun can't fire any more.
  while (fired.length < amount) {
    if (!hasChamber) {
      // Revolver: fire straight from the cylinder. shift() takes the first round out of the list.
      if (!state.magazine.length) break;
      fired.push(state.magazine.shift());
    } else {
      // Fire the chambered round. A self-loading gun then chambers the next one by itself;
      // any other gun is left with an empty chamber until a "chamber" action.
      if (!state.chamber) break;
      fired.push(state.chamber);
      state.chamber = selfLoading ? (state.magazine.shift() ?? null) : null;
    }
  }
  return { fired, state };
}

/**
 * Whether the gun has `amount` rounds ready to fire. Shows a warning ("Click. Revolver is empty.") if not.
 * @returns {boolean}
 */
export function canFire(gun, amount = 1) {
  const { fired } = planShots(gun, amount);
  if (fired.length >= amount) return true;

  const { hasChamber, magazine } = gun.system.firearm;
  if (fired.length) warn("Warnings.NotEnough", { gun: gun.name, n: fired.length });
  else if (hasChamber && magazine.length) warn("Warnings.NotChambered", { gun: gun.name });
  else warn("Warnings.Empty", { gun: gun.name });
  return false;
}

/**
 * Fire rounds: take them out of the gun.
 * @param {Actor} actor
 * @param {Item} gun
 * @param {{amount?: number, chat?: boolean}} [options]
 *   chat  Also post "Fired 1 from Revolver" (for fire actions that have no attack roll of their own).
 * @returns {Promise<object[]|null>}  The rounds fired, or null if it couldn't fire.
 */
export async function fireGun(actor, gun, { amount = 1, chat = false } = {}) {
  if (!canFire(gun, amount)) return null;
  const { fired, state } = planShots(gun, amount);
  await gun.update(gunFields(state));
  if (chat) await postChat(actor, gun, t("Chat.fire", { n: fired.length, gun: gun.name, rounds: describeRounds(fired) }));
  return fired;
}


/* -------------------------------------------- */
/*  Reloading, chambering, unloading             */
/* -------------------------------------------- */

/**
 * Load rounds from an ammo box into the magazine. If the character has more than one kind of ammo that fits,
 * they're asked which.
 * @param {Actor} actor
 * @param {Item} gun
 * @param {{amount?: number}} [options]  How many rounds to load. 0 = as many as fit.
 */
export async function reloadGun(actor, gun, { amount = 0 } = {}) {
  const { capacity, caliber } = gun.system.firearm;
  const state = gunState(gun);

  const room = capacity - state.magazine.length;
  if (room <= 0) return warn("Warnings.Full", { gun: gun.name });

  const boxes = ammoFor(actor, gun);
  if (!boxes.length) return warn("Warnings.NoAmmo", { gun: gun.name, caliber: caliber || t("AnyCaliber") });

  const box = boxes.length === 1 ? boxes[0] : await pickAmmo(gun, boxes);
  if (!box) return null;   // the dialog was closed

  // As many as were asked for, but no more than fit and no more than the box has.
  const wanted = amount > 0 ? Math.min(amount, room) : room;
  const count = Math.min(wanted, ammoTotal(box));

  // `count` copies of this kind of round, added to the end of the magazine.
  const round = { name: box.name, img: box.img, ammoId: box.id };
  for (let i = 0; i < count; i++) state.magazine.push({ ...round });

  // The gun and the box change together, in one update.
  await actor.updateEmbeddedDocuments("Item", [
    { _id: gun.id, ...gunFields(state) },
    boxUpdate(box, ammoTotal(box) - count),
  ]);

  await postChat(actor, gun, t("Chat.reload", {
    n: count, ammo: box.name, gun: gun.name, loaded: state.magazine.length, capacity,
  }));
  return count;
}

/** Ask which ammo to load. Resolves to the chosen ammo Item, or null if the dialog is closed. */
async function pickAmmo(gun, boxes) {
  const options = boxes
    .map((box) => `<option value="${box.id}">${esc(box.name)} (${t("Rounds", { n: ammoTotal(box) })})</option>`)
    .join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("PickAmmoTitle", { gun: gun.name }) },
    content: `<div class="form-group">
        <label>${t("PickAmmo")}</label>
        <div class="form-fields"><select name="ammo">${options}</select></div>
      </div>`,
    ok: {
      label: t("Buttons.reload"),
      callback: (event, button) => button.form.elements.ammo.value,
    },
    rejectClose: false,
  });
  return boxes.find((box) => box.id === id) ?? null;
}

/** Move the next round from the magazine into the chamber (rack the slide, work the bolt). */
export async function chamberRound(actor, gun) {
  if (!gun.system.firearm.hasChamber) return warn("Warnings.NoChamber", { gun: gun.name });
  const state = gunState(gun);
  if (state.chamber) return warn("Warnings.AlreadyChambered", { gun: gun.name });
  if (!state.magazine.length) return warn("Warnings.NothingToChamber", { gun: gun.name });

  state.chamber = state.magazine.shift();
  await gun.update(gunFields(state));
  await postChat(actor, gun, t("Chat.chamber", { gun: gun.name, round: state.chamber.name || t("Round") }));
  return state.chamber;
}

/**
 * Take every round out of the gun (magazine and chamber) and put it back in the box it came from.
 * A round whose box is gone goes into another box with the same name, and failing that into a new stack
 * of loose rounds.
 */
export async function unloadGun(actor, gun) {
  const state = gunState(gun);
  const rounds = [...state.magazine];
  if (state.chamber) rounds.push(state.chamber);
  if (!rounds.length) return warn("Warnings.NothingToUnload", { gun: gun.name });

  const backTo = new Map();   // ammo Item id -> how many rounds go back into it
  const loose = [];           // rounds with no box to go back to
  for (const round of rounds) {
    const box = boxForRound(actor, gun, round);
    if (box) backTo.set(box.id, (backTo.get(box.id) ?? 0) + 1);
    else loose.push(round);
  }

  const updates = [{ _id: gun.id, ...gunFields({ magazine: [], chamber: null }) }];
  for (const [id, count] of backTo) {
    const box = actor.items.get(id);
    updates.push(boxUpdate(box, ammoTotal(box) + count));
  }
  await actor.updateEmbeddedDocuments("Item", updates);
  if (loose.length) await actor.createEmbeddedDocuments("Item", looseStacks(actor, gun, loose));

  await postChat(actor, gun, t("Chat.unload", { n: rounds.length, gun: gun.name }));
  return rounds.length;
}

/** The ammo Item a round goes back into: the one it came from, or one with the same name that fits the gun. */
function boxForRound(actor, gun, round) {
  const original = actor.items.get(round.ammoId);
  if (original?.system.isAmmo) return original;
  return actor.items.find((item) =>
    item.type === "gear" && item.system.isAmmo && sameText(item.name, round.name) && fitsGun(gun, item)
  ) ?? null;
}

/** New ammo Items for rounds with no box: one stack of loose rounds per name. */
function looseStacks(actor, gun, rounds) {
  const byName = new Map();   // name -> { round, count }
  for (const round of rounds) {
    const stack = byName.get(round.name) ?? { round, count: 0 };
    stack.count += 1;
    byName.set(round.name, stack);
  }

  return [...byName.values()].map(({ round, count }) => {
    const data = {
      name: round.name || t("LooseRounds"),
      img: round.img || "icons/svg/item-bag.svg",
      type: "gear",
      system: {
        size: "tiny",
        quantity: count,
        isAmmo: true,
        ammo: { caliber: gun.system.firearm.caliber, perBox: 1, rounds: 1 },
      },
    };
    // Put it in a pocket or bag, the same way dropped gear is placed (player-character-sheet.mjs #dropEmbedded).
    foundry.utils.mergeObject(data, foundry.utils.expandObject(autoPlacement(actor, data)));
    return data;
  });
}


/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

/**
 * Do what an ammo action does (its "Uses ammo" setting), without an attack roll.
 * The character sheet's ammo button calls this. "fire" here is for fire actions that have no attack roll.
 * @param {Actor} actor
 * @param {Item} action
 * @param {string} [gunId]  The gun the action came from, if any (see gunFor).
 * @param {string} [use]    What to do. Defaults to the action's own "Uses ammo" setting; the Unload button
 *                          on a reload action passes "unload".
 */
export async function useAmmoAction(actor, action, gunId, use = action.system.ammoUse) {
  const gun = gunFor(actor, gunId);
  if (!gun) return null;
  const amount = action.system.ammoAmount ?? 0;

  switch (use) {
    case "fire": return fireGun(actor, gun, { amount: Math.max(1, amount), chat: true });
    case "reload": return reloadGun(actor, gun, { amount });
    case "chamber": return chamberRound(actor, gun);
    case "unload": return unloadGun(actor, gun);
    default: return null;
  }
}

/** A short chat line with the gun's picture: "Loaded 6 × Silver bullets into Revolver (6/6)." */
async function postChat(actor, gun, text) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="lotm chat-ammo">
        <img src="${esc(gun.img)}" width="28" height="28" alt="">
        <span>${esc(text)}</span>
      </div>`,
  });
}
