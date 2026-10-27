/**
 * Inventory math and the data the character sheet's Inventory tab shows.
 *
 * Two limits, checked separately:
 *   Strength limit  Strength x 2 slots. Everything carried counts: stowed, held and worn.
 *                   Going over is allowed; each slot over gives -1 Agility.
 *   Container limit Each equipped coat or bag holds its own number of slots. Only stowed items count.
 *                   Going over is allowed but flagged in red so the GM can decide.
 *
 * Armor is worked out here too, because it needs the same two things: the actor's items and Strength.
 *   Only one worn suit counts (the one with the most armor); any others are flagged.
 *   Armor that's destroyed, or that the character is too weak to wear, is flagged and gives no protection.
 */

import { ITEM_SIZES, CONTAINER_TYPES, CARRY_MODES, DRAW_ACTIONS, UNITS_PER_SLOT } from "./inventory-config.mjs";

/** Fractions of a slot, indexed by leftover sixths. */
const FRACTIONS = ["", "⅙", "⅓", "½", "⅔", "⅚"];

/**
 * Show an amount of units as slots: 8 units -> "1⅓", 3 units -> "½", 12 units -> "2".
 * @param {number} units
 * @returns {string}
 */
export function formatSlots(units) {
  const whole = Math.floor(units / UNITS_PER_SLOT);
  const fraction = FRACTIONS[units % UNITS_PER_SLOT];
  if (whole === 0 && fraction) return fraction;
  return `${whole}${fraction}`;
}

/** Rank of an item size (bigger = bigger item). Unknown sizes count as small-medium. */
function sizeRank(size) {
  return (ITEM_SIZES[size] ?? ITEM_SIZES.smallMedium).rank;
}

/**
 * Movement after armor: "half" is halved and rounded up, "none" is 0.
 * Call it from the actor wherever movement is worked out: armoredMovement(speed, system.carrying.armor.movement).
 * @param {number} speed
 * @param {string} movement   "normal", "half" or "none" (carrying.armor.movement).
 * @returns {number}
 */
export function armoredMovement(speed, movement) {
  if (movement === "none") return 0;
  if (movement === "half") return Math.ceil(speed / 2);
  return speed;
}

/**
 * Work out everything the character carries. Called from the actor's prepareDerivedData().
 *
 * Where each gear item ends up ("place"):
 *   held / worn   On the body. Counts toward Strength only.
 *   stowed        In an equipped coat or bag. Counts toward Strength and that container.
 *   leftBehind    In a coat or bag that isn't equipped (a suitcase left at the inn). Counts toward nothing.
 *   loose         Set to stowed, but not in any container (none picked, or it was deleted).
 *                 Counts toward Strength and is flagged so the player puts it somewhere.
 *
 * @param {Iterable<Item>} items     The actor's Items.
 * @param {number} strength          The actor's Strength total.
 * @returns {object}                 Stored on the actor as system.carrying.
 */
