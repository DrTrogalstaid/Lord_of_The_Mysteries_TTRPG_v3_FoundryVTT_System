
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

    // Enrich description info for display
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.description,
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

}