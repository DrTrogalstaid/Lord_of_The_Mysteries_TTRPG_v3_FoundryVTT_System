/**
 * The "Skill" slot on the action and spell sheets: the skill an action rolls with (e.g. Pistol).
 * The skill is stored as a UUID in the Item's system.skill (see action.mjs).
 *
 * A sheet uses it with: ...SKILL_SLOT_ACTIONS in DEFAULT_OPTIONS.actions, context.actionSkill =
 * await prepareSkillSlot(item) in _prepareContext, and bindSkillSlot(this) in _onRender.
 */

import { bindDropZone, takeDrop } from "./listeners.mjs";

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
 * @param {ItemSheetV2} sheet
 */
export function bindSkillSlot(sheet) {
  if (!sheet.isEditable) return;
  for (const zone of sheet.element.querySelectorAll("[data-skill-slot]")) {
    bindDropZone(zone, (event) => onDropSkill(event, sheet));
  }
}

/** A skill was dropped on the slot: save it, replacing any skill already there. */
async function onDropSkill(event, sheet) {
  const { data, doc } = await takeDrop(event);
  if (data?.type !== "Item" || !doc) return;

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
