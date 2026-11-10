/**
 * Shared base for the actor sheets.
 *
 *   LordOfTheMysteriesActorSheetBase   (this file) everything both sheets do the same way
 *     ├─ PlayerCharacterSheet          (player-character-sheet.mjs) skills from the compendium, study, money, rests, biography
 *     └─ NpcSheet                      (npc-sheet.mjs) stat block, dropped-on skills, hiding granted entries
 *
 * What lives here: the sheet itself, putting together what the modules in sheets/actor/ work out, and the buttons.
 *   - the drop sections' context (Sequences, Abilities, Actions, Spells, Inventory, and what they grant):
 *     actor/sections.mjs builds the entries, actor/groups.mjs the Favorites, action sections and Spell Lists
 *   - drag and drop onto the sheet
 *   - moving entries up / down, favorites, sending to chat, opening, creating and deleting Items
 *   - attribute, skill and action rolls (the roll dialogs in apps/; Shift-click skips the dialog),
 *     damage reduction / resistance rows, spending Spirituality
 *   - hiding granted entries, for actors whose data has a hiddenGrants list (NPCs, see actor-npc.mjs)
 *   - the Effects tab's buttons (the rows and the sidebar's status notes: actor/effects-panel.mjs)
 *   - skill hover text for both sheets' skill lists: actor/skill-tooltips.mjs
 *
 * How the sheets that extend this class add their own things:
 *   - DEFAULT_OPTIONS is merged by Foundry down the chain, so a sheet only lists what's new for it.
 *     Its `actions` are added to the ones here, and its `classes` are added to these.
 *     (Arrays are joined together, so `dragDrop` must only be set here, or drops would be handled twice.
 *     Give every sheet its own DEFAULT_OPTIONS, even if it's nearly empty, so nothing here gets counted twice.)
 *   - PARTS and TABS are NOT merged: each sheet defines its own.
 *   - _prepareContext, _preparePartContext and _onRender: call super first, then add the sheet's own parts.
 */

import SkillCheckDialog from "../apps/skill-check-dialog.mjs";
import AttributeCheckDialog from "../apps/attribute-check-dialog.mjs";
import { rollActionAttack, rollActionDamage } from "../helpers/action-roll.mjs";
import { autoPlacement, placementUpdate } from "../helpers/inventory.mjs";
import { fireWithoutRoll, gunFor } from "../helpers/firearms.mjs";
import { GunHandling } from "../helpers/gun-handling.mjs";
import { openSpendSpiritualityDialog, useActionSpirituality } from "../helpers/spirituality.mjs";
import { statusRule } from "../effects/status-effects.mjs";
import { syncGrantedEffects } from "../effects/granted-effects.mjs";
import { useToggleAction } from "../effects/toggle-effects.mjs";
import { openSanityCheck } from "../helpers/sanity.mjs";
import { deleteSkillUpdate, skillRecordUpdate } from "../helpers/skill-data.mjs";
import { skillKeyFor } from "../helpers/skill-registry.mjs";
import { bindDropZone, bindEach } from "../helpers/listeners.mjs";
import { prepareEffectsPanel, prepareStatusNotes } from "./actor/effects-panel.mjs";
import { DIGESTION_MAX, DIGESTION_MIN, ORDER_FLAG, STACKABLE_TYPES, SectionBuilder, sectionForType, sectionLabel } from "./actor/sections.mjs";
import { COLLAPSED_FLAG, COLLAPSED_SPELLS_FLAG, FAVORITES_FLAG, groupActions, groupSpellLists, spellListCollapseKey } from "./actor/groups.mjs";
import { paragraphsHTML, renderTemplateSync } from "../helpers/render.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/* -------------------------------------------- */
/*  Shared partials                              */
/* -------------------------------------------- */

const PARTS_FOLDER = "systems/lotm/templates/actor/player-character/parts";

/** One drop section (header, entry list, drop target). */
export const DROP_SECTION_PARTIAL = `${PARTS_FOLDER}/drop-section.hbs`;

/** One entry row (icon, name, stats, move / remove buttons). Used by the Spells tab's grouped lists and the Inventory. */
export const DROP_ENTRY_PARTIAL = `${PARTS_FOLDER}/drop-entry.hbs`;

/** One row of a drop section, with the action buttons. Used by drop-section.hbs and the grouped action sections. */
export const SECTION_ENTRY_PARTIAL = `${PARTS_FOLDER}/section-entry.hbs`;

/** The collapsible action sections (Favorites, Attack, Move, ...). Player Actions tab and NPC Main tab. */
export const ACTION_GROUPS_PARTIAL = `${PARTS_FOLDER}/action-groups.hbs`;

/** The closed "Hidden (3)" list with Restore buttons. Only has rows on actors that can hide grants (NPCs). */
export const HIDDEN_GRANTS_PARTIAL = `${PARTS_FOLDER}/hidden-grants.hbs`;

/** The roll buttons of an action or spell row (attack, damage, ammo, Spirituality). Used by both row partials. */
export const ENTRY_ROLLS_PARTIAL = `${PARTS_FOLDER}/entry-rolls.hbs`;

/** The Favorites star of an action or spell row. Used by both row partials. */
export const ENTRY_FAVORITE_PARTIAL = `${PARTS_FOLDER}/entry-favorite.hbs`;

/** The sidebar both sheets use as their "sidebar" part. */
export const SIDEBAR_TEMPLATE = "systems/lotm/templates/actor/parts/sidebar.hbs";

