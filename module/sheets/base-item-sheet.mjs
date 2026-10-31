/**
 * Shared base for the item sheets.
 *
 *   LordOfTheMysteriesItemSheetBase          (this file) everything the item sheets do the same way
 *     ├─ LordOfTheMysteriesAbilitySheet      (item/character_building/ability-sheet.mjs)
 *     ├─ LordOfTheMysteriesActionSheet       (item/character_building/action-sheet.mjs)
 *     ├─ LordOfTheMysteriesSpellSheet        (item/character_building/spell-sheet.mjs)
 *     ├─ LordOfTheMysteriesSequenceSheet     (item/character_building/sequence-sheet.mjs)
 *     ├─ LordOfTheMysteriesSkillSheet        (item/character_building/skill-sheet.mjs)
 *     └─ InventoryItemSheet                  (item/inventory/inventory-sheets.mjs) money text boxes, image picker
 *          ├─ LordOfTheMysteriesGearSheet
 *          └─ LordOfTheMysteriesContainerSheet
 *
 * What lives here:
 *   - the form setup (the sheet saves on every change), the window size, the Description / Details tabs
 *   - the basic context every item template uses: item, system, flags, config
 *   - saving the rich text editors when their Save button is clicked
 *   - _enrich()          a text field turned into HTML for a description box (links, inline rolls)
 *   - _linkedItemRows()  a list of Item UUIDs looked up for display (name, image, or "missing")
 *   - _dropOnList()      a dropped Item added to one of this Item's UUID lists
 *   - _removeFromList()  one entry taken out of a list field by its position
 *
 * How the sheets that extend this class add their own things (the same rules as the actor sheets):
 *   - DEFAULT_OPTIONS is merged by Foundry down the chain, so a sheet only lists what's new for it:
 *     its own class name, title and actions. Its `actions` are added to the ones here, and its `classes`
 *     are added to these. Arrays are joined together, so `dragDrop` is only set on the sheets that need it,
 *     never here. Give every sheet its own DEFAULT_OPTIONS, even if it's nearly empty, so nothing here
 *     gets counted twice.
 *   - PARTS are NOT merged: each sheet lists its own. ITEM_HEADER_PART below is the shared header.
 *   - TABS: every sheet gets the Description / Details tabs below. A sheet without tabs sets `static TABS = {}`.
 *   - _prepareContext and _onRender: call super first, then add the sheet's own parts.
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** The item header (image and name). Put it first in a sheet's PARTS: `header: ITEM_HEADER_PART`. */
export const ITEM_HEADER_PART = { template: "systems/lotm/templates/item/parts/item-header.hbs" };

/** Name and image shown for a linked Item that can't be found (deleted, or its compendium is gone). */
const MISSING_NAME = "Unknown Item";
const MISSING_IMG = "icons/svg/hazard.svg";


export class LordOfTheMysteriesItemSheetBase extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["lotm", "sheet", "item"],
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 520,
      height: 480,
    },
    window: {
      resizable: true
    },
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        { id: "description", label: "LORD_OF_THE_MYSTERIES.Tabs.Description" },
        { id: "details", label: "LORD_OF_THE_MYSTERIES.Tabs.Details" },
      ],
      initial: "description",
    },
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // A plain copy of the item's data (see LordOfTheMysteriesItem#toPlainObject in documents/item.mjs).
    const itemData = this.document.toPlainObject();

    context.item = this.item;
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.config = CONFIG.LORD_OF_THE_MYSTERIES;

    return context;
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Rich text editors (description boxes): save the sheet when the editor's Save button is clicked.
    // The parts are redrawn on every render, so these are always fresh elements.
    for (const editor of this.element.querySelectorAll("prose-mirror")) {
      editor.addEventListener("save", () => this.submit());
    }
  }

  /* -------------------------------------------- */
  /*  Helpers for the sheets that extend this one  */
  /* -------------------------------------------- */

  /**
   * Turn a text field into HTML for a description box: @UUID links, inline rolls, and secret blocks
   * for the Item's owners.
   * @param {string} text   e.g. this.item.system.description
   * @returns {Promise<string>}
   */
  async _enrich(text) {
    return foundry.applications.ux.TextEditor.implementation.enrichHTML(text, {
      secrets: this.document.isOwner,
      relativeTo: this.item,
    });
  }


  /**
   * Look up a list of Item UUIDs for display. Each row has its position in the list (for the remove buttons),
   * the UUID, and the Item's name and image. A UUID that no longer finds its Item is marked `broken`, so it
   * can still be shown and removed.
   * @param {string[]} [uuids]   e.g. this.item.system.actionList
   * @returns {Promise<{index: number, uuid: string, name: string, img: string, broken: boolean}[]>}
   */
  async _linkedItemRows(uuids) {
    return Promise.all((uuids ?? []).map(async (uuid, index) => {
      const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
      return {
        index,
        uuid,
        name: doc?.name ?? MISSING_NAME,
        img: doc?.img ?? MISSING_IMG,
        broken: !!uuid && !doc,
      };
    }));
  }


  /**
   * Add a dropped Item to one of this Item's UUID lists, after checking its type and that it isn't already there.
   * The warnings can be plain text or a language key; {name} in them becomes the dropped Item's name.
   * @param {Item} document         The dropped Item.
   * @param {object} list
   * @param {string} list.path          The list field, e.g. "system.actionList".
   * @param {string} list.duplicate     Warning when it's already in the list.
   * @param {string} [list.type]        The only Item type the list takes. Left out: any type.
   * @param {string} [list.wrongType]   Warning when it's the wrong type.
   * @param {string} [list.uuid]        The UUID to save. Default: the dropped Item's own.
   * @returns {Promise<Item|null>}      The Item when it was added, null when it wasn't.
   */
  async _dropOnList(document, { path, duplicate, type, wrongType, uuid = document.uuid }) {
    const warn = (message) => ui.notifications.warn(game.i18n.format(message, { name: document.name }));

    if (type && document.type !== type) {
      warn(wrongType);
      return null;
    }

    const current = foundry.utils.getProperty(this.item.toObject(), path) ?? [];
    if (current.includes(uuid)) {
      warn(duplicate);
      return null;
    }

    await this.item.update({ [path]: [...current, uuid] });
    return document;
  }


  /**
   * Remove one entry from a list field by its position. Does nothing when the position isn't in the list.
   * @param {string} path              The list field, e.g. "system.actionList".
   * @param {number|string} index      The entry's position (a button's data-index works as it is).
   * @returns {Promise<void>}
   */
  async _removeFromList(path, index) {
    const position = Number(index);
    const current = foundry.utils.getProperty(this.item.toObject(), path) ?? [];
    if (!Number.isInteger(position) || position < 0 || position >= current.length) return;
    await this.item.update({ [path]: current.filter((_, i) => i !== position) });
  }
}
