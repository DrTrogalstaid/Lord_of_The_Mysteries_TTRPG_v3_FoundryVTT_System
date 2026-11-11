/**
 * The "On Success" and "On Failure" table slots on the action and spell sheets: Roll Tables drawn after a roll with
 * a DC (system.successTable / system.failureTable, see action.mjs). Drawing them is helpers/outcome-tables.mjs.
 *
 * Works like the Skill slot (helpers/skill-slot.mjs): drag a Roll Table from the sidebar or a compendium onto a
 * slot to set it (it replaces any table already there), click its name to open it, the trash can to clear it.
 */

import { bindDropZone, takeDrop } from "./listeners.mjs";

/** The two slots: the field each saves to, and its label. */
export const TABLE_SLOTS = {
  successTable: "LORD_OF_THE_MYSTERIES.OutcomeTables.Success",
  failureTable: "LORD_OF_THE_MYSTERIES.OutcomeTables.Failure",
};


/**
 * What the template shows in each slot ({{#each outcomeTables}}).
 * A table that no longer exists is shown as missing, so it can still be removed.
 * @param {Item} item   An action or spell.
 * @returns {Promise<{field: string, label: string, uuid: string|null, name: string, img: string, broken: boolean}[]>}
 */
export async function prepareTableSlots(item) {
  const slots = [];
  for (const [field, label] of Object.entries(TABLE_SLOTS)) {
    const uuid = item.system[field] ?? null;
    const table = uuid ? await fromUuid(uuid).catch(() => null) : null;
    slots.push({
      field,
      label: game.i18n.localize(label),
      uuid,
      broken: !!uuid && !table,
      name: table?.name ?? (uuid ? game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing") : ""),
      img: table?.img ?? "icons/svg/d20-grey.svg",
    });
  }
  return slots;
}


/**
 * Make the slots ([data-table-slot="successTable"], ...) accept a dropped Roll Table. Call from the sheet's _onRender.
 * @param {ItemSheetV2} sheet
 */
export function bindTableSlots(sheet) {
  if (!sheet.isEditable) return;
  for (const zone of sheet.element.querySelectorAll("[data-table-slot]")) {
    bindDropZone(zone, (event) => onDropTable(event, sheet, zone));
  }
}


/** A Roll Table was dropped on a slot: save it there. */
async function onDropTable(event, sheet, zone) {
  const { data, doc } = await takeDrop(event);
  const field = zone.dataset.tableSlot;
  if (!(field in TABLE_SLOTS) || !data?.uuid) return;
  if (doc?.documentName !== "RollTable") {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.OutcomeTables.NotATable", { name: doc?.name ?? data.type ?? "" }));
    return;
  }
  await sheet.document.update({ [`system.${field}`]: doc.uuid });
}


/**
 * Click actions for the slots. Spread these into the sheet's DEFAULT_OPTIONS.actions.
 * Foundry calls them with `this` set to the sheet. data-field = the slot's field.
 */
export const TABLE_SLOT_ACTIONS = {
  /** Open the table's sheet. */
  openTable: async function (event, target) {
    const doc = await fromUuid(target.dataset.uuid).catch(() => null);
    doc?.sheet?.render({ force: true });
  },
  /** Clear a slot. */
  removeTable: async function (event, target) {
    const field = target.dataset.field;
    if (!this.isEditable || !(field in TABLE_SLOTS)) return;
    await this.document.update({ [`system.${field}`]: null });
  },
};