/** Every partial above, for a part's `templates` list. */
export const SHARED_PARTIALS = [
  DROP_SECTION_PARTIAL, DROP_ENTRY_PARTIAL, SECTION_ENTRY_PARTIAL, ACTION_GROUPS_PARTIAL, HIDDEN_GRANTS_PARTIAL,
  ENTRY_ROLLS_PARTIAL, ENTRY_FAVORITE_PARTIAL,
];

/** A newly added damage reduction or resistance row (sidebar). */
const DEFAULT_REDUCTION_TYPE = "physical";
const DEFAULT_RESISTANCE_TYPE = "fire";
const DEFAULT_ROW_VALUE = 1;

/**
 * Create a blank embedded Item of the given type and open its sheet.
 * @param {LordOfTheMysteriesActorSheetBase} sheet
 * @param {string} type
 */
export async function createBlankItem(sheet, type) {
  const name = Item.implementation.defaultName({ type, parent: sheet.actor });
  const [created] = await sheet.actor.createEmbeddedDocuments("Item", [{ name, type }]);
  created?.sheet?.render({ force: true });
}


export class LordOfTheMysteriesActorSheetBase extends HandlebarsApplicationMixin(ActorSheetV2) {

  /**
   * Whether action rows get the Favorites star and the Actions list starts with a Favorites section.
   * The player sheet keeps them; the NPC sheet turns them off.
   * @type {boolean}
   */
  static FAVORITES = true;

  /**
   * Whether the sidebar's Spirituality box can be typed in. Player characters spend it with the Spend button
   * (and actions' Spirituality Cost), so it's read-only for them; the NPC sheet turns it on.
   * @type {boolean}
   */
  static SPIRITUALITY_EDITABLE = false;

