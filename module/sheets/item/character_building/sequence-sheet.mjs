
import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../../../helpers/effects.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;


export class LordOfTheMysteriesSequenceSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ['lotm', 'sheet', 'item', 'sequence'],
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 520,
      height: 480,
    },
    window: {
      resizable: true,
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
    }
  };

  /** @override */
  // Placeholder path — the real per-type template is resolved in
  // _configureRenderParts() below, the V2 replacement for the old
  // `get template()` getter.
  static PARTS = {
    header: { template: 'systems/lotm/templates/item/parts/item-header.hbs' },
    form: { template: 'systems/lotm/templates/item/character_building/sequence-sheet.hbs'},
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        { id: 'description', label: 'LORD_OF_THE_MYSTERIES.Tabs.Description' },
        { id: 'details', label: 'LORD_OF_THE_MYSTERIES.Tabs.Details'},
      ],
      initial: 'description',
    },
  };

  /* -------------------------------------------- */

  /**
   * Resolve a distinct template per item type, e.g.
   * item-item-sheet.hbs, item-feature-sheet.hbs, item-spell-sheet.hbs
   * (one .hbs file per type registered in CONFIG.Item.dataModels).
   * This is the V2 replacement for overriding the old `get template()` getter.
   */
  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    
    parts.form.template = `systems/lotm/templates/item/character_building/sequence.hbs`;
                           

    return parts;
  }


  /** @override */
  async _prepareContext(options){
    // Retrieve base data structure.
    const context = await super._prepareContext(options);

    // Use a safe clone of the item data for further operations.
    const itemData = this.document.toPlainObject();

    context.item = this.item;

    // Enrich text editors
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.description,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Relative UUID resolution
        relativeTo: this.item,
      }
    );
    context.enrichedActingPrincipals = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.acting_principals,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Relative UUID resolution
        relativeTo: this.item,
      }
    );

    // Add the item's data to context.data for easier access, as well as flags.
    context.system = itemData.system;
    context.flags = itemData.flags;

    // Adding a pointer to CONFIG.LORD_OF_THE_MYSTERIES
    context.config = CONFIG.LORD_OF_THE_MYSTERIES;

    // Prepare active effects for easier access
    context.effects = prepareActiveEffectCategories(this.item.effects);

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

    // Skill increase rows reference a Skill Item by UUID — resolve name/img for display.
    context.skillIncrease = await Promise.all(
      (context.system.skill_increase ?? []).map(async (row, index) => {
        const skillItem = row.skill_uuid ? await fromUuid(row.skill_uuid).catch(() => null) : null;
        return {
          index,
          value: row.value,
          uuid: row.skill_uuid,
          name: skillItem?.name ?? "Unknown Item",
          img: skillItem?.img ?? "icons/svg/hazard.svg",
          broken: !!row.skill_uuid && !skillItem,
        };
      })
    );

    // Abilities gained are a flat array of Item UUIDs — resolve name/img for display.
    context.abilitiesGained = await Promise.all(
      (context.system.abilities_gained ?? []).map(async (uuid, index) => {
        const abilityItem = uuid ? await fromUuid(uuid).catch(() => null) : null;
        return {
          index,
          uuid,
          name: abilityItem?.name ?? "Unknown Item",
          img: abilityItem?.img ?? "icons/svg/hazard.svg",
          broken: !!uuid && !abilityItem,
        };
      })
    );

    return context;
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    this.element.querySelectorAll('prose-mirror').forEach((editor) => {
      editor.addEventListener('save', () => this.submit());
    });

    if (!this.isEditable) return;

    this.element.querySelectorAll('.effect-control').forEach((el) => {
      el.addEventListener('click', (ev) => onManageActiveEffect(ev, this.item));
    });
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

    if (dropZone === "skill_increase") {
      const current = this.item.system.skill_increase ?? [];
      if (current.some((row) => row.skill_uuid === document.uuid)) {
        ui.notifications.warn(`${document.name} is already in Skill Increase.`);
        return null;
      }
      await this.item.update({
        "system.skill_increase": [...current, { skill_uuid: document.uuid, value: 1 }],
      });
    } else if (dropZone === "abilities_gained") {
      const current = this.item.system.abilities_gained ?? [];
      if (current.includes(document.uuid)) {
        ui.notifications.warn(`${document.name} is already in Abilities Gained.`);
        return null;
      }
      await this.item.update({
        "system.abilities_gained": [...current, document.uuid],
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

  /** Remove an Attribute Gain row by index. */
  static async #onDeleteAttributeGain(event, target) {
    const index = Number(target.dataset.index);
    const current = this.item.system.attribute_gain ?? [];
    await this.item.update({
      "system.attribute_gain": current.filter((_, i) => i !== index),
    });
  }

  /** Remove a Skill Increase row by index. */
  static async #onDeleteSkillIncrease(event, target) {
    const index = Number(target.dataset.index);
    const current = this.item.system.skill_increase ?? [];
    await this.item.update({
      "system.skill_increase": current.filter((_, i) => i !== index),
    });
  }

  /** Remove an Abilities Gained entry by index. */
  static async #onDeleteAbilityGained(event, target) {
    const index = Number(target.dataset.index);
    const current = this.item.system.abilities_gained ?? [];
    await this.item.update({
      "system.abilities_gained": current.filter((_, i) => i !== index),
    });
  }

}