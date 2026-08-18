import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * NPC sheet.
 */
export class LordOfTheMysteriesActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["lotm", "sheet", "actor"],
    position: {
      width: 600,
      height: 600
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true
    }
  };

  /** @override */
  static PARTS = {
    form: { template: "systems/lotm/templates/actor/actor-npc-sheet.hbs", scrollable: [""] }
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        { id: "features", label: "LORD_OF_THE_MYSTERIES.Tabs.Features" }
      ],
      initial: "features"
    }
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.actor = this.actor;
    context.system = this.actor.system;
    context.flags = this.actor.flags;
    context.config = CONFIG.LORD_OF_THE_MYSTERIES;
    context.editable = this.isEditable;
    context.items = this.actor.items.map(i => i.toObject());

    // Prepare NPC data and items.
    this._prepareItems(context);

    // Enrich biography info for display.
    // Enrichment turns text like `[[/r 1d20]]` into buttons.
    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.actor.system.biography,
      {
        secrets: this.actor.isOwner,
        rollData: this.actor.getRollData(),
        relativeTo: this.actor,
      }
    );

    // Prepare active effects.
    context.effects = prepareActiveEffectCategories(
      this.actor.allApplicableEffects()
    );

    return context;
  }

  /**
   * Organize and classify Items for the NPC sheet.
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {
    const gear = [];
    const features = [];
    const spells = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
    };

    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      if (i.type === 'item') {
        gear.push(i);
      } else if (i.type === 'feature') {
        features.push(i);
      } else if (i.type === 'spell') {
        if (i.system.spellLevel != undefined) {
          spells[i.system.spellLevel].push(i);
        }
      }
    }

    context.gear = gear;
    context.features = features;
    context.spells = spells;
  }

  /* -------------------------------------------- */
  /*  Listeners                                    */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    const html = $(this.element);

    // Unbind before rebinding: unlike v1's activateListeners() (called
    // against a freshly-created html fragment every render), ApplicationV2's
    // root element persists across re-renders, so re-binding with .on()
    // alone would stack up duplicate listeners on every render and fire
    // handlers multiple times per click/change.
    html.off('click.lotm');

    html.on('click.lotm', '.item-edit', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.sheet.render(true);
    });

    if (!this.isEditable) return;

    html.on('click.lotm', '.item-create', this._onItemCreate.bind(this));

    html.on('click.lotm', '.item-delete', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    html.on('click.lotm', '.effect-control', (ev) => {
      const row = ev.currentTarget.closest('li');
      const doc =
        row.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(ev, doc);
    });

    html.on('click.lotm', '.rollable', this._onRoll.bind(this));

    if (this.actor.isOwner) {
      html.find('li.item').each((i, li) => {
        if (li.classList.contains('inventory-header')) return;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', (ev) => this._onDragStart(ev), false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset.
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = foundry.utils.duplicate(header.dataset);
    const name = `New ${type.capitalize()}`;
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    delete itemData.system['type'];

    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }
}