  /**
   * Names of every non-default Spell List on the actor's abilities (owned or granted), filled in by
   * _prepareSections on each render. The Spells tab shows these lists even when they are empty.
   * @type {string[]}
   */
  #namedSpellLists = [];


  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["lotm", "sheet", "actor"],
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true
    },
    // No selector: the whole sheet is a drop target. _onDropDocument decides what happens
    // based on the [data-drop-zone] section the Item actually landed on.
    // Only set here: sheets that extend this class must not add their own (see the note at the top).
    dragDrop: [{ dragSelector: null, dropSelector: null }],

    actions: {
      editImage: LordOfTheMysteriesActorSheetBase._onEditImage,
      addReduction: LordOfTheMysteriesActorSheetBase.#onAddReduction,
      removeReduction: LordOfTheMysteriesActorSheetBase.#onRemoveReduction,
      addResistance: LordOfTheMysteriesActorSheetBase.#onAddResistance,
      removeResistance: LordOfTheMysteriesActorSheetBase.#onRemoveResistance,
      sanityCheck: LordOfTheMysteriesActorSheetBase.#onSanityCheck,

      rollSkill: LordOfTheMysteriesActorSheetBase._onRollSkill,
      rollAttribute: LordOfTheMysteriesActorSheetBase.#onRollAttribute,
      rollAction: LordOfTheMysteriesActorSheetBase.#onRollAction,
      rollDamage: LordOfTheMysteriesActorSheetBase.#onRollDamage,
      useAmmo: LordOfTheMysteriesActorSheetBase.#onUseAmmo,
      spendSpirituality: LordOfTheMysteriesActorSheetBase.#onSpendSpirituality,
      useSpirituality: LordOfTheMysteriesActorSheetBase.#onUseSpirituality,
      toggleAction: LordOfTheMysteriesActorSheetBase.#onToggleAction,

      editItem: LordOfTheMysteriesActorSheetBase._onEditItem,
      openItem: LordOfTheMysteriesActorSheetBase.#onOpenItem,
      sendToChat: LordOfTheMysteriesActorSheetBase.#onSendToChat,
      moveEntry: LordOfTheMysteriesActorSheetBase.#onMoveEntry,
      toggleFavorite: LordOfTheMysteriesActorSheetBase.#onToggleFavorite,
      hideGrant: LordOfTheMysteriesActorSheetBase.#onHideGrant,
      restoreGrant: LordOfTheMysteriesActorSheetBase.#onRestoreGrant,

      addSkill: LordOfTheMysteriesActorSheetBase.#onAddSkill,
      deleteSkill: LordOfTheMysteriesActorSheetBase.#onDeleteSkill,
      addSequence: LordOfTheMysteriesActorSheetBase.#onAddSequence,
      deleteSequence: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      addAbility: LordOfTheMysteriesActorSheetBase.#onAddAbility,
      deleteAbility: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      addAction: LordOfTheMysteriesActorSheetBase.#onAddAction,
      deleteAction: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      addSpell: LordOfTheMysteriesActorSheetBase.#onAddSpell,
      deleteSpell: LordOfTheMysteriesActorSheetBase.#onDeleteItem,
      deleteItem: LordOfTheMysteriesActorSheetBase.#onDeleteItem,

      // Effects tab
      toggleStatus: LordOfTheMysteriesActorSheetBase.#onToggleStatus,
      toggleEffect: LordOfTheMysteriesActorSheetBase.#onToggleEffect,
      editEffect: LordOfTheMysteriesActorSheetBase.#onEditEffect,
      deleteEffect: LordOfTheMysteriesActorSheetBase.#onDeleteEffect,
      openEffectRules: LordOfTheMysteriesActorSheetBase.#onOpenEffectRules,
      effectButton: LordOfTheMysteriesActorSheetBase.#onEffectButton,
      refreshGrantedEffects: LordOfTheMysteriesActorSheetBase.#onRefreshGrantedEffects,
    },
  };

  /**
   * The actor's current Sequence: the owned Sequence with the lowest number (Sequence 8 over Sequence 9).
   * Shown in the sheet headers (the player sheet's Sequence Title, the NPC sheet's Sequence line).
   * @returns {{name: string, number: number|string, pathway: string}|null}  null when it has no Sequence.
   */
  _currentSequence() {
    const top = this.actor.items
      .filter((item) => item.type === "sequence")
      .sort((a, b) => (a.system.sequence_number ?? 9) - (b.system.sequence_number ?? 9))[0];
    if (!top) return null;
    return { name: top.name, number: top.system.sequence_number ?? "?", pathway: top.system.pathway ?? "" };
  }


  /**
   * Whether granted entries on this actor can be hidden (the eye-slash button and the "Hidden" lists).
   * True for actors whose data has a hiddenGrants list, which only NPCs have (actor-npc.mjs).
   * @type {boolean}
   */
  get canHideGrants() {
    return Array.isArray(this.actor.system.hiddenGrants);
  }

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.actor = this.actor;
    context.system = this.actor.system;
    context.source = this.actor.toObject().system;
    context.editable = this.isEditable;

    // The page selector (Character Info / Main, Actions, Spells, ...).
    context.tabs = this._prepareTabs("sheet");

    // Favorites stars on action rows, and the hide buttons on granted rows (read by the shared partials as @root.*).
    context.showFavorites = this.constructor.FAVORITES;
    context.canHideGrants = this.canHideGrants;
    context.isSpiritualityEditable = this.constructor.SPIRITUALITY_EDITABLE;

    // Entries for every drop section: the Items the actor owns plus everything nested inside them.
    // `hidden` is the granted entries this actor has hidden, per section (always empty for player characters).
    const { sections, hidden } = await this._prepareSections();
    context.sections = sections;
    context.hiddenGrants = hidden;

    return context;
  }


  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.partId = `${this.id}-${partId}`;

    // Every tab part needs its own tab state ({{tab.cssClass}}).
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];

    switch (partId) {

      case "actions":
        // Favorites, then one collapsible section per action type (attack, move, ...).
        context.actionGroups = this._prepareActionGroups(context.sections.actions, context.sections.spells);
        break;

      case "spells": {
        // Each spell's actions, shown under it. Copies, so they get the star but no move buttons
        // (they keep the spell's own order), and don't change the Actions tab's rows.
        const favorites = new Set(this.constructor.FAVORITES ? (foundry.utils.getProperty(this.actor, FAVORITES_FLAG) ?? []) : []);
        for (const spell of context.sections.spells) {
          // The spell's own star: a favorite spell is also listed in Favorites on the Actions tab.
          spell.favorite = favorites.has(spell.key);
          spell.spellActions = spell.spellActions.map((action) => ({
            ...action, favorite: favorites.has(action.key), canMove: false,
          }));
        }
        // One group per Spell List name. Each one folds open / closed; this player's closed ones stay closed.
        const collapsed = game.user.getFlag("lotm", `${COLLAPSED_SPELLS_FLAG}.${this.actor.id}`) ?? [];
        context.spellLists = groupSpellLists(context.sections.spells, this.#namedSpellLists);
        for (const list of context.spellLists) {
          list.collapseKey = spellListCollapseKey(list);
          list.collapsed = collapsed.includes(list.collapseKey);
        }
        break;
      }

      case "sidebar":
        // Damage reduction rows ("all" or a damage type) and resistance rows (a damage type).
        context.damageTypeChoices = this._prepareDamageTypes();
        context.reductionTypeChoices = this._prepareDamageTypes(CONFIG.LORD_OF_THE_MYSTERIES.damageReductionTypes);
        context.reductionRows = this._prepareDefenseRows("reductions");
        context.resistanceRows = this._prepareDefenseRows("resistances");
        // Hover text on Physical Defense and Movement when statuses change them.
        context.statusNotes = prepareStatusNotes(this.actor);
        break;

      case "effects":
        context.effectsPanel = await prepareEffectsPanel(this.actor);
        break;
    }

    return context;
  }


  /**
   * The action sections for an Actions list: Favorites (if this sheet has them), then one per action type.
   * Remembers which sections the current player collapsed.
   * @param {object[]} entries   context.sections.actions
   * @param {object[]} [spells]  context.sections.spells: favorited spells are listed in Favorites too.
   * @returns {object[]}         See groupActions.
   */
  _prepareActionGroups(entries, spells = []) {
    const favorites = this.constructor.FAVORITES;
    return groupActions(
      entries,
      favorites ? (foundry.utils.getProperty(this.actor, FAVORITES_FLAG) ?? []) : [],
      game.user.getFlag("lotm", `${COLLAPSED_FLAG}.${this.actor.id}`) ?? [],
      { favorites, spells }
    );
  }


  /**
   * The Agility Corruption box shows the worn armor's Agility penalty mixed in (base-actor.mjs), e.g. -4.
   * Before the form saves, add the penalty back, so what's stored is the actor's own corruption
   * and the penalty is never saved. Without this, every edit to the sheet would save the reduced number.
   * @override
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const agi = data.system?.attributes?.agi;
    if (agi && ("corruption" in agi)) {
      const penalty = this.actor.system.carrying?.armor?.agilityPenalty ?? 0;
      agi.corruption = Math.max(0, (Number(agi.corruption) || 0) + penalty);
    }
    return data;
  }


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    const root = this.element;
    // Controls that belong to an Item or a skill record, not the actor, have no `name` (the actor's form skips them)
    // and save themselves:
    //   digestion on an owned Sequence's row, clamped to the schema's bounds so an odd number doesn't fail to save
    bindEach(root, ".drop-entry [data-digestion-input]", "change", (event, input) => this.#onDigestionChange(input));
    //   skill level dropdowns and analysis boxes (player tabs, Granted Skills box, NPC skill list): only that skill's
    //   record (#onSkillFieldChange), so the sheet's form never saves skill lists
    bindEach(root, "[data-skill-field]", "change", (event) => this.#onSkillFieldChange(event));
    //   inventory controls (quantity, hidden pocket, equipped): the gear or container Item
    bindEach(root, "[data-item-field]", "change", (event) => this.#onItemFieldChange(event));
    //   each gear row's location dropdown: Held, Worn, or one of the actor's coats / bags
    bindEach(root, "[data-gear-location]", "change", (event, select) => {
      return this.actor.items.get(select.dataset.itemId)?.update(placementUpdate(select.value));
    });

    // Action sections and Spell Lists: when a player opens or closes one, remember it for them (see #saveCollapsed).
    bindEach(root, "details[data-action-group]", "toggle", () => this.#saveCollapsed("actionGroup", COLLAPSED_FLAG));
    bindEach(root, "details[data-spell-list]", "toggle", () => this.#saveCollapsed("spellList", COLLAPSED_SPELLS_FLAG));

    // Highlight the drop section under the cursor. The drop itself is handled in _onDropDocument.
    for (const zone of root.querySelectorAll(".drop-section")) bindDropZone(zone);
  }


  /**
   * Save a digestion box to its Sequence, clamped to the schema's bounds (the box shows the clamped number).
   * @param {HTMLInputElement} input   data-item-id = the Sequence.
   */
  async #onDigestionChange(input) {
    const item = this.actor.items.get(input.dataset.itemId);
    if (!item || item.type !== "sequence") return;
    const raw = Math.floor(Number(input.value));
    const value = Math.clamp(Number.isFinite(raw) ? raw : DIGESTION_MIN, DIGESTION_MIN, DIGESTION_MAX);
    input.value = value;
    if (value !== item.system.digestionAmount) await item.update({ "system.digestionAmount": value });
  }


  /**
   * Save which foldable sections this player has collapsed, on their own User, so the sheet opens the same way
   * next time and other players aren't affected. Used for the action sections (data-action-group, COLLAPSED_FLAG)
   * and the Spell Lists (data-spell-list, COLLAPSED_SPELLS_FLAG).
   * Sections not on the sheet right now (a type with no actions) keep whatever was saved for them.
   * Nothing is saved when nothing changed: the browser also fires "toggle" when the sheet is drawn.
   * @param {string} dataKey  The dataset name holding each section's key ("actionGroup" = data-action-group).
   * @param {string} flag     The User flag to save under.
   */
  async #saveCollapsed(dataKey, flag) {
    const attribute = `data-${dataKey.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    const sections = [...this.element.querySelectorAll(`details[${attribute}]`)];
    const shown = new Set(sections.map((details) => details.dataset[dataKey]));
    const key = `${flag}.${this.actor.id}`;
    const saved = game.user.getFlag("lotm", key) ?? [];

    const collapsed = [
      ...saved.filter((group) => !shown.has(group)),
      ...sections.filter((details) => !details.open).map((details) => details.dataset[dataKey]),
    ];

    const same = collapsed.length === saved.length && collapsed.every((group) => saved.includes(group));
    if (!same) await game.user.setFlag("lotm", key, collapsed);
  }



  /**
   * Save an inventory control to its own Item. The input says which Item (data-item-id) and which
   * field (data-item-field, e.g. "system.quantity").
   * @param {Event} event
   */
  async #onItemFieldChange(event) {
    const input = event.currentTarget;
    const item = this.actor.items.get(input.dataset.itemId);
    if (!item) return;

    let value = input.value;
    if (input.type === "checkbox") value = input.checked;
    else if (input.type === "number") value = Math.max(0, Math.floor(Number(input.value) || 0));

    await item.update({ [input.dataset.itemField]: value });
  }


  /**
   * The entries of every drop section, and the granted entries this actor has hidden (sheets/actor/sections.mjs).
   * Also remembers the actor's renamed Spell Lists, for the Spells tab.
   * @returns {Promise<{sections: Record<string, object[]>, hidden: Record<string, object[]>}>}
   */
  async _prepareSections() {
    const { sections, hidden, namedSpellLists } = await new SectionBuilder(this.actor, { canHideGrants: this.canHideGrants }).build();
    this.#namedSpellLists = namedSpellLists;
    return { sections, hidden };
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                  */
  /* -------------------------------------------- */

  /**
   * Handle a Document being dropped onto the sheet. ActorSheetV2 has already parsed the drop
   * event and resolved it to a Document; this decides which section takes it.
   *
   * - Dropped on a section: the Item must belong in that section, otherwise it is rejected.
   * - Dropped anywhere else on the sheet: it is placed in the section for its type.
   * @override
   */
  async _onDropDocument(event, document) {
    if (document.documentName !== "Item") return super._onDropDocument(event, document);
    if (!this.isEditable) return null;

    // Gear dropped on a coat / bag (or on "Held & worn") in the Inventory tab goes there.
    const place = event.target?.closest?.("[data-inventory-place]")?.dataset.inventoryPlace;
    const placement = (document.type === "gear" && place !== undefined) ? placementUpdate(place) : null;

    // Already on this actor: move it if it was dropped on an inventory group, otherwise leave it to Foundry (re-sorting).
    if (document.parent === this.actor) {
      if (placement) return document.update(placement);
      return super._onDropDocument(event, document);
    }

    const section = sectionForType(document.type);
    if (!section) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.Unsupported", { name: document.name }));
      return null;
    }

    const zone = event.target?.closest?.("[data-drop-zone]")?.dataset.dropZone ?? null;
    if (zone && zone !== section) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.WrongSection", {
        name: document.name,
        section: game.i18n.localize(sectionLabel(zone)),
      }));
      return null;
    }

    if (section === "skills") return this.#dropSkill(document);
    return this.#dropEmbedded(document, placement);
  }


  /**
   * Copy an Item onto the actor as an embedded Item. The source UUID is kept in
   * _stats.compendiumSource so duplicates are caught and nested references to the same
   * Item are recognised as the one the actor already owns.
   * @param {Item} item
   * @param {object|null} [placement]  For gear: where it was dropped (see placementUpdate). When it wasn't
   *                                   dropped on a coat / bag, it goes in the first one with room.
   * @returns {Promise<Item|null>}
   */
  async #dropEmbedded(item, placement = null) {
    // Same Item already owned (by source), or, for abilities, one with the same name: _onDropItem below holds the
    // same rule, but drops from outside the actor are handled here and never reach it.
    // Gear and containers can be owned more than once, so they skip this.
    const alreadyOwned = !STACKABLE_TYPES.includes(item.type) && this.actor.items.some((owned) =>
      owned._stats?.compendiumSource === item.uuid
      || (item.type === "ability" && owned.type === "ability" && owned.name === item.name)
    );
    if (alreadyOwned) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.Duplicate", { name: item.name }));
      return null;
    }

    const data = item.toObject();
    delete data._id;
    delete data.folder;
    delete data.sort;
    delete data.ownership;
    foundry.utils.setProperty(data, "_stats.compendiumSource", item.uuid);

    // Gear: put it somewhere. Its old containerId (from another actor) means nothing here, so it's always replaced.
    if (item.type === "gear") {
      const where = placement ?? autoPlacement(this.actor, data);
      foundry.utils.mergeObject(data, foundry.utils.expandObject(where));
    }

    const [created] = await this.actor.createEmbeddedDocuments("Item", [data]);
    return created ?? null;
  }

  /**
   * Skills are not embedded: the actor saves a record per skill, by the skill's key
   * (system.skills.pistol = { level, ... }, see data/actor/base-actor.mjs), and the sheet lists it under its attribute.
   * Any skill Item can be dropped, from a compendium or the world (a world copy of a compendium skill is the same
   * skill: same key). Dropping saves it at "trained"; a skill the actor has at "untrained" (every standard skill, until
   * it's trained) is raised to "trained" instead of being rejected as a duplicate. Its other saved values are kept.
   * @param {Item} item
   * @returns {Promise<Item|null>}
   */
  async #dropSkill(item) {
    // Skills are listed on their linked attribute's tab, so only those attributes can be saved.
    const tabs = CONFIG.LORD_OF_THE_MYSTERIES.skillTabAttributes ?? [];
    const key = skillKeyFor(item);
    if (!key || !tabs.includes(item.system.skill_attribute)) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.NoSkillCategory", { name: item.name }));
      return null;
    }

    const record = this.actor.system.skills?.[key];
    if (record?.isSaved && record.level !== "untrained") {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Drop.Duplicate", { name: item.name }));
      return null;
    }

    await this.actor.update(skillRecordUpdate(this.actor, key, { level: "trained", uuid: record?.uuid || item.uuid }));
    return item;
  }


  /**
   * ActorSheetV2 already turns a dropped compendium/world Item into an owned copy;
   * this only stops the same ability being added twice.
   * @override
   */
  async _onDropItem(event, item) {
    const alreadyOwned = item.type === "ability"
      && item.parent?.uuid !== this.actor.uuid
      && this.actor.items.some(owned => owned.type === "ability"
        && (owned._stats?.compendiumSource === item.uuid || owned.name === item.name));
    if (alreadyOwned) {
      ui.notifications.warn(`${this.actor.name} already has ${item.name}.`);
      return null;
    }
    return super._onDropItem(event, item);
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /**
   * Open the core FilePicker to change the actor's portrait image.
   */
  static _onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.actor, attr);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: path => this.actor.update({ [attr]: path })
    });
    return fp.browse();
  }


  /**
   * Choices for a damage type dropdown in the sidebar, by key: { physical: "Physical", ... }.
   * @param {Record<string, string>} [types]   Keys and language keys. Default: the damage types.
   * @returns {Record<string, string>}
   */
  _prepareDamageTypes(types = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes) {
    return Object.fromEntries(Object.entries(types ?? {}).map(([key, label]) => [key, game.i18n.localize(label)]));
  }


  /**
   * The saved damage reduction or resistance rows, for the sidebar: each with its index (for its inputs' names and
   * its remove button). Their types are keys ("physical"); the actor's migrateData converts older rows.
   * @param {"reductions"|"resistances"} field
   * @returns {{index: number, damageType: string, value: number, isImmune?: boolean}[]}
   */
  _prepareDefenseRows(field) {
    return (this.actor.system[field] ?? []).map((row, index) => ({ ...row, index, damageType: row.damageType ?? "" }));
  }


  /**
   * Add a row to a list in the actor's system data (damage reduction or resistance).
   * @param {string} field   "reductions" or "resistances"
   * @param {object} row
   */
  async _addRow(field, row) {
    if (!this.isEditable) return;
    const current = this.actor.toObject().system[field] ?? [];
    await this.actor.update({ [`system.${field}`]: [...current, row] });
  }


  /**
   * Remove a row (data-index = its position) from a list in the actor's system data.
   * @param {string} field
   * @param {HTMLElement} target
   */
  async _removeRow(field, target) {
    if (!this.isEditable) return;
    const index = Number(target.dataset.index);
    const current = this.actor.toObject().system[field] ?? [];
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return;
    await this.actor.update({ [`system.${field}`]: current.filter((_, i) => i !== index) });
  }


  /** Add a damage reduction row. */
  static async #onAddReduction(event, target) {
    await this._addRow("reductions", { damageType: DEFAULT_REDUCTION_TYPE, value: DEFAULT_ROW_VALUE });
  }

  /** Remove a damage reduction row. */
  static async #onRemoveReduction(event, target) {
    await this._removeRow("reductions", target);
  }

  /** Add a damage resistance row. */
  static async #onAddResistance(event, target) {
    await this._addRow("resistances", { damageType: DEFAULT_RESISTANCE_TYPE, value: DEFAULT_ROW_VALUE, isImmune: false });
  }

  /** Remove a damage resistance row. */
  static async #onRemoveResistance(event, target) {
    await this._removeRow("resistances", target);
  }


  /**
   * The Check button under Sanity: a sanity check (apps/sanity-check-dialog.mjs). Shift-click rolls a 0/1
   * check straight away.
   */
  static async #onSanityCheck(event, target) {
    if (!this.isEditable) return;
    if (event.shiftKey) {
      const { default: SanityCheckDialog } = await import("../apps/sanity-check-dialog.mjs");
      return SanityCheckDialog.prompt(this.actor, { fast: true });
    }
    return openSanityCheck(this.actor);
  }


  /**
   * Open SkillCheckDialog for the clicked skill. All the data the dialog
   * needs (uuid/name/level/category/attribute) travels in via data-*
   * attributes on the skill row (see character.hbs on the player sheet, npc/main.hbs on the NPC sheet).
   * Shift-click rolls right away without the dialog.
   */
  static _onRollSkill(event, target) {
    const row = target.closest("[data-skill-uuid]");
    if (!row) return;

    SkillCheckDialog.prompt(this.actor, {
      // The skill's key, for its effect bonuses. Rows without one (a custom skill on an ability's tab) get none.
      key: row.dataset.skillKey || skillKeyFor(row.dataset.skillUuid),
      uuid: row.dataset.skillUuid,
      name: row.dataset.skillName,
      category: row.dataset.category,
      attribute: row.dataset.attribute || row.dataset.category,
      level: row.dataset.level,
      flatModifier: Number(row.dataset.flatModifier) || 0
    }, { fast: event.shiftKey });
  }


  /**
   * Click an attribute's total (data-attribute = the attribute key): open the attribute check dialog,
   * which rolls 1d20 plus that total plus any modifiers, e.g. "1d20 +3[STR]" (apps/attribute-check-dialog.mjs).
   * Shift-click rolls right away without the dialog.
   */
  static async #onRollAttribute(event, target) {
    await AttributeCheckDialog.prompt(this.actor, target.dataset.attribute, { fast: event.shiftKey });
  }


  /**
   * Roll an action with its skill (data-uuid = the action). Works for any action on the sheet, whether the
   * actor owns it or it's granted by a Sequence, ability or gear. All the rolling lives in
   * helpers/action-roll.mjs, so the sheet, hotbar macros and the chat damage button share one path.
   */
  static async #onRollAction(event, target) {
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    // gunId: for actions listed under a gun, that gun. rollActionAttack spends the rounds for "Fires rounds" actions.
    // Shift-click rolls right away without the dialog.
    if (action) await rollActionAttack(this.actor, action, { gunId: target.dataset.gunId, fast: event.shiftKey });
  }


  /**
   * A gun button on a Shoot row (data-ammo-use = what it does, data-gun-id = the gun, data-uuid = the action):
   *   fire                              a fire action with no attack roll (fireWithoutRoll in helpers/firearms.mjs)
   *   reload, chamber, rotate, unload   the gun's handling (GunHandling in helpers/gun-handling.mjs)
   * Shift-click Reload: no dialog, fill it with the first ammo that fits.
   */
  static async #onUseAmmo(event, target) {
    if (!this.isEditable) return;
    const { uuid, gunId, ammoUse } = target.dataset;
    if (ammoUse === "fire") {
      const action = await fromUuid(uuid).catch(() => null);
      if (action) await fireWithoutRoll(this.actor, action, gunId);
      return;
    }
    const gun = gunFor(this.actor, gunId);
    await GunHandling.get(gun, ammoUse)?.perform(this.actor, { fast: event.shiftKey });
  }


  /**
   * The sidebar's Spend button under Spirituality: ask how much, then spend it (helpers/spirituality.mjs).
   */
  static async #onSpendSpirituality(event, target) {
    if (!this.isEditable) return;
    await openSpendSpiritualityDialog(this.actor);
  }


  /**
   * The "Spend N" button on an action with a Spirituality Cost but nothing to roll (data-uuid = the action).
   */
  static async #onUseSpirituality(event, target) {
    if (!this.isEditable) return;
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    if (action) await useActionSpirituality(this.actor, action);
  }


  /**
   * The On / Off button on an action with a Toggle effect (data-uuid = the action): switch it on or off
   * (useToggleAction in effects/toggle-effects.mjs). The sheet redraws itself when the effect comes or goes.
   */
  static async #onToggleAction(event, target) {
    if (!this.isEditable) return;
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    if (action) await useToggleAction(this.actor, action);
  }


  /**
   * Roll an action's damage straight from the sheet (data-uuid = the action), without rolling the attack first.
   * Same roll and chat message as the "Roll Damage" button in chat.
   */
  static async #onRollDamage(event, target) {
    const action = await fromUuid(target.dataset.uuid).catch(() => null);
    if (action) await rollActionDamage(this.actor, action);
  }


  /**
   * Open an owned item's sheet (the edit control on the player Abilities tab's own list).
   */
  static _onEditItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    item?.sheet.render(true);
  }


  /**
   * Remove an owned item from the actor, with Foundry's own confirm dialog.
   * (Not wired to a button; the sheets use #onDeleteItem. Kept for anything that calls it directly.)
   */
  static async _onDeleteItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    await item?.deleteDialog();
  }


  /** Open the sheet of an entry's Item, whether the actor owns it or it is only referenced. */
  static async #onOpenItem(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet?.render({ force: true });
  }


  /**
   * Move an entry one place up or down within its section (data-direction="up"|"down", data-key = entry key).
   * Works for owned and granted entries alike. The order on screen is the source of truth: swap the entry with
   * its neighbour in that list and save the whole section's order, which also drops keys of entries that no
   * longer exist.
   */
  static async #onMoveEntry(event, target) {
    if (!this.isEditable) return;

    const zone = target.closest("[data-drop-zone]");
    const section = zone?.dataset.dropZone;
    if (!section) return;

    const list = target.closest(".drop-section-list");
    const up = target.dataset.direction === "up";

    // Favorites: their order is the favorites list itself (FAVORITES_FLAG), separate from the
    // section's order, so moving a favorite doesn't move it in its type section.
    if (list?.hasAttribute("data-favorites")) {
      const order = [...list.children].filter((li) => li.matches(".drop-entry")).map((li) => li.dataset.key);
      const from = order.indexOf(target.dataset.key);
      const to = from + (up ? -1 : 1);
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      await this.actor.update({ [FAVORITES_FLAG]: order });
      return;
    }

    // Every entry in the whole section, top to bottom (not counting the Favorites copies). This full list is what gets saved.
    const keys = [...zone.querySelectorAll(".drop-section-list:not([data-favorites]) > .drop-entry")].map((li) => li.dataset.key);

    // The entries in the same list as the clicked one. Most sections have one list, so this is the same as
    // `keys`; on the Spells tab each Spell List group is its own list, and in the action sections each action type
    // section is; an entry only moves inside its group.
    const siblings = list
      ? [...list.children].filter((li) => li.matches(".drop-entry")).map((li) => li.dataset.key)
      : keys;

    const from = siblings.indexOf(target.dataset.key);
    const to = from + (up ? -1 : 1);
    if (from < 0 || to < 0 || to >= siblings.length) return;

    // Swap the two neighbours' places in the full list.
    const a = keys.indexOf(siblings[from]);
    const b = keys.indexOf(siblings[to]);
    [keys[a], keys[b]] = [keys[b], keys[a]];
    await this.actor.update({ [`${ORDER_FLAG}.${section}`]: keys });
  }


  /**
   * The star on an action row: add the action to Favorites, or take it out (data-key = the entry key).
   * Saved on the actor (FAVORITES_FLAG); new favorites go at the bottom of the list.
   */
  static async #onToggleFavorite(event, target) {
    if (!this.isEditable) return;
    const key = target.dataset.key;
    const current = foundry.utils.getProperty(this.actor, FAVORITES_FLAG) ?? [];
    const updated = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    await this.actor.update({ [FAVORITES_FLAG]: updated });
  }


  /**
   * The eye-slash button on a granted row (data-hide-key, see _prepareSections): hide it on this actor.
   * Only actors with a hiddenGrants list (NPCs) have the button. The Item that grants it isn't changed.
   */
  static async #onHideGrant(event, target) {
    if (!this.isEditable || !this.canHideGrants) return;
    const key = target.dataset.hideKey;
    const current = this.actor.system.hiddenGrants;
    if (!key || current.includes(key)) return;
    await this.actor.update({ "system.hiddenGrants": [...current, key] });
  }


  /** The Restore button in a "Hidden" list (data-hide-key): show the entry again. */
  static async #onRestoreGrant(event, target) {
    if (!this.isEditable || !this.canHideGrants) return;
    const key = target.dataset.hideKey;
    const current = this.actor.system.hiddenGrants;
    if (!key || !current.includes(key)) return;
    await this.actor.update({ "system.hiddenGrants": current.filter((k) => k !== key) });
  }


  /**
   * Post an entry's Item to chat: image, name and description, spoken as this actor.
   * Works for owned Items and for ones that are only referenced (granted by another Item).
   */
  static async #onSendToChat(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    if (!doc) return;

    const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      doc.system?.description ?? "",
      { secrets: doc.isOwner, relativeTo: doc }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: renderTemplateSync("systems/lotm/templates/chat/item-card.hbs", { name: doc.name, img: doc.img, description }),
    });
  }

  // Skills come from compendiums / the sidebar, so that button just points at drag and drop.
  static async #onAddSkill(event, target) {
    ui.notifications.info(game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.DragHintSkills"));
  }

  static async #onAddSequence(event, target) {
    return createBlankItem(this, "sequence");
  }

  static async #onAddAbility(event, target) {
    return createBlankItem(this, "ability");
  }

  static async #onAddAction(event, target) {
    return createBlankItem(this, "action");
  }

  static async #onAddSpell(event, target) {
    return createBlankItem(this, "spell");
  }


  /**
   * A skill's level dropdown or analysis box changed (data-skill-field = "level" or "analysis"; the row has
   * data-skill-key). Saves that one skill's record (helpers/skill-data.mjs). The event is stopped so the sheet's form
   * doesn't also save.
   * @param {Event} event
   */
  async #onSkillFieldChange(event) {
    event.stopPropagation();
    if (!this.isEditable) return;
    const input = event.currentTarget;
    const key = input.closest("[data-skill-key]")?.dataset.skillKey;
    const field = input.dataset.skillField;
    if (!key || !["level", "analysis"].includes(field)) return;
    const value = field === "analysis" ? Math.max(0, Math.floor(Number(input.value) || 0)) : input.value;
    await this.actor.update(skillRecordUpdate(this.actor, key, { [field]: value }));
  }


  /**
   * Remove a skill the actor has saved (its record, and any old-format entry for it). Expects data-skill-key on the
   * button (or data-uuid, for older templates).
   */
  static async #onDeleteSkill(event, target) {
    if (!this.isEditable) return;
    const key = target.dataset.skillKey || skillKeyFor(target.dataset.uuid);
    const update = deleteSkillUpdate(this.actor, key);
    if (Object.keys(update).length) await this.actor.update(update);
  }


  /**
   * Remove an embedded Item (shared by deleteSequence / deleteAbility / deleteAction / deleteSpell /
   * deleteItem). Hold Shift to skip the confirmation. Only owned entries get a delete button;
   * granted ones are removed from the Item that grants them (or hidden, on NPCs).
   */
  static async #onDeleteItem(event, target) {
    // The id sits on the button in the drop sections, and on the row around it in the player Abilities tab's own list.
    const item = this.actor.items.get(target.dataset.itemId ?? target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;

    if (!event.shiftKey) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.RemoveTitle") },
        content: paragraphsHTML({ key: "LORD_OF_THE_MYSTERIES.Drop.RemoveConfirm", data: { name: item.name } }),
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return;
    }

    await item.delete();
  }

  /* -------------------------------------------- */
  /*  Effects tab                                  */
  /* -------------------------------------------- */











  /**
   * The effect an Effects tab control belongs to (its row's data-effect-uuid): one of the actor's own effects or
   * one an Item lends it.
   * @param {HTMLElement} target
   * @returns {ActiveEffect|null}
   */
  #effectFor(target) {
    const uuid = target.closest("[data-effect-uuid]")?.dataset.effectUuid;
    if (!uuid) return null;
    for (const effect of this.actor.allApplicableEffects()) {
      if (effect.uuid === uuid) return effect;
    }
    return null;
  }


  /** A status toggle (data-status-id): add the status, or remove it. The same as the Token HUD's status icons. */
  static async #onToggleStatus(event, target) {
    if (!this.isEditable) return;
    await this.actor.toggleStatusEffect(target.dataset.statusId);
  }


  /** Switch an effect off, or back on. */
  static async #onToggleEffect(event, target) {
    if (!this.isEditable) return;
    const effect = this.#effectFor(target);
    await effect?.update({ disabled: !effect.disabled });
  }


  /** Open an effect's own sheet (name, duration, changes, statuses). */
  static #onEditEffect(event, target) {
    this.#effectFor(target)?.sheet.render({ force: true });
  }


  /** Delete one of the actor's own effects. Hold Shift to skip the confirmation (like removing an Item). */
  static async #onDeleteEffect(event, target) {
    if (!this.isEditable) return;
    const effect = this.#effectFor(target);
    if (!effect || effect.parent !== this.actor) return;

    if (!event.shiftKey) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.RemoveTitle") },
        content: paragraphsHTML({ key: "LORD_OF_THE_MYSTERIES.Drop.RemoveConfirm", data: { name: effect.name } }),
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return;
    }

    await effect.delete();
  }


  /**
   * Refresh: make the copies of granted abilities' passive effects match the abilities again
   * (effects/granted-effects.mjs), after the abilities were edited.
   */
  static async #onRefreshGrantedEffects(event, target) {
    if (!this.isEditable) return;
    const result = await syncGrantedEffects(this.actor);
    if (result) {
      ui.notifications.info(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Granted.Refreshed", {
        name: this.actor.name, created: result.created, removed: result.removed,
      }));
    }
  }


  /** Open a status's rules page (data-uuid) in the LOTM Rules journal. */
  static async #onOpenEffectRules(event, target) {
    const page = await fromUuid(target.dataset.uuid).catch(() => null);
    if (!page) {
      ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Effects.RulesMissing"));
      return;
    }
    page.parent.sheet.render({ force: true, pageId: page.id });
  }


  /** A status's own button on an effect row (data-status-id, data-button), e.g. Stand Up for Loss of Balance. */
  static async #onEffectButton(event, target) {
    if (!this.isEditable) return;
    const effect = this.#effectFor(target);
    const rule = statusRule(target.dataset.statusId);
    if (effect && rule) await rule.onButton(target.dataset.button, effect);
  }

}