export function calculateCarrying(items, strength) {
  const result = {
    strengthUnits: Math.max(0, strength) * 2 * UNITS_PER_SLOT,  // Strength limit
    usedUnits: 0,          // everything that counts toward the Strength limit
    overUnits: 0,          // how far over the Strength limit
    penalty: 0,            // Agility penalty (whole slots over, rounded up)
    combatPenalty: 0,      // -2 when an equipped suitcase is being lugged around
    clothingCount: 0,      // equipped outfits (should be 1)
    containers: {},        // container Item id -> { capacityUnits, usedUnits, ... }
    gear: {},              // gear Item id -> { place, warnings }
    armor: {               // the worn armor that's protecting the character (empty when there isn't any)
      itemId: "",
      name: "",
      value: 0,              // armor points
      reduction: {},         // damage type -> damage reduction
      agilityPenalty: 0,     // temporary Agility penalty
      movement: "normal",    // "normal", "half" or "none" (see armoredMovement)
      unprotected: [],       // vital points it doesn't protect
      breach: 0,             // 0 intact, 1 penetrated, 2 broken (ARMOR_BREACH)
      critPenaltyReduction: 0, // how much wound expansion lowers the critical-strike penalty against the gap
    },
  };

  // 1. Containers. Done first so gear can find the container it's in.
  for (const item of items) {
    if (item.type !== "container") continue;
    const system = item.system;
    result.containers[item.id] = {
      equipped: system.equipped,
      capacityUnits: system.slots * UNITS_PER_SLOT,
      hiddenCapacityUnits: system.hiddenPockets * UNITS_PER_SLOT,
      maxSizeRank: sizeRank(system.maxSize),
      usedUnits: 0,
      hiddenUnits: 0,
      full: false,
      hiddenFull: false,
    };
    if (system.equipped) {
      if (system.combatPenalty < result.combatPenalty) result.combatPenalty = system.combatPenalty;
      if (system.category === "clothing") result.clothingCount += 1;
    }
  }

  // 2. Gear.
  const wornArmor = [];   // armor that's worn and could protect
  for (const item of items) {
    if (item.type !== "gear") continue;
    const system = item.system;
    const info = { place: "", warnings: [] };
    result.gear[item.id] = info;

    // Worn armor: can it protect?
    if (system.isArmor && system.carry === "worn") {
      const cannotWear = system.strengthNeeds.cannotWear;
      if (system.destroyed) info.warnings.push("ArmorDestroyed");
      else if (cannotWear !== null && strength < cannotWear) info.warnings.push("TooWeakToWear");
      else wornArmor.push(item);
    }

    // On the body: Strength only.
    if (system.carry === "held" || system.carry === "worn") {
      info.place = system.carry;
      result.usedUnits += system.units;
      continue;
    }

    // Stowed, but not in a container that exists.
    const container = result.containers[system.containerId];
    if (!container) {
      info.place = "loose";
      info.warnings.push("NoContainer");
      result.usedUnits += system.units;
      continue;
    }

    // In a container. It fills the container whether or not the container is equipped,
    // but only counts toward Strength while the container is being carried.
    container.usedUnits += system.units;
    if (system.hidden) container.hiddenUnits += system.units;
    if (sizeRank(system.size) > container.maxSizeRank) info.warnings.push("TooBig");

    if (container.equipped) {
      info.place = "stowed";
      result.usedUnits += system.units;
    } else {
      info.place = "leftBehind";
    }
  }

  // 3. Over the limits?
  for (const container of Object.values(result.containers)) {
    container.full = container.usedUnits > container.capacityUnits;
    container.hiddenFull = container.hiddenUnits > container.hiddenCapacityUnits;
  }
  result.overUnits = Math.max(0, result.usedUnits - result.strengthUnits);
  result.penalty = Math.ceil(result.overUnits / UNITS_PER_SLOT);

  // 4. Armor. Only one suit counts: the one with the most armor. The rest are flagged.
  wornArmor.sort((a, b) => b.system.armorValue - a.system.armorValue);
  const [best, ...extra] = wornArmor;
  for (const item of extra) result.gear[item.id].warnings.push("ExtraArmor");
  if (best) {
    const system = best.system;
    const needs = system.strengthNeeds;
    let movement = "normal";
    if (needs.immobile !== null && strength < needs.immobile) movement = "none";
    else if (needs.halfMove !== null && strength < needs.halfMove) movement = "half";

    Object.assign(result.armor, {
      itemId: best.id,
      name: best.name,
      value: system.armorValue,
      reduction: { ...system.reduction },
      agilityPenalty: system.agilityPenalty,
      movement,
      unprotected: [...system.unprotected],
      breach: system.armorState.breach,
      critPenaltyReduction: system.critPenaltyReduction,
    });
  }

  return result;
}

/**
 * The update that moves a gear item to a place on the sheet.
 * @param {string} place  "held", "worn", a container Item id, or "" for "not stowed".
 * @returns {object}      Update data for item.update().
 */
export function placementUpdate(place) {
  if (place === "held" || place === "worn") {
    return { "system.carry": place, "system.containerId": "", "system.hidden": false };
  }
  return { "system.carry": "stowed", "system.containerId": place ?? "", "system.hidden": false };
}

/**
 * Where a newly dropped gear item should go when it wasn't dropped on a particular container:
 * the first equipped container it fits in that still has room. Clothing comes before bags,
 * so small things go in pockets first.
 * @param {Actor} actor
 * @param {object} itemData   The new Item's data (from item.toObject()).
 * @returns {object}          Update data (see placementUpdate).
 */
