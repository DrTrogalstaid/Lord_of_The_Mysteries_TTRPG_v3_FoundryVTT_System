/**
 * Item sheets for gear and containers (clothing / bags).
 */

import {
  ITEM_SIZES, CARRY_MODES, CONTAINER_TYPES, CONTAINER_UPGRADES, DRAW_ACTIONS, labelMap
} from "../../../helpers/inventory-config.mjs";
import { formatSlots } from "../../../helpers/inventory.mjs";

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
    return context;
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


/** Gear: size, quantity, and (once a character owns it) where it's carried. */
export class LordOfTheMysteriesGearSheet extends InventoryItemSheet {

  static DEFAULT_OPTIONS = {
    classes: ["gear"],
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
    context.slotsEach = formatSlots(system.unitsEach);
    context.slotsTotal = formatSlots(system.units);
    context.stowed = context.source.carry === "stowed";

    // Container choices: the owning character's coats and bags.
    if (context.actor) {
      context.containerOptions = { "": game.i18n.localize("LORD_OF_THE_MYSTERIES.Inventory.NotStowed") };
      for (const item of context.actor.items) {
        if (item.type === "container") context.containerOptions[item.id] = item.name;
      }
    }
    return context;
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
      context.contents = context.actor.items
        .filter((item) => item.type === "gear" && item.system.carry === "stowed" && item.system.containerId === this.item.id)
        .map((item) => ({
          name: item.name,
          img: item.img,
          quantity: item.system.quantity,
          slots: formatSlots(item.system.units),
          hidden: item.system.hidden,
        }));
    }
    return context;
  }
}
