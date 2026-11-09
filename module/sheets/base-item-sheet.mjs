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
 *   - text rows          a list of one-line texts (Special Results, Sequence Upgrades): _textRows() for the
 *                        context, the TEXT_ROWS_PARTIAL template, and its addTextRow / deleteTextRow buttons
 *   - _traitOptions()    the Traits checkboxes for actions and spells (partial: ACTION_TRAITS_PARTIAL)
 *   - the Effects list   for sheets with `static HAS_EFFECTS = true` (partial: ITEM_EFFECTS_PARTIAL): New Effect,
 *                        Apply, Edit, On/Off, Delete; rows drag out onto tokens, effects dropped on it are copied in.
 *                        Sheets with tabs use `static TABS = LordOfTheMysteriesItemSheetBase.EFFECTS_TABS`.
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

import { applyItemEffect, defaultUseFor, effectUse, useData, useLabel } from "../effects/effect-application.mjs";
import { bindDropZone, bindEach } from "../helpers/listeners.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** The item header (image and name). Put it first in a sheet's PARTS: `header: ITEM_HEADER_PART`. */
export const ITEM_HEADER_PART = { template: "systems/lotm/templates/item/parts/item-header.hbs" };

/**
 * The Traits checkboxes (speech, reaction, grapple, parry, aimed), shared by the action and spell sheets.
 * In a template: `{{> "systems/lotm/templates/item/parts/action-traits.hbs"}}`, with `traitOptions` in the context
 * (from _traitOptions below). List it in the sheet's PARTS so it's loaded first:
 * `form: { template: "...", templates: [ACTION_TRAITS_PARTIAL] }`.
 */
export const ACTION_TRAITS_PARTIAL = "systems/lotm/templates/item/parts/action-traits.hbs";

/**
 * The item's Effects list, for sheets with `static HAS_EFFECTS = true`. Needs `itemEffects` in the context (filled
 * in by _prepareContext below). List it in the sheet's PARTS so it's loaded first, like ACTION_TRAITS_PARTIAL.
 */
export const ITEM_EFFECTS_PARTIAL = "systems/lotm/templates/item/parts/item-effects.hbs";

/**
 * A list of one-line texts with add / delete buttons (an action's Special Results, Sequence Upgrades).
 * `{{> "systems/lotm/templates/item/parts/text-rows.hbs" field="system.specialResults" rows=specialResults ...}}`,
 * with rows from _textRows below. List it in the sheet's PARTS so it's loaded first, like ACTION_TRAITS_PARTIAL.
 */
