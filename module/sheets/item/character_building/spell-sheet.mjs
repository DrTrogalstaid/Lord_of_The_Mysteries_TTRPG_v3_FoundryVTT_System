import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../../../helpers/effects.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;


export class LordOfTheMysteriesSpellSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ['lotm', 'sheet', 'item', 'spell'],
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
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
    dragDrop: [{ dragSelector: null, dropSelector: ".sheet-body" }],
    actions: {
      addSequenceUpgrade: LordOfTheMysteriesSpellSheet.#onAddSequenceUpgrade,
      deleteSequenceUpgrade: LordOfTheMysteriesSpellSheet.#onDeleteSequenceUpgrade,
      deleteSpell: LordOfTheMysteriesSpellSheet.#onDeleteSpell,
    },
  };

  /** @override */
  static PARTS = {
    header: { template: 'systems/lotm/templates/item/parts/item-header.hbs' },
    form: { template: 'systems/lotm/templates/item/character_building/spell-sheet.hbs'},
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

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.form.template = `systems/lotm/templates/item/character_building/spell.hbs`;
    return parts;
  }


  /** @override */
  async _prepareContext(options){
    const context = await super._prepareContext(options);
    const itemData = this.document.toPlainObject();

    context.item = this.item;

    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.description,
      { secrets: this.document.isOwner, relativeTo: this.item }
    );
    context.enrichedSpecial = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.special,
      { secrets: this.document.isOwner, relativeTo: this.item }
    );

    context.system = itemData.system;
    context.flags = itemData.flags;
    context.config = CONFIG.LORD_OF_THE_MYSTERIES;
    context.effects = prepareActiveEffectCategories(this.item.effects);

    // Sequence Upgrade rows just need their array index for input naming.
    context.higherSequenceUpgrades = (context.system.higherSequenceUpgrades ?? []).map((value, index) => ({
      index,
      value,
    }));

    // Spell List entries reference an Item by UUID — resolve name/img for display.
    context.spellListSpells = await Promise.all(
      (context.system.spellList?.spells ?? []).map(async (uuid, index) => {
        const spellItem = uuid ? await fromUuid(uuid).catch(() => null) : null;
        return {
          index,
          uuid,
          name: spellItem?.name ?? "Unknown Item",
          img: spellItem?.img ?? "icons/svg/hazard.svg",
          broken: !!uuid && !spellItem,
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
    if (dropZone !== "spellList") return document;

    const current = this.item.system.spellList.spells ?? [];
    if (current.includes(document.uuid)) {
      ui.notifications.warn(`${document.name} is already in the Spell List.`);
      return null;
    }
    await this.item.update({
      "system.spellList.spells": [...current, document.uuid],
    });

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

  /** Remove a Sequence Upgrade row by index. */
  static async #onDeleteSequenceUpgrade(event, target) {
    const index = Number(target.dataset.index);
    const current = this.item.system.higherSequenceUpgrades ?? [];
    await this.item.update({
      "system.higherSequenceUpgrades": current.filter((_, i) => i !== index),
    });
  }

  /** Remove a Spell List entry by index. */
  static async #onDeleteSpell(event, target) {
    const index = Number(target.dataset.index);
    const current = this.item.system.spellList.spells ?? [];
    await this.item.update({
      "system.spellList.spells": current.filter((_, i) => i !== index),
    });
  }

}