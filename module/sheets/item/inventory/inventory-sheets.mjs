/**
 * Item sheets for gear and containers (clothing / bags).
 */

import {
  ITEM_SIZES, CARRY_MODES, CONTAINER_TYPES, CONTAINER_UPGRADES, DRAW_ACTIONS, ARMOR_TYPES, ARMOR_BREACH, labelMap
} from "../../../helpers/inventory-config.mjs";
import { formatSlots } from "../../../helpers/inventory.mjs";
import {
  BASE_CURRENCY, CURRENCIES, localCurrency, formatMoney, formatValue, valueTooltip, parseMoney
} from "../../../helpers/currency.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;


/** What both sheets share: the form setup, the image picker, and the basic context. */
class InventoryItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["lotm", "sheet", "item", "inventory-item"],
    position: { width: 520, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: InventoryItemSheet.#onEditImage,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;              // includes the calculated values (slots, units, ...)
    context.source = this.item.toObject().system;   // what's actually saved -- used for the inputs
    context.editable = this.isEditable;
    context.actor = this.item.actor;                // the owning character, or null

    // Value: typed as £/s/d, shown again in the GM's local currency and (on hover) every other one.
    const value = context.source.value ?? 0;
    const local = localCurrency();
    context.valueText = formatMoney(value, BASE_CURRENCY);
    context.valueLocal = local === BASE_CURRENCY ? "" : `≈ ${formatValue(value, local)}`;
    context.valueTooltip = valueTooltip(value, BASE_CURRENCY);
    return context;
  }

  /**
   * Money is typed as text ("£3 10s", "8d"). Those inputs are named valueText / moneyText.<currency>,
   * so they're read here and turned into the whole numbers the data model stores. Text that can't be read
   * is skipped with a warning, and the sheet re-renders with the old value.
   * @override
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const warn = (text) => ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Money.Errors.BadAmount", { text }));

    if ("valueText" in data) {
      const pence = parseMoney(data.valueText, BASE_CURRENCY);
      if (pence === null) warn(data.valueText);
      else foundry.utils.setProperty(data, "system.value", pence);
      delete data.valueText;
    }

    if (data.moneyText) {
      for (const [key, text] of Object.entries(data.moneyText)) {
        if (!(key in CURRENCIES)) continue;
        const amount = parseMoney(text, key);
        if (amount === null) warn(text);
        else foundry.utils.setProperty(data, `system.money.${key}`, amount);
      }
      delete data.moneyText;
    }
    return data;
  }

  /** Open the FilePicker to change the Item's image. */
  static #onEditImage(event, target) {
    if (!this.isEditable) return;
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.item.img,
      callback: (path) => this.item.update({ img: path }),
    });
    return fp.browse();
  }
}


/**
 * The lists of Items a gear Item grants. Each is a list of UUIDs on the gear's system data, and the
 * character sheet already shows them (NESTED_FIELDS in player-character-sheet.mjs).
 *   field  The gear system field holding the UUIDs.
 *   type   The only Item type that can be dropped on this list.
 */
const GRANT_LISTS = {
  abilities: {
    field: "abilities_gained", type: "ability",
    label: "LORD_OF_THE_MYSTERIES.Inventory.GrantedAbilities",
    hint: "LORD_OF_THE_MYSTERIES.Inventory.GrantedAbilitiesHint",
    wrongType: "LORD_OF_THE_MYSTERIES.Inventory.Warnings.NotAnAbility",
  },
  actions: {
    field: "actionList", type: "action",
    label: "LORD_OF_THE_MYSTERIES.Inventory.GrantedActions",
    hint: "LORD_OF_THE_MYSTERIES.Inventory.GrantedActionsHint",
    wrongType: "LORD_OF_THE_MYSTERIES.Inventory.Warnings.NotAnAction",
  },
};


/** Gear: size, quantity, armor, (once a character owns it) where it's carried, and the abilities / actions it grants. */
export class LordOfTheMysteriesGearSheet extends InventoryItemSheet {

  static DEFAULT_OPTIONS = {
    classes: ["gear"],
    actions: {
      openGrant: LordOfTheMysteriesGearSheet.#onOpenGrant,
      removeGrant: LordOfTheMysteriesGearSheet.#onRemoveGrant,
    },
  };

