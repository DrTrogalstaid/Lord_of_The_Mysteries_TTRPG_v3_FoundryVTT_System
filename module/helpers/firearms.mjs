/**
 * Firearms and ammunition. Goes in helpers/ next to inventory.mjs.
 *
 * How it fits together:
 *   - An ammo Item is gear with "Ammunition" ticked. Quantity = boxes. system.ammo.rounds = rounds left in the
 *     open box; every other box is full (system.ammo.perBox). For loose rounds, set perBox to 1.
 *     Ammo can grant abilities like any gear; a round copies them when it's loaded (a special bullet).
 *   - A gun is gear with "Firearm" ticked. The rounds are stored ON the gun, and how depends on its feed
 *     (system.firearm.feed, helpers/gun-feed.mjs):
 *       magazine   rifles, pistols, pump shotguns: the last round loaded fires first; maybe a chamber
 *       cylinder   revolvers: the chamber under the hammer fires, then the cylinder turns one chamber
 *       barrels    break-action shotguns: one round per barrel
 *     Each round keeps its name, image, the id of the ammo Item it came from, and that ammo's abilities.
 *   - An action set to "Uses ammo: Fires rounds" (system.ammoUse "fire") spends rounds with its attack button
 *     (system.ammoAmount per shot, 0 = 1). That's the gun's Shoot action.
 *   - Everything else done to a gun (Reload, Chamber, Rotate, Unload) is gun handling: buttons on the Shoot row,
 *     set up on the gun itself (helpers/gun-handling.mjs). They call the functions here:
 *       reloadGun       asks which ammo and how many (up to the room left), and loads it
 *       chamberRound    magazine guns: moves the top round of the magazine into the chamber
 *       rotateCylinder  revolvers: puts the chamber you pick under the hammer
 *       unloadGun       puts every round back in its box
 *   - A special round (its ammo has abilities) sets off its abilities' spells when it's fired: each spell's
 *     Spirituality Cost is spent then, and a chat card gets a Cast button for it (activateBullets below).
 */

import { autoPlacement } from "./inventory.mjs";
import { confirmStatusRestrictions, postUsedDespite } from "../effects/status-restrictions.mjs";
import { spendSpirituality, spiritualityCost } from "./spirituality.mjs";
import { BarrelFeed, CylinderFeed, GunFeed, MagazineFeed, isSpecialRound, roundFromAmmo, sameKind } from "./gun-feed.mjs";

const L = "LORD_OF_THE_MYSTERIES.Firearm";

/** Translate a key under LORD_OF_THE_MYSTERIES.Firearm, filling in {placeholders} when data is given. */
const t = (key, data) => (data ? game.i18n.format(`${L}.${key}`, data) : game.i18n.localize(`${L}.${key}`));

/** Show a yellow warning and return null, so callers can write `return warn(...)`. */
function warn(key, data) {
  ui.notifications.warn(t(key, data));
  return null;
}

const esc = (text) => Handlebars.escapeExpression(text ?? "");

/** The choices for an action's "Uses ammo" dropdown (system.ammoUse in action.mjs). */
export const AMMO_USES = {
  none: `${L}.AmmoUse.none`,
  fire: `${L}.AmmoUse.fire`,
};

/**
 * "Uses ammo" values from before gun handling moved onto the gun (helpers/gun-handling.mjs). Old Reload / Pull Bolt
 * actions still have them, so they still load, but they do nothing now: module/macros/retire-gun-actions.js copies
 * their Action Type onto their gun and takes them off its action list.
 */
export const OLD_AMMO_USES = {
  reload: `${L}.AmmoUse.reload`,
  chamber: `${L}.AmmoUse.chamber`,
  rotate: `${L}.AmmoUse.rotate`,
  unload: `${L}.AmmoUse.unload`,
};