export const TEXT_ROWS_PARTIAL = "systems/lotm/templates/item/parts/text-rows.hbs";

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
    // The Effects list's buttons (sheets with HAS_EFFECTS).
    actions: {
      createEffect: LordOfTheMysteriesItemSheetBase.#onCreateEffect,
      applyEffect: LordOfTheMysteriesItemSheetBase.#onApplyEffect,
      toggleEffect: LordOfTheMysteriesItemSheetBase.#onToggleEffect,
      editEffect: LordOfTheMysteriesItemSheetBase.#onEditEffect,
      deleteEffect: LordOfTheMysteriesItemSheetBase.#onDeleteEffect,
      // Text rows (TEXT_ROWS_PARTIAL).
      addTextRow: LordOfTheMysteriesItemSheetBase.#onAddTextRow,
      deleteTextRow: LordOfTheMysteriesItemSheetBase.#onDeleteTextRow,
    },
  };

  /** Whether this sheet shows the item's Effects list (ITEM_EFFECTS_PARTIAL). */
  static HAS_EFFECTS = false;

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

  /** The Description / Details tabs plus Effects, for the sheets that have an Effects tab. */
  static EFFECTS_TABS = {
    sheet: {
      tabs: [
        { id: "description", label: "LORD_OF_THE_MYSTERIES.Tabs.Description" },
        { id: "details", label: "LORD_OF_THE_MYSTERIES.Tabs.Details" },
        { id: "effects", label: "LORD_OF_THE_MYSTERIES.Tabs.Effects" },
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

    if (this.constructor.HAS_EFFECTS) context.itemEffects = this._prepareItemEffects();

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

    if (this.constructor.HAS_EFFECTS) this.#bindEffectsList();
  }

  /* -------------------------------------------- */
  /*  Helpers for the sheets that extend this one  */
  /* -------------------------------------------- */

  /**
   * The Traits checkboxes for ACTION_TRAITS_PARTIAL: one per trait in CONFIG.LORD_OF_THE_MYSTERIES.actionTraits,
   * ticked when the item has it. Statuses read these (effects/status-restrictions.mjs).
   * @returns {{value: string, label: string, selected: boolean}[]}
   */
  _traitOptions() {
    const traits = new Set(this.item.system.traits ?? []);
    return Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.actionTraits).map(([value, label]) => ({
      value,
      label: game.i18n.localize(label),
      selected: traits.has(value),
    }));
  }


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


  /**
   * The rows of a list of one-line texts (TEXT_ROWS_PARTIAL): each text with its position, for its text box's name
   * (<field>.<index>) and its delete button.
   * @param {string} path   The list field, e.g. "system.specialResults".
   * @returns {{index: number, value: string}[]}
   */
  _textRows(path) {
    return (foundry.utils.getProperty(this.item, path) ?? []).map((value, index) => ({ index, value }));
  }


  /** Add a blank row to a list of texts (data-field = the list, e.g. "system.specialResults"). */
  static async #onAddTextRow(event, target) {
    if (!this.isEditable) return;
    const path = target.dataset.field;
    const current = foundry.utils.getProperty(this.item.toObject(), path) ?? [];
    if (!Array.isArray(current)) return;
    await this.item.update({ [path]: [...current, ""] });
  }


  /** Remove a row from a list of texts (data-field = the list, data-index = the row's position). */
  static async #onDeleteTextRow(event, target) {
    if (!this.isEditable) return;
    await this._removeFromList(target.dataset.field, target.dataset.index);
  }

  /* -------------------------------------------- */
  /*  Effects list (sheets with HAS_EFFECTS)       */
  /* -------------------------------------------- */

  /**
   * One row per effect on the item: how it's used (Passive, Targets, Area: Circle 10 ft...), its statuses and
   * its duration.
   * @returns {object[]}
   */
  _prepareItemEffects() {
    return this.item.effects.contents
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((effect) => {
        const statuses = (effect.statusRules ?? []).map((rule) => game.i18n.localize(rule.name));
        const details = [useLabel(effect), ...statuses];
        // A copy of a granted ability's passive effect (effects/granted-effects.mjs): edit the ability instead.
        const grantedFrom = effect.system?.grantedFrom;
        if (grantedFrom) {
          const name = fromUuidSync(grantedFrom)?.name ?? grantedFrom;
          details.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Granted.CopiedFrom", { name }));
        }
        if (effect.disabled) details.push(game.i18n.localize("LORD_OF_THE_MYSTERIES.Effects.Disabled"));
        const duration = effect.duration;
        const finite = duration && (Number.isFinite(duration.value) || duration.expiry);
        return {
          id: effect.id,
          name: effect.name,
          img: effect.img,
          passive: effectUse(effect) === "passive",
          disabled: effect.disabled,
          detail: details.join(" · "),
          duration: finite ? (duration.label ?? "") : "",
        };
      });
  }


  /** The effect an Effects list control belongs to (its row's data-effect-id). */
  #effectFor(target) {
    const id = target.closest("[data-effect-id]")?.dataset.effectId;
    return id ? (this.item.effects.get(id) ?? null) : null;
  }


  /** Rows drag out (onto a token, an actor, another item); effects dropped on the list are copied onto this item. */
  #bindEffectsList() {
    const list = this.element.querySelector("[data-item-effects]");
    if (!list) return;

    bindEach(list, "[data-effect-id]", "dragstart", (event, row) => {
      const effect = this.item.effects.get(row.dataset.effectId);
      if (effect) event.dataTransfer.setData("text/plain", JSON.stringify(effect.toDragData()));
    });
    if (this.isEditable) bindDropZone(list, (event) => this.#onDropEffect(event));
  }


  /**
   * An effect dropped on the Effects list: copy it onto this item. One from another item keeps how it's used;
   * one from anywhere else (a compendium, an actor) starts as this item type's default (Passive for abilities,
   * Sequences and gear; Targets for actions and spells).
   * @param {DragEvent} event
   */
  async #onDropEffect(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "ActiveEffect") return;
    // Handled here: don't let the sheet's own drop handling make a second copy.
    event.preventDefault();
    event.stopPropagation();

    const effect = await ActiveEffect.implementation.fromDropData(data).catch(() => null);
    if (!effect || effect.parent?.uuid === this.item.uuid) return;

    const copy = effect.toObject();
    delete copy._id;
    copy.origin = null;   // filled in with this item when it's created (documents/active-effect.mjs)
    copy.system = { ...(copy.system ?? {}), grantedFrom: null, impliedBy: "", turnChecks: [] };
    if (effect.parent?.documentName !== "Item") {
      for (const [path, value] of Object.entries(useData(defaultUseFor(this.item.type)))) {
        foundry.utils.setProperty(copy, path, value);
      }
    }
    await this.item.createEmbeddedDocuments("ActiveEffect", [copy]);
  }


  /** New Effect: a blank effect, set up for this item type, and its sheet opened. */
  static async #onCreateEffect(event, target) {
    if (!this.isEditable) return;
    const use = defaultUseFor(this.item.type);
    const data = {
      name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Effects.Item.NewName"),
      img: "icons/svg/aura.svg",
      type: "effect",
    };
    for (const [path, value] of Object.entries(useData(use))) foundry.utils.setProperty(data, path, value);
    // Handed-out effects show their icon on the token even without a duration (Foundry only does that for
    // effects that run out). Passive ones (+2 Inspiration from an ability) don't need an icon.
    if (use !== "passive") data.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS;

    const [effect] = await this.item.createEmbeddedDocuments("ActiveEffect", [data]);
    effect?.sheet.render({ force: true });
  }


  /**
   * Apply: hand the effect out the way its use says (effects/effect-application.mjs). The caster is the item's
   * owner; for an item nobody owns (a compendium spell), your selected token's actor or your character.
   */
  static async #onApplyEffect(event, target) {
    const effect = this.#effectFor(target);
    if (!effect) return;
    const caster = this.item.actor ?? canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
    await applyItemEffect(effect, { caster });
  }


  /** Switch an effect off, or back on. */
  static async #onToggleEffect(event, target) {
    if (!this.isEditable) return;
    const effect = this.#effectFor(target);
    await effect?.update({ disabled: !effect.disabled });
  }


  /** Open an effect's sheet. */
  static #onEditEffect(event, target) {
    this.#effectFor(target)?.sheet.render({ force: true });
  }


  /** Delete an effect. Hold Shift to skip the confirmation. */
  static async #onDeleteEffect(event, target) {
    if (!this.isEditable) return;
    const effect = this.#effectFor(target);
    if (!effect) return;
    if (!event.shiftKey) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.RemoveTitle") },
        content: `<p>${game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.RemoveConfirm", { name: Handlebars.escapeExpression(effect.name) })}</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return;
    }
    await effect.delete();
  }
}