export function autoPlacement(actor, itemData) {
  const size = ITEM_SIZES[itemData.system?.size] ?? ITEM_SIZES.smallMedium;
  const units = size.units * (itemData.system?.quantity ?? 1);
  const known = actor.system.carrying?.containers ?? {};

  const containers = actor.items
    .filter((item) => item.type === "container" && item.system.equipped)
    .sort((a, b) => (a.system.category === "clothing" ? 0 : 1) - (b.system.category === "clothing" ? 0 : 1));

  for (const container of containers) {
    const info = known[container.id];
    if (!info) continue;
    const fits = size.rank <= info.maxSizeRank;
    const hasRoom = info.usedUnits + units <= info.capacityUnits;
    if (fits && hasRoom) return placementUpdate(container.id);
  }
  return placementUpdate("");   // nowhere fits: it shows up under "Not stowed"
}

/**
 * "Physical 5, Fire 5" for a { damageType: value } map.
 * @param {Record<string, number>} reduction
 * @returns {string}
 */
function reductionLabel(reduction) {
  const damageTypes = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes;
  return Object.entries(reduction)
    .map(([type, value]) => `${game.i18n.localize(damageTypes[type] ?? type)} ${value}`)
    .join(", ");
}

/**
 * Split the Inventory section's entries into groups for the Inventory tab:
 *   "Held & worn", one group per coat / bag, "Not stowed", and "Other items" (anything that isn't gear).
 *
 * Entries keep the order they already have, so the saved manual order still applies inside each group.
 * Gear entries get an extra `gear` object that drop-entry.hbs uses for the quantity / location controls.
 *
 * @param {object[]} entries   context.sections.inventory (already sorted).
 * @param {Actor} actor
 * @returns {object}           context.inventory for inventory.hbs.
 */
