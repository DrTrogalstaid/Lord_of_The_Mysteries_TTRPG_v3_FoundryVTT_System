import { LordOfTheMysteriesItemSheetBase, ITEM_HEADER_PART } from "../../base-item-sheet.mjs";


export class LordOfTheMysteriesSequenceSheet extends LordOfTheMysteriesItemSheetBase {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sequence"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Sequence"
    },
    // Accept Item drops anywhere in the sheet body; _onDropDocument
    // decides which array a dropped item belongs to based on which
    // [data-drop-zone] element it landed in.
    dragDrop: [{ dragSelector: null, dropSelector: ".sheet-body" }],
    actions: {
      addAttributeGain: LordOfTheMysteriesSequenceSheet.#onAddAttributeGain,
      deleteAttributeGain: LordOfTheMysteriesSequenceSheet.#onDeleteAttributeGain,
      deleteSkillIncrease: LordOfTheMysteriesSequenceSheet.#onDeleteSkillIncrease,
      deleteAbilityGained: LordOfTheMysteriesSequenceSheet.#onDeleteAbilityGained,
      deleteTrainingBonus: LordOfTheMysteriesSequenceSheet.#onDeleteTrainingBonus,
    }
  };

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/sequence.hbs" },
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.enrichedDescription = await this._enrich(this.item.system.description);
    context.enrichedActingPrincipals = await this._enrich(this.item.system.acting_principals);

    // ---- Details tab: attribute_gain / skill_increase / abilities_gained ----

    // Flat {key: i18nKey} map for the Attribute <select>, sourced directly
    // from CONFIG.LORD_OF_THE_MYSTERIES.attributes (see config.mjs) — it's
    // already in the shape selectOptions wants: { str: "i18n.key", ... }.
    context.attributeChoices = CONFIG.LORD_OF_THE_MYSTERIES?.attributes ?? {};

    // Attribute gain rows just need their array index for input naming.
    context.attributeGain = (context.system.attribute_gain ?? []).map((row, index) => ({
      index,
      ...row,
    }));

    // Skill increase rows: the skill looked up for its name and image, plus how many levels it's raised.
    const skillIncrease = context.system.skill_increase ?? [];
    const skillRows = await this._linkedItemRows(skillIncrease.map((row) => row.skill_uuid));
    context.skillIncrease = skillRows.map((row, index) => ({ ...row, value: skillIncrease[index].value }));

    // Abilities gained: a flat array of Item UUIDs.
    context.abilitiesGained = await this._linkedItemRows(context.system.abilities_gained);

    // Knowledge and Training bonus: skills this Sequence makes faster to study (helpers/skill-learning.mjs).
    context.trainingBonus = await this._linkedItemRows(context.system.trainingBonus);

    return context;
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                  */
  /* -------------------------------------------- */

  /**
   * Handle a Document being dropped onto the sheet. ItemSheetV2 already parses
   * the drop event and resolves it to a Document before calling this; we only
   * need to decide what to do with it.
   * @override
   */
  async _onDropDocument(event, document) {
    if (document.documentName !== "Item") return super._onDropDocument(event, document);

    const dropZone = event.target.closest("[data-drop-zone]")?.dataset.dropZone;
    if (!dropZone) return null;

    if (dropZone === "trainingBonus") {
      return this._dropOnList(document, {
        path: "system.trainingBonus",
        type: "skill",
        wrongType: "{name} is not a skill.",
        duplicate: "{name} is already in Knowledge and Training.",
        // A copy of a compendium skill (e.g. dragged from the Items sidebar) is saved as the compendium original,
        // because that's the UUID characters store their skills under. Otherwise the speed-up would never match.
        uuid: document._stats?.compendiumSource || document.uuid,
      });
    }

    if (dropZone === "abilities_gained") {
      return this._dropOnList(document, {
        path: "system.abilities_gained",
        duplicate: "{name} is already in Abilities Gained.",
      });
    }

    // Skill Increase rows are { skill_uuid, value }, not plain UUIDs, so they're added here.
    if (dropZone === "skill_increase") {
      const current = this.item.system.skill_increase ?? [];
      if (current.some((row) => row.skill_uuid === document.uuid)) {
        ui.notifications.warn(`${document.name} is already in Skill Increase.`);
        return null;
      }
      await this.item.update({
        "system.skill_increase": [...current, { skill_uuid: document.uuid, value: 1 }],
      });
    }

    return document;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /** Add a blank Attribute Gain row. */
  static async #onAddAttributeGain(event, target) {
    const choices = Object.keys(CONFIG.LORD_OF_THE_MYSTERIES?.attributes ?? {});
    if (!choices.length) {
      ui.notifications.error(
        "LORD_OF_THE_MYSTERIES.attributes is empty or missing — check config.mjs."
      );
      return;
    }
    const current = this.item.system.attribute_gain ?? [];
    await this.item.update({
      "system.attribute_gain": [...current, { attribute_name: choices[0], value: 1 }],
    });
  }

  /** Remove an Attribute Gain row (data-index = its position). */
  static async #onDeleteAttributeGain(event, target) {
    await this._removeFromList("system.attribute_gain", target.dataset.index);
  }

  /** Remove a Skill Increase row. */
  static async #onDeleteSkillIncrease(event, target) {
    await this._removeFromList("system.skill_increase", target.dataset.index);
  }

  /** Remove a Knowledge and Training entry. */
  static async #onDeleteTrainingBonus(event, target) {
    await this._removeFromList("system.trainingBonus", target.dataset.index);
  }

  /** Remove an Abilities Gained entry. */
  static async #onDeleteAbilityGained(event, target) {
    await this._removeFromList("system.abilities_gained", target.dataset.index);
  }

}
