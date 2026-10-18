/**
 * The "Skill" slot on the action sheet: the skill an action rolls with (e.g. Pistol).
 *
 * Kept here instead of inside the action sheet class so it only takes three small additions to
 * action-sheet.mjs to use it (see the comment at the bottom of this file).
 *
 * The skill is stored as a UUID in the Item's system.skill (see action.mjs).
 */

/**
 * What the template shows in the slot ({{actionSkill}}), or null when no skill is set.
 * A skill that no longer exists (deleted Item) is shown as missing so it can still be removed.
 * @param {Item} item
 * @returns {Promise<{uuid: string, name: string, img: string, broken: boolean}|null>}
 */
export async function prepareSkillSlot(item) {
  const uuid = item.system.skill;
  if (!uuid) return null;
  const skill = await fromUuid(uuid).catch(() => null);
  if (!skill) {
    return { uuid, broken: true, img: "icons/svg/hazard.svg", name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing") };
  }
  return { uuid, broken: false, img: skill.img, name: skill.name };
}

/**
 * Make the slot ([data-skill-slot]) accept a dropped skill. Call from the sheet's _onRender.
 * The sheet is redrawn on every render, so the slot is always a fresh element (no double listeners).
 * @param {ItemSheetV2} sheet
 */
export function bindSkillSlot(sheet) {
  if (!sheet.isEditable) return;
  for (const zone of sheet.element.querySelectorAll("[data-skill-slot]")) {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();               // without this the browser never fires "drop"
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", (event) => {
      if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", (event) => onDropSkill(event, sheet, zone));
  }
}

/** A skill was dropped on the slot: save it, replacing any skill already there. */
async function onDropSkill(event, sheet, zone) {
  event.preventDefault();
  event.stopPropagation();                  // don't let the sheet's own drop handling see it too
  zone.classList.remove("drag-over");

  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data?.type !== "Item" || !data.uuid) return;
  const doc = await fromUuid(data.uuid);
  if (!doc) return;

  if (doc.type !== "skill") {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.ActionSkill.NotASkill", { name: doc.name }));
    return;
  }
  await sheet.document.update({ "system.skill": doc.uuid });
}

/**
 * Click actions used by the slot. Spread these into the sheet's DEFAULT_OPTIONS.actions.
 * Foundry calls them with `this` set to the sheet, which is why they're plain functions.
 */
export const SKILL_SLOT_ACTIONS = {
  /** Open the skill's sheet. */
  openSkill: async function (event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet?.render({ force: true });
  },
  /** Clear the slot. */
  removeSkill: async function (event, target) {
    if (!this.isEditable) return;
    await this.document.update({ "system.skill": "" });
  },
};

/*
 * Using it in module/sheets/item/character_building/action-sheet.mjs:
 *
 * 1. At the top, with the other imports:
 *      import { SKILL_SLOT_ACTIONS, prepareSkillSlot, bindSkillSlot } from "../../../helpers/skill-slot.mjs";
 *
 * 2. In DEFAULT_OPTIONS.actions, add the spread as the first line:
 *      actions: {
 *        ...SKILL_SLOT_ACTIONS,
 *        addSpecialResult: ...,      // your existing actions stay as they are
 *      }
 *
 * 3. In _prepareContext, before `return context;`:
 *      context.actionSkill = await prepareSkillSlot(this.item);
 *
 * 4. In _onRender (add the method if the sheet doesn't have one):
 *      _onRender(context, options) {
 *        super._onRender(context, options);
 *        bindSkillSlot(this);
 *      }
 */