export function buildInventoryView(entries, actor) {
  const localize = (key) => game.i18n.localize(key);
  const carrying = actor.system.carrying;

  const person = {
    key: "person", place: "held", name: localize("LORD_OF_THE_MYSTERIES.Inventory.OnPerson"),
    hint: localize("LORD_OF_THE_MYSTERIES.Inventory.OnPersonHint"),
    emptyText: localize("LORD_OF_THE_MYSTERIES.Drop.Empty"), entries: [],
  };
  const loose = {
    key: "loose", place: "", name: localize("LORD_OF_THE_MYSTERIES.Inventory.NotStowed"),
    warning: localize("LORD_OF_THE_MYSTERIES.Inventory.Warnings.NoContainer"), entries: [],
  };
  const other = { key: "other", place: "", name: localize("LORD_OF_THE_MYSTERIES.Inventory.OtherItems"), entries: [] };

  // 1. One group per coat / bag.
  const containerGroups = [];
  const groupById = {};
  for (const entry of entries) {
    if (entry.type !== "container" || !entry.owned) continue;
    const item = actor.items.get(entry.id);
    const info = carrying.containers[entry.id];
    if (!item || !info) continue;

    const system = item.system;
    const kind = CONTAINER_TYPES[system.kind];
    const warnings = [];
    if (info.full) {
      warnings.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Inventory.Warnings.ContainerFull", {
        slots: formatSlots(info.usedUnits - info.capacityUnits),
      }));
    }
    if (info.hiddenFull) warnings.push(localize("LORD_OF_THE_MYSTERIES.Inventory.Warnings.HiddenFull"));

    const group = {
      key: entry.id, container: true, id: entry.id, uuid: entry.uuid, name: entry.name, img: entry.img,
      place: entry.id,
      category: system.category,
      kindLabel: kind ? localize(kind.label) : "",
      drawLabel: system.draw ? localize(DRAW_ACTIONS[system.draw]) : "",
      equipped: system.equipped,
      leftBehind: !system.equipped,
      used: formatSlots(info.usedUnits),
      capacity: formatSlots(info.capacityUnits),
      hiddenUsed: formatSlots(info.hiddenUnits),
      hiddenCapacity: info.hiddenCapacityUnits ? formatSlots(info.hiddenCapacityUnits) : "",
      full: info.full,
      hiddenFull: info.hiddenFull,
      combatPenalty: system.combatPenalty || 0,
      warning: warnings.join(" "),
      emptyText: localize("LORD_OF_THE_MYSTERIES.Inventory.EmptyContainer"),
      entries: [],
    };
    containerGroups.push(group);
    groupById[entry.id] = group;
  }

  // Worn clothing first, then carried bags, then anything not equipped (left behind).
  const groupRank = (group) => (group.leftBehind ? 2 : (group.category === "clothing" ? 0 : 1));
  containerGroups.sort((a, b) => groupRank(a) - groupRank(b));

  // The choices in each gear row's location dropdown.
  const locationOptions = {
    held: localize(CARRY_MODES.held.label),
    worn: localize(CARRY_MODES.worn.label),
  };
  for (const group of containerGroups) locationOptions[group.id] = group.name;
  locationOptions[""] = localize("LORD_OF_THE_MYSTERIES.Inventory.NotStowed");

  // 2. Put every entry in its group.
  for (const entry of entries) {
    if (entry.type === "container" && entry.owned) continue;   // already a group header

    const item = entry.owned ? actor.items.get(entry.id) : null;
    const info = item ? carrying.gear[item.id] : null;
    if (!item || item.type !== "gear" || !info) {
      other.entries.push(entry);
      continue;
    }

    const system = item.system;
    const size = ITEM_SIZES[system.size] ?? ITEM_SIZES.smallMedium;
    const onBody = info.place === "held" || info.place === "worn";
    entry.gear = {
      quantity: system.quantity,
      sizeLabel: localize(size.label),
      slotsLabel: formatSlots(system.units),
      hidden: system.hidden,
      canHide: info.place === "stowed" || info.place === "leftBehind",
      location: onBody ? info.place : (info.place === "loose" ? "" : system.containerId),
      locationLabel: onBody
        ? localize(CARRY_MODES[info.place].label)
        : (groupById[system.containerId]?.name ?? localize("LORD_OF_THE_MYSTERIES.Inventory.NotStowed")),
      warning: info.warnings.map((key) => localize(`LORD_OF_THE_MYSTERIES.Inventory.Warnings.${key}`)).join(" "),
      // Armor: "Armor 8" on the row, and whether this is the suit that's protecting the character.
      armorLabel: system.isArmor
        ? game.i18n.format("LORD_OF_THE_MYSTERIES.Inventory.Armor.RowLabel", { armor: system.armorValue })
        : "",
      protecting: carrying.armor.itemId === item.id,
    };

    if (onBody) person.entries.push(entry);
    else if (info.place === "loose") loose.entries.push(entry);
    else groupById[system.containerId].entries.push(entry);
  }

  // 3. Group order on the tab. "Not stowed" and "Other items" only show when they have something in them.
  const groups = [person, ...containerGroups];
  if (loose.entries.length) groups.push(loose);
  if (other.entries.length) groups.push(other);

  // Move buttons only move an entry within its own group (same as the Spells tab).
  for (const group of groups) {
    group.entries.forEach((entry, index) => {
      entry.canMove = group.entries.length > 1;
      entry.canMoveUp = index > 0;
      entry.canMoveDown = index < group.entries.length - 1;
    });
  }

  // 4. Totals and warnings for the top of the tab.
  let stowedUnits = 0;
  let capacityUnits = 0;
  for (const container of Object.values(carrying.containers)) {
    if (!container.equipped) continue;
    stowedUnits += container.usedUnits;
    capacityUnits += container.capacityUnits;
  }

  const warnings = [];
  if (carrying.penalty > 0) {
    warnings.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Inventory.Warnings.Overloaded", {
      slots: formatSlots(carrying.overUnits), penalty: carrying.penalty,
    }));
  }
  if (carrying.combatPenalty) warnings.push(localize("LORD_OF_THE_MYSTERIES.Inventory.Warnings.Suitcase"));
  if (carrying.clothingCount > 1) warnings.push(localize("LORD_OF_THE_MYSTERIES.Inventory.Warnings.MultipleClothing"));

  const armor = carrying.armor;
  if (armor.movement === "half") warnings.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Inventory.Warnings.ArmorHalfMove", { name: armor.name }));
  if (armor.movement === "none") warnings.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Inventory.Warnings.ArmorImmobile", { name: armor.name }));

  return {
    groups,
    locationOptions,
    noContainers: containerGroups.length === 0,
    summary: {
      carried: formatSlots(carrying.usedUnits),
      strength: formatSlots(carrying.strengthUnits),
      overloaded: carrying.penalty > 0,
      stowed: formatSlots(stowedUnits),
      capacity: formatSlots(capacityUnits),
      stowedOver: stowedUnits > capacityUnits,
      // The suit that's protecting the character, for an optional readout in inventory.hbs. null = none.
      armor: armor.itemId ? {
        name: armor.name,
        value: armor.value,
        reduction: reductionLabel(armor.reduction),
        agilityPenalty: armor.agilityPenalty,
      } : null,
      warnings,
    },
  };
}