/** The choices for a gun's Feed dropdown (helpers/gun-feed.mjs). */
export const FEEDS = {
  magazine: `${L}.Feed.magazine`,
  cylinder: `${L}.Feed.cylinder`,
  barrels: `${L}.Feed.barrels`,
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

/** The gun's feed, from a copy of its saved data, so it can be changed freely and saved with feed.toUpdate(). */
export function feedOf(gun) {
  return GunFeed.for(gun.toObject().system.firearm);
}

/** A round's name for chat and the sheets ("Round" when it has none). */
const roundName = (round) => round?.name || t("Round");

/** "Silver bullet ×2, Lead round ×3" (or "Empty"). */
function describeRounds(rounds) {
  if (!rounds.length) return t("Empty");
  const counts = new Map();   // name -> how many
  for (const round of rounds) {
    const name = roundName(round);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ");
}

/** "Chamber", "Chamber 3", "Barrel 2", or "3" (a magazine's place from the top). */
function positionLabel(feed, slot) {
  if (slot.isChamber) return t("Chamber");
  if (feed instanceof CylinderFeed) return t("ChamberN", { n: slot.position });
  if (feed instanceof BarrelFeed) return t("BarrelN", { n: slot.position });
  return String(slot.position);
}

/**
 * Everything the sheets show about a gun.
 * @returns {{feed: string, loaded: number, capacity: number, hasChamber: boolean, chambered: boolean, empty: boolean,
 *            label: string, contents: string, chamberName: string, nextName: string, tooltip: string,
 *            rounds: {label: string, name: string, img: string, special: boolean, empty: boolean, next: boolean}[]}}
 *   rounds: every round (and empty chamber / barrel) in firing order, for the gear sheet's list.
 */
export function firearmStatus(gun) {
  const feed = feedOf(gun);
  const order = feed.firingOrder();
  const loadedRounds = order.map((slot) => slot.round).filter(Boolean);
  const isMagazine = feed instanceof MagazineFeed;
  const hasChamber = isMagazine && feed.hasChamber;
  const next = feed.next;

  const contents = describeRounds(isMagazine ? feed.magazine : loadedRounds);
  const chamberName = hasChamber && feed.chamber ? roundName(feed.chamber) : t("Empty");
  // What fires next. A chambered gun with an empty chamber won't fire, even with a full magazine;
  // a revolver with an empty chamber under the hammer clicks.
  let nextName;
  if (next) nextName = roundName(next);
  else if (hasChamber && feed.magazine.length) nextName = t("NeedsChambering");
  else if (feed instanceof CylinderFeed && loadedRounds.length) nextName = t("EmptyChamber");
  else nextName = t("Empty");

  const loaded = isMagazine ? feed.magazine.length : loadedRounds.length;
  const rounds = order.map((slot) => ({
    label: positionLabel(feed, slot),
    name: slot.round ? roundName(slot.round) : t("EmptySlot"),
    img: slot.round?.img || "",
    special: isSpecialRound(slot.round),
    empty: !slot.round,
    next: !!slot.isNext,
  }));

  const mark = (round) => `${round.name}${round.special ? " ✦" : ""}`;
  const lines = [`${t("Loaded")}: ${loaded}/${feed.capacity}`];
  for (const round of rounds) lines.push(`${round.next ? "▶ " : ""}${round.label}: ${mark(round)}`);

  return {
    feed: feed.type,
    loaded,
    capacity: feed.capacity,
    hasChamber,
    chambered: hasChamber && !!feed.chamber,
    empty: !next,
    label: `${loaded}/${feed.capacity}`,
    contents,
    chamberName,
    nextName,
    rounds,
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
 * Before an attack roll: check the gun can fire `amount` rounds, and work out which.
 *   - an empty gun, or nothing ready: a warning ("Click. Revolver is empty.") and null
 *   - a revolver with rounds, but an empty chamber under the hammer: "Click", the cylinder turns one chamber (saved),
 *     and null
 *   - a shotgun whose loaded barrels hold different rounds: the shooter picks the barrel (null if they cancel)
 * @param {Actor} actor
 * @param {Item} gun
 * @param {number} [amount]
 * @returns {Promise<{positions?: number[]}|null>}  What to pass to fireGun, or null when nothing fires.
 */
export async function prepareShot(actor, gun, amount = 1) {
  const feed = feedOf(gun);
  if (!feed.loadedCount) return warn("Warnings.Empty", { gun: gun.name });

  if (feed instanceof BarrelFeed && feed.needsChoice(amount)) {
    const positions = await chooseBarrels(gun, feed, amount);
    return positions ? { positions } : null;
  }

  const plan = feedOf(gun).fire(amount);
  if (plan.fired.length >= amount) return {};

  if (plan.clicked) {
    // The trigger was pulled on an empty chamber: the cylinder still turns.
    const before = feed.index + 1;
    feed.turn();
    await gun.update(feed.toUpdate());
    warn("Warnings.Click", { gun: gun.name, n: before });
    return null;
  }
  if (plan.fired.length) return warn("Warnings.NotEnough", { gun: gun.name, n: plan.fired.length });
  if (feed instanceof MagazineFeed && feed.hasChamber && feed.magazine.length) return warn("Warnings.NotChambered", { gun: gun.name });
  return warn("Warnings.Empty", { gun: gun.name });
}


/**
 * Ask which barrel to fire, when they hold different rounds.
 * @returns {Promise<number[]|null>}  0-based barrel positions, or null when cancelled.
 */
async function chooseBarrels(gun, feed, amount) {
  const options = feed.loadedPositions.map((i, n) => {
    const round = feed.barrels[i];
    const special = isSpecialRound(round) ? " ✦" : "";
    return `<label class="lotm-gun-choice"><input type="${amount === 1 ? "radio" : "checkbox"}" name="barrel" value="${i}" ${n < amount ? "checked" : ""}>
      ${esc(t("BarrelN", { n: i + 1 }))}: ${esc(roundName(round))}${special}</label>`;
  }).join("");
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("ChooseBarrelTitle", { gun: gun.name }) },
    content: `<p>${esc(t("ChooseBarrel", { n: amount }))}</p><div class="lotm-gun-choices">${options}</div>`,
    ok: {
      label: t("Buttons.fire"),
      callback: (event, button) => [...button.form.querySelectorAll("input[name=barrel]:checked")].map((input) => Number(input.value)),
    },
    rejectClose: false,
  });
  if (!Array.isArray(chosen) || !chosen.length) return null;
  return chosen.slice(0, amount);
}


/**
 * Fire rounds: take them out of the gun, then set off any special rounds' spells (activateBullets).
 * @param {Actor} actor
 * @param {Item} gun
 * @param {{amount?: number, positions?: number[], chat?: boolean}} [options]
 *   positions  Barrels to fire (from prepareShot).
 *   chat       Also post "Fired 1 from Revolver" (for fire actions that have no attack roll of their own).
 * @returns {Promise<object[]|null>}  The rounds fired, or null if it couldn't fire.
 */
export async function fireGun(actor, gun, { amount = 1, positions, chat = false } = {}) {
  const feed = feedOf(gun);
  const { fired } = feed.fire(amount, { positions });
  if (!fired.length) return warn("Warnings.Empty", { gun: gun.name });
  await gun.update(feed.toUpdate());
  if (chat) await postChat(actor, gun, t("Chat.fire", { n: fired.length, gun: gun.name, rounds: describeRounds(fired) }));
  await activateBullets(actor, gun, fired);
  return fired;
}


/* -------------------------------------------- */
/*  Special bullets                              */
/* -------------------------------------------- */

/**
 * The spells a round sets off: every spell in the Spell Lists of the abilities its ammo had. Each spell once.
 * @param {object} round
 * @returns {Promise<Item[]>}
 */
export async function bulletSpells(round) {
  const spells = new Map();   // uuid -> spell
  for (const abilityUuid of round.abilities ?? []) {
    const ability = await fromUuid(abilityUuid).catch(() => null);
    if (ability?.documentName !== "Item" || ability.type !== "ability") continue;
    for (const spellUuid of ability.system.spellList?.spells ?? []) {
      if (!spellUuid || spells.has(spellUuid)) continue;
      const spell = await fromUuid(spellUuid).catch(() => null);
      if (spell?.documentName === "Item" && spell.type === "spell") spells.set(spellUuid, spell);
    }
  }
  return [...spells.values()];
}


/**
 * Special rounds were fired: for each, spend its spells' Spirituality Cost and post a card with a Cast button for
 * each spell that went off. A spell the character can't pay for doesn't go off (the card says so).
 * The Cast buttons are handled in helpers/action-roll.mjs (they roll the spell without charging it again).
 * @param {Actor} actor
 * @param {Item} gun
 * @param {object[]} fired
 * @returns {Promise<void>}
 */
export async function activateBullets(actor, gun, fired) {
  for (const round of fired.filter(isSpecialRound)) {
    const spells = await bulletSpells(round);
    if (!spells.length) continue;

    const rows = [];
    const active = [];
    for (const spell of spells) {
      const cost = spiritualityCost(spell);
      const paid = cost > 0 ? await spendSpirituality(actor, cost, { reason: spell.name, chat: false }) : { amount: 0 };
      if (paid) active.push(spell.uuid);
      rows.push(bulletSpellRow(spell, cost, !!paid));
    }

    const title = t("Bullet.Fired", { round: esc(roundName(round)), gun: esc(gun.name) });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="lotm chat-bullet">
          <header>${round.img ? `<img src="${esc(round.img)}" width="28" height="28" alt="">` : ""}<span>${title}</span></header>
          <ul class="bullet-spells">${rows.join("")}</ul>
        </div>`,
      flags: { lotm: { actorUuid: actor.uuid, bulletSpells: active, bulletCast: [] } },
    });
  }
}


/** One spell's line on a special bullet's card: its cost and Cast button, or why it didn't go off. */
function bulletSpellRow(spell, cost, paid) {
  const name = esc(spell.name);
  const costText = cost > 0 ? ` <span class="bullet-cost">${esc(t("Bullet.Cost", { cost }))}</span>` : "";
  if (!paid) {
    return `<li class="bullet-spell failed"><span>${name}</span> <em>${esc(t("Bullet.NotEnough", { cost }))}</em></li>`;
  }
  return `<li class="bullet-spell"><span>${name}</span>${costText}
      <button type="button" data-lotm-bullet-spell="${esc(spell.uuid)}"><i class="fa-solid fa-wand-sparkles"></i> ${esc(t("Bullet.Cast", { name: spell.name }))}</button>
    </li>`;
}


/* -------------------------------------------- */
/*  Reloading, chambering, rotating, unloading   */
/* -------------------------------------------- */

/**
 * Load rounds from an ammo box. A dialog asks which ammo (of those that fit) and how many, and for a gun with an empty
 * chamber, whether to put one round straight into the chamber. Fast (Shift-click): no dialog; the first ammo that
 * fits, as many as the action loads (or as fit).
 * @param {Actor} actor
 * @param {Item} gun
 * @param {{amount?: number, fast?: boolean}} [options]  amount: the most one use loads (0 = as many as fit).
 * @returns {Promise<number|null>}  Rounds loaded, or null when nothing was.
 */
export async function reloadGun(actor, gun, { amount = 0, fast = false } = {}) {
  const { caliber } = gun.system.firearm;
  const feed = feedOf(gun);
  const canLoadChamber = feed instanceof MagazineFeed && feed.canLoadChamber;
  if (feed.room <= 0 && !canLoadChamber) return warn("Warnings.Full", { gun: gun.name });

  const boxes = ammoFor(actor, gun);
  if (!boxes.length) return warn("Warnings.NoAmmo", { gun: gun.name, caliber: caliber || t("AnyCaliber") });

  // The most this use can load: what fits, or the action's rounds per use.
  const most = amount > 0 ? Math.min(amount, feed.room) : feed.room;
  const choice = fast
    ? { box: boxes[0], count: most, intoChamber: feed.room <= 0 && canLoadChamber }
    : await chooseLoad(gun, feed, boxes, most, canLoadChamber);
  if (!choice?.box) return null;   // the dialog was closed

  const { box, intoChamber } = choice;
  const wanted = intoChamber ? 1 : Math.min(choice.count, most);
  const count = Math.min(wanted, ammoTotal(box));
  if (count <= 0) return warn(feed.room <= 0 ? "Warnings.Full" : "Warnings.NoAmmo", { gun: gun.name, caliber: caliber || t("AnyCaliber") });

  const round = roundFromAmmo(box);
  const loaded = feed.load(Array.from({ length: count }, () => round), { intoChamber });
  if (!loaded) return warn("Warnings.Full", { gun: gun.name });

  // The gun and the box change together, in one update.
  await actor.updateEmbeddedDocuments("Item", [
    { _id: gun.id, ...feed.toUpdate() },
    boxUpdate(box, ammoTotal(box) - loaded),
  ]);

  const text = intoChamber
    ? t("Chat.loadChamber", { ammo: box.name, gun: gun.name })
    : t("Chat.reload", { n: loaded, ammo: box.name, gun: gun.name, loaded: feed.loadedCount, capacity: feed.capacity });
  await postChat(actor, gun, text);
  return loaded;
}


/**
 * The Load dialog: which ammo, how many, and (for an empty chamber) straight into the chamber.
 * @returns {Promise<{box: Item, count: number, intoChamber: boolean}|null>}
 */
async function chooseLoad(gun, feed, boxes, most, canLoadChamber) {
  const options = boxes.map((box) => {
    const special = box.system.abilities_gained?.length ? " ✦" : "";
    return `<option value="${box.id}">${esc(box.name)}${special} (${esc(t("Rounds", { n: ammoTotal(box) }))})</option>`;
  }).join("");
  const orderHint = {
    magazine: "LoadHint.magazine",
    cylinder: "LoadHint.cylinder",
    barrels: "LoadHint.barrels",
  }[feed.type] ?? "LoadHint.magazine";
  const start = Math.max(1, Math.min(most, ammoTotal(boxes[0])));
  const chamberRow = canLoadChamber
    ? `<div class="form-group">
        <label>${esc(t("LoadChamber"))}</label>
        <div class="form-fields"><input type="checkbox" name="intoChamber" ${most <= 0 ? "checked disabled" : ""}></div>
        <p class="hint">${esc(t("LoadChamberHint"))}</p>
      </div>`
    : "";
  const amountRow = most > 0
    ? `<div class="form-group">
        <label>${esc(t("LoadAmount"))}</label>
        <div class="form-fields"><input type="number" name="count" value="${start}" min="1" max="${most}" step="1"></div>
        <p class="hint">${esc(t("LoadAmountHint", { n: most }))}</p>
      </div>`
    : "";

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("PickAmmoTitle", { gun: gun.name }) },
    content: `<div class="form-group">
        <label>${esc(t("PickAmmo"))}</label>
        <div class="form-fields"><select name="ammo">${options}</select></div>
      </div>
      ${amountRow}
      ${chamberRow}
      <p class="hint">${esc(t(orderHint))}</p>`,
    ok: {
      label: t("Buttons.reload"),
      callback: (event, button) => {
        const form = button.form.elements;
        return {
          id: form.ammo.value,
          count: Math.max(1, Math.trunc(Number(form.count?.value) || most || 1)),
          intoChamber: !!form.intoChamber?.checked || (canLoadChamber && most <= 0),
        };
      },
    },
    rejectClose: false,
  });
  if (!result) return null;
  const box = boxes.find((b) => b.id === result.id);
  return box ? { box, count: result.count, intoChamber: result.intoChamber } : null;
}


/** Magazine guns: move the top round of the magazine into the chamber (rack the slide, work the bolt). */
export async function chamberRound(actor, gun) {
  const feed = feedOf(gun);
  if (!(feed instanceof MagazineFeed) || !feed.hasChamber) return warn("Warnings.NoChamber", { gun: gun.name });
  if (feed.chamber) return warn("Warnings.AlreadyChambered", { gun: gun.name });
  const round = feed.chamberNext();
  if (!round) return warn("Warnings.NothingToChamber", { gun: gun.name });

  await gun.update(feed.toUpdate());
  await postChat(actor, gun, t("Chat.chamber", { gun: gun.name, round: roundName(round) }));
  return round;
}


/**
 * Revolvers: put the chamber you pick under the hammer, so it fires next. A dialog lists every chamber.
 * @returns {Promise<number|null>}  The chamber now under the hammer (1-based), or null when cancelled.
 */
export async function rotateCylinder(actor, gun) {
  const feed = feedOf(gun);
  if (!(feed instanceof CylinderFeed) || !feed.size) return warn("Warnings.NoCylinder", { gun: gun.name });

  const rows = feed.cylinder.map((round, i) => {
    const name = round ? `${esc(roundName(round))}${isSpecialRound(round) ? " ✦" : ""}` : `<em>${esc(t("EmptySlot"))}</em>`;
    return `<label class="lotm-gun-choice"><input type="radio" name="chamber" value="${i}" ${i === feed.index ? "checked" : ""}>
      ${esc(t("ChamberN", { n: i + 1 }))}: ${name}</label>`;
  }).join("");
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("RotateTitle", { gun: gun.name }) },
    content: `<p>${esc(t("RotateIntro"))}</p><div class="lotm-gun-choices">${rows}</div>`,
    ok: {
      label: t("Buttons.rotate"),
      callback: (event, button) => Number(button.form.querySelector("input[name=chamber]:checked")?.value),
    },
    rejectClose: false,
  });
  if (!Number.isInteger(chosen)) return null;

  feed.rotateTo(chosen);
  await gun.update(feed.toUpdate());
  const round = feed.cylinder[feed.index];
  await postChat(actor, gun, t("Chat.rotate", { gun: gun.name, n: feed.index + 1, round: round ? roundName(round) : t("EmptySlot") }));
  return feed.index + 1;
}


/**
 * Take every round out of the gun and put it back in the box it came from. A round whose box is gone goes into
 * another box with the same name, and failing that into a new stack of loose rounds (with its abilities, so a
 * special bullet stays special).
 */
export async function unloadGun(actor, gun) {
  const feed = feedOf(gun);
  const rounds = feed.unload();
  if (!rounds.length) return warn("Warnings.NothingToUnload", { gun: gun.name });

  const backTo = new Map();   // ammo Item id -> how many rounds go back into it
  const loose = [];           // rounds with no box to go back to
  for (const round of rounds) {
    const box = boxForRound(actor, gun, round);
    if (box) backTo.set(box.id, (backTo.get(box.id) ?? 0) + 1);
    else loose.push(round);
  }

  const updates = [{ _id: gun.id, ...feed.toUpdate() }];
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

/** New ammo Items for rounds with no box: one stack of loose rounds per kind (name and abilities). */
function looseStacks(actor, gun, rounds) {
  const stacks = [];   // { round, count }
  for (const round of rounds) {
    const stack = stacks.find((s) => sameKind(s.round, round));
    if (stack) stack.count += 1;
    else stacks.push({ round, count: 1 });
  }

  return stacks.map(({ round, count }) => {
    const data = {
      name: round.name || t("LooseRounds"),
      img: round.img || "icons/svg/item-bag.svg",
      type: "gear",
      system: {
        size: "tiny",
        quantity: count,
        isAmmo: true,
        ammo: { caliber: gun.system.firearm.caliber, perBox: 1, rounds: 1 },
        abilities_gained: [...(round.abilities ?? [])],
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
 * Fire a "Fires rounds" action that has no attack roll (its row has a Fire button instead of the attack button).
 * A shot that can't happen (empty, a click) needs no warning about statuses; otherwise a status that stops the action
 * warns first, with Use Anyway (effects/status-restrictions.mjs). Used anyway: the chat says so.
 * @param {Actor} actor
 * @param {Item} action
 * @param {string} [gunId]  The gun the action came from, if any (see gunFor).
 * @returns {Promise<object[]|null>}  The rounds fired, or null when nothing fired.
 */
export async function fireWithoutRoll(actor, action, gunId) {
  const gun = gunFor(actor, gunId);
  if (!gun) return null;
  const amount = Math.max(1, action.system.ammoAmount ?? 0);

  const shot = await prepareShot(actor, gun, amount);
  if (!shot) return null;

  const { proceed, note } = await confirmStatusRestrictions(actor, action);
  if (!proceed) return null;

  const fired = await fireGun(actor, gun, { amount, positions: shot.positions, chat: true });
  if (fired) await postUsedDespite(actor, action, note);
  return fired;
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
