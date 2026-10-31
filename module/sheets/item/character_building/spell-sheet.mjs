import { LordOfTheMysteriesItemSheetBase, ITEM_HEADER_PART } from "../../base-item-sheet.mjs";
// The Skill slot, the same one the action sheet uses.
import { SKILL_SLOT_ACTIONS, prepareSkillSlot, bindSkillSlot } from "../../../helpers/skill-slot.mjs";


export class LordOfTheMysteriesSpellSheet extends LordOfTheMysteriesItemSheetBase {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["spell"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
    dragDrop: [{ dragSelector: null, dropSelector: ".sheet-body" }],
    actions: {
      ...SKILL_SLOT_ACTIONS,
      addSequenceUpgrade: LordOfTheMysteriesSpellSheet.#onAddSequenceUpgrade,
      deleteSequenceUpgrade: LordOfTheMysteriesSpellSheet.#onDeleteSequenceUpgrade,
    },
  };

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/spell.hbs" },
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.enrichedDescription = await this._enrich(this.item.system.description);
    context.enrichedSpecial = await this._enrich(this.item.system.special);

    // The Skill slot. Empty = the spell rolls with Occultism (CONFIG.LORD_OF_THE_MYSTERIES.spellSkillUuid).
    context.actionSkill = await prepareSkillSlot(this.item);

    // Sequence Upgrade rows just need their array index for input naming.
    context.higherSequenceUpgrades = (context.system.higherSequenceUpgrades ?? []).map((value, index) => ({
      index,
      value,
    }));

    return context;
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Let the Skill slot accept a dropped skill (only when the sheet can be edited; bindSkillSlot checks).
    bindSkillSlot(this);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                  */
  /* -------------------------------------------- */

  /**
   * Items dropped on the sheet itself are ignored: the Skill slot handles its own drops (helpers/skill-slot.mjs).
   * Anything else (e.g. an Active Effect) goes to Foundry's own handling.
   * @override
   */
  async _onDropDocument(event, document) {
    if (document.documentName !== "Item") return super._onDropDocument(event, document);
    return document;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /** Add a blank Sequence Upgrade row. */
  static async #onAddSequenceUpgrade(event, target) {
    const current = this.item.system.higherSequenceUpgrades ?? [];
    await this.item.update({ "system.higherSequenceUpgrades": [...current, ""] });
  }

  /** Remove a Sequence Upgrade row (data-index = its position). */
  static async #onDeleteSequenceUpgrade(event, target) {
    await this._removeFromList("system.higherSequenceUpgrades", target.dataset.index);
  }

}