  static PARTS = {
    form: { template: "systems/lotm/templates/item/inventory/gear-sheet.hbs" },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;

    context.sizeOptions = labelMap(ITEM_SIZES);
    context.carryOptions = labelMap(CARRY_MODES);
    context.armorOptions = labelMap(ARMOR_TYPES);     // "Not armor", cotton / leather, ...
    context.breachOptions = labelMap(ARMOR_BREACH);   // intact / penetrated / broken
    context.slotsEach = formatSlots(system.unitsEach);
    context.slotsTotal = formatSlots(system.units);
    context.stowed = context.source.carry === "stowed";

    // Purse / wallet: one text box per currency, typed like the value ("£2 5s", "40 verl d'or").
    context.moneyRows = Object.entries(CURRENCIES).map(([key, currency]) => ({
      key,
      label: currency.label,
      text: formatMoney(context.source.money?.[key] ?? 0, key),
    }));

    // Container choices: the owning character's coats and bags.
    if (context.actor) {
      context.containerOptions = { "": game.i18n.localize("LORD_OF_THE_MYSTERIES.Inventory.NotStowed") };
      for (const item of context.actor.items) {
        if (item.type === "container") context.containerOptions[item.id] = item.name;
      }
    }

    // The Abilities and Actions lists. Each UUID is looked up for its name and image;
    // one that no longer exists (deleted Item) is shown as missing so it can still be removed.
    context.grantLists = await Promise.all(Object.entries(GRANT_LISTS).map(async ([key, list]) => {
      const uuids = system[list.field] ?? [];
      const entries = await Promise.all(uuids.map(async (uuid) => {
        const doc = await fromUuid(uuid).catch(() => null);
        if (!doc) {
          return { uuid, broken: true, img: "icons/svg/hazard.svg", name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing") };
        }
        return { uuid, broken: false, img: doc.img, name: doc.name };
      }));
      return { key, label: list.label, hint: list.hint, entries };
    }));
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    // Each list is its own drop target. The part is redrawn on every render, so these are always fresh elements.
    for (const zone of this.element.querySelectorAll("[data-grant-list]")) {
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();               // without this the browser never fires "drop"
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", (event) => {
        if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", (event) => this.#onDropGrant(event, zone));
    }
  }

  /**
   * An Item was dropped on the Abilities or Actions list: add its UUID if it's the right type and not already there.
   * @param {DragEvent} event
   * @param {HTMLElement} zone   The list it landed on ([data-grant-list]).
   */
  async #onDropGrant(event, zone) {
    event.preventDefault();
    event.stopPropagation();                  // don't let the sheet's own drop handling see it too
    zone.classList.remove("drag-over");

    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item" || !data.uuid) return;
    const doc = await fromUuid(data.uuid);
    if (!doc) return;

    const list = GRANT_LISTS[zone.dataset.grantList];
    if (!list) return;
    if (doc.type !== list.type) {
      ui.notifications.warn(game.i18n.format(list.wrongType, { name: doc.name }));
      return;
    }

    const current = this.item.toObject().system[list.field] ?? [];
    if (current.includes(doc.uuid)) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Inventory.Warnings.AlreadyGranted", { name: doc.name }));
      return;
    }
    await this.item.update({ [`system.${list.field}`]: [...current, doc.uuid] });
  }

  /** Open the sheet of a granted ability / action. */
  static async #onOpenGrant(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet?.render({ force: true });
  }

  /** Remove an ability / action from its list (data-list = list key, data-uuid = the entry). */
  static async #onRemoveGrant(event, target) {
    if (!this.isEditable) return;
    const list = GRANT_LISTS[target.dataset.list];
    if (!list) return;
    const current = this.item.toObject().system[list.field] ?? [];
    await this.item.update({ [`system.${list.field}`]: current.filter((uuid) => uuid !== target.dataset.uuid) });
  }
}


/** Clothing / bags: kind, tailoring upgrade, and what's inside. */
export class LordOfTheMysteriesContainerSheet extends InventoryItemSheet {

  static DEFAULT_OPTIONS = {
    classes: ["container"],
  };

  static PARTS = {
    form: { template: "systems/lotm/templates/item/inventory/container-sheet.hbs" },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;
    const localize = (key) => game.i18n.localize(key);

    context.kindOptions = labelMap(CONTAINER_TYPES);
    context.upgradeOptions = labelMap(CONTAINER_UPGRADES);

    context.maxSizeLabel = localize(ITEM_SIZES[system.maxSize]?.label ?? "");
    context.drawLabel = system.draw ? localize(DRAW_ACTIONS[system.draw]) : "";
    context.upgradeDc = CONTAINER_UPGRADES[system.upgrade]?.dc ?? null;
    context.isClothing = system.category === "clothing";

    // Prestige level needed to wear it, shown with the skill level's own label.
    const levelLabel = CONFIG.LORD_OF_THE_MYSTERIES.skillLevels?.[system.prestige];
    context.prestigeLabel = system.prestige ? localize(levelLabel ?? system.prestige) : "";

    // What's inside, when a character owns this.
    if (context.actor) {
      const info = context.actor.system.carrying?.containers?.[this.item.id];
      context.used = formatSlots(info?.usedUnits ?? 0);
      context.full = info?.full ?? false;
      const inside = context.actor.items
        .filter((item) => item.type === "gear" && item.system.carry === "stowed" && item.system.containerId === this.item.id);
      context.contents = inside.map((item) => ({
        name: item.name,
        img: item.img,
        quantity: item.system.quantity,
        slots: formatSlots(item.system.units),
        hidden: item.system.hidden,
        value: item.system.value ? formatValue(item.system.value * item.system.quantity) : "",
      }));
      // What's inside is worth, apart from the container itself (cash in purses isn't counted here).
      const contentsPence = inside.reduce((sum, item) => sum + (item.system.value ?? 0) * item.system.quantity, 0);
      context.contentsWorth = contentsPence ? formatValue(contentsPence) : "";
    }
    return context;
  }
}
