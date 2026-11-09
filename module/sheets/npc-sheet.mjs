/**
 * NPC sheet.
 *
 * Built on LordOfTheMysteriesActorSheetBase (base-actor-sheet.mjs), the same base as the player sheet, so the
 * drop sections, drag and drop, action rows, rolls and move / delete buttons work exactly like they do there.
 * This file only has what's different for NPCs:
 *   - a stat-block layout: header (Sequence and organization), sidebar, and a Main tab with attributes,
 *     skills and actions together
 *   - skills: only the ones dropped on the sheet (plus any a Sequence raises), instead of the whole compendium
 *   - a simple inventory: one list, no slots, pockets or money
 *   - no Favorites on actions
 *   - the Effects tab is the player sheet's (effects.hbs), between Sequences and Notes
 *
 * Hiding granted abilities, actions, spells and skill raises is handled by the base sheet; it's turned on
 * because NPC data has a hiddenGrants list (data/actor/actor-npc.mjs).
 */

import { LordOfTheMysteriesActorSheetBase, SHARED_PARTIALS, SIDEBAR_TEMPLATE } from "./base-actor-sheet.mjs";
import { skillRaiseText, skillRollTooltip } from "./actor/skill-tooltips.mjs";
import { skillKeyFor } from "../helpers/skill-registry.mjs";
import { CARRY_MODES } from "../helpers/inventory-config.mjs";
import { autoPlacement } from "../helpers/inventory.mjs";

const TEMPLATES = "systems/lotm/templates/actor";

/** "+2", "0", "-1" */
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);


export class NpcSheet extends LordOfTheMysteriesActorSheetBase {

  /** NPC actions have no Favorites section or stars. */
  static FAVORITES = false;

  /** The GM types an NPC's Spirituality straight in. */
  static SPIRITUALITY_EDITABLE = true;

  /**
   * @override
   * Only what's new for this sheet. Foundry adds these to the base sheet's options
   * (its actions, classes, form and drag-and-drop settings), see base-actor-sheet.mjs.
   */
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: {
      width: 800,
      height: 760
    },
    actions: {
      addItem: NpcSheet.#onAddItem,
    },
  };

  /** @override */
  static PARTS = {
    header:    { template: `${TEMPLATES}/npc/header.hbs` },
    sidebar:   { template: SIDEBAR_TEMPLATE },
    tabs:      { template: `${TEMPLATES}/npc/tab-nav.hbs` },
    main:      { template: `${TEMPLATES}/npc/main.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    abilities: { template: `${TEMPLATES}/npc/abilities.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    // The player sheet's Spells and Sequences tabs work as they are.
    spells:    { template: `${TEMPLATES}/player-character/parts/spells.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    inventory: { template: `${TEMPLATES}/npc/inventory.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    sequences: { template: `${TEMPLATES}/player-character/parts/sequences.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    // The player sheet's Effects tab too (prepared by the base sheet).
    effects:   { template: `${TEMPLATES}/player-character/parts/effects.hbs`, scrollable: [""] },
    notes:     { template: `${TEMPLATES}/npc/notes.hbs`, scrollable: [""] },
  };

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        { id: "main", label: "LORD_OF_THE_MYSTERIES.Tabs.Main" },
        { id: "abilities", label: "LORD_OF_THE_MYSTERIES.Tabs.Abilities" },
        { id: "spells", label: "LORD_OF_THE_MYSTERIES.Tabs.Spells" },
        { id: "inventory", label: "LORD_OF_THE_MYSTERIES.Tabs.Inventory" },
        { id: "sequences", label: "LORD_OF_THE_MYSTERIES.Tabs.Sequences" },
        { id: "effects", label: "LORD_OF_THE_MYSTERIES.Tabs.Effects" },
        { id: "notes", label: "LORD_OF_THE_MYSTERIES.Tabs.Notes" },
      ],
      initial: "main"
    }
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /**
   * @override
   * The base sheet fills in the actor, the page tabs and every drop section (context.sections and
   * context.hiddenGrants). This adds the header's Sequence line.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.sequenceLine = this.#sequenceLine();
    return context;
  }


  /**
   * @override
   * The base sheet handles the Spells and sidebar parts; these are the NPC-only ones.
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);

    switch (partId) {
      case "main":
        context.attributesList = this.#prepareAttributes();
        context.skills = await this.#prepareSkills();
        context.skillLevelOptions = CONFIG.LORD_OF_THE_MYSTERIES.skillLevels;
        // Same collapsible action sections as the player Actions tab, without Favorites.
        context.actionGroups = this._prepareActionGroups(context.sections.actions);
        break;

      case "inventory":
        context.inventory = this.#prepareInventory(context.sections.inventory);
        break;

      case "notes":
        context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          this.actor.system.biography,
          {
            secrets: this.actor.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor,
          }
        );
        break;
    }

    return context;
  }


  /**
   * The header's Sequence line, from the NPC's strongest owned Sequence (lowest number):
   * "Sequence 7 · Pyromaniac (Hunter)", or "No Sequence".
   * @returns {string}
   */
  #sequenceLine() {
    // The lowest-numbered owned Sequence (_currentSequence in base-actor-sheet.mjs).
    const current = this._currentSequence();
    if (!current) return game.i18n.localize("LORD_OF_THE_MYSTERIES.NPC.NoSequence");
    const key = current.pathway ? "LORD_OF_THE_MYSTERIES.NPC.SequenceLine" : "LORD_OF_THE_MYSTERIES.NPC.SequenceLineNoPathway";
    return game.i18n.format(key, current);
  }


  /**
   * The eight attributes for the Main tab: the total (click to roll) and the base the GM types in.
   * Hovering shows where the total comes from.
   * @returns {object[]}
   */
  #prepareAttributes() {
    const config = CONFIG.LORD_OF_THE_MYSTERIES;
    return Object.entries(config.attributes).map(([key, label]) => {
      const attr = this.actor.system.attributes[key];
      const sequence = attr.sequence_bonus ?? 0;
      // Corruption, armor's Agility penalty and Education growth, all together, so the parts add up to the total.
      const other = (attr.total ?? 0) - (attr.base ?? 0) - sequence;
      return {
        key,
        abbr: config.attributeAbbreviations[key],
        base: attr.base,
        total: attr.total,
        tooltip: game.i18n.format("LORD_OF_THE_MYSTERIES.NPC.AttributeTooltip", {
          name: game.i18n.localize(label),
          base: attr.base,
          sequence: signed(sequence),
          other: signed(other),
        }),
      };
    });
  }


  /**
   * The Skills list on the Main tab: every skill the GM dropped on the NPC (its saved skill records), plus skills a
   * Sequence or an active effect raises. NPCs don't get every standard skill (actor-npc.mjs).
   *
   * Levels, totals and bonuses come from the NPC's skill records, worked out like a player character's
   * (data/actor/base-actor.mjs): the NPC's own level (at least the starting level, e.g. Dodge's Trained), raised by its
   * Sequences and effects, then by related skills.
   *
   * Rows:
   *   key             The skill's key (what's saved, and what the level dropdown and trash button use).
   *   owned           true when the GM dropped it on (trash button). false = only a Sequence or effect gives it (hide button).
   *   canChangeLevel  Its level can be saved (its attribute has a skill tab, the same rule as dropping).
   *   level           The NPC's own level (the dropdown).
   *   effectiveLevel  The level it's rolled at.
   *   modifier        Attribute total + level bonus + its own modifier + effect bonuses.
   *   hideKey         What the hide button hides: the Sequence's reference to the skill.
   * @returns {Promise<object[]>}
   */
  async #prepareSkills() {
    const config = CONFIG.LORD_OF_THE_MYSTERIES;
    const system = this.actor.system;
    const levelLabel = (level) => game.i18n.localize(config.skillLevels[level] ?? level);

    // Which owned Sequences raise each skill, for the "Raised by" label, and the UUID each uses (what hiding hides).
    const hidden = new Set(system.hiddenGrants ?? []);
    const raisedBy = new Map();   // skill key -> [Sequence names]
    const hideKeys = new Map();   // skill key -> the UUID in the Sequence's list
    for (const item of this.actor.items) {
      if (item.type !== "sequence") continue;
      for (const { skill_uuid, value } of item.system.skill_increase ?? []) {
        if (!skill_uuid || !value || hidden.has(skill_uuid)) continue;
        const key = skillKeyFor(skill_uuid);
        if (!key) continue;
        const names = raisedBy.get(key) ?? [];
        if (!names.includes(item.name)) names.push(item.name);
        raisedBy.set(key, names);
        if (!hideKeys.has(key)) hideKeys.set(key, skill_uuid);
      }
    }

    const rows = [];
    for (const record of Object.values(system.skills ?? {})) {
      const owned = !!record.isSaved;
      if (!owned && !((record.sequenceSteps ?? 0) > 0) && !(record.raisedBy ?? []).length) continue;

      // A saved skill whose Item was deleted: still listed, so the GM can remove it.
      if (record.isBroken) {
        if (!owned) continue;
        rows.push({
          key: record.key, uuid: record.uuid, name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing"),
          img: "icons/svg/hazard.svg", broken: true, owned, level: record.level, effectiveLevel: record.level,
          categories: [], canChangeLevel: false,
        });
        continue;
      }

      // Active effects raising a skill are named in the "Raised by" label too.
      const names = [...(raisedBy.get(record.key) ?? [])];
      for (const name of record.raisedBy ?? []) if (name && !names.includes(name)) names.push(name);
      const raisedText = skillRaiseText(record, levelLabel);

      rows.push({
        key: record.key,
        uuid: record.uuid,
        name: record.name,
        img: record.img,
        broken: false,
        owned,
        category: record.attribute,
        attribute: record.attribute,
        attributeLabel: config.attributeAbbreviations[record.attribute] ? game.i18n.localize(config.attributeAbbreviations[record.attribute]) : "",
        attributeTotal: record.attributeTotal,
        flatModifier: record.flatModifier ?? 0,
        categories: record.categories,
        level: record.ownLevel,
        effectiveLevel: record.effectiveLevel,
        canChangeLevel: record.canSave,
        raisedByLabel: names.join(", "),
        associated: !!raisedText,
        associatedTooltip: raisedText,
        modifier: record.total,
        hasBonus: (record.bonusTotal ?? 0) !== 0,
        rollTooltip: skillRollTooltip(this.actor, record.key),
        hideKey: hideKeys.get(record.key) ?? record.uuid,
      });
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }


  /**
   * The Inventory tab: one flat list. Gear rows get a quantity box and a Held / Worn / Stowed dropdown,
   * which is all an NPC needs: worn armor protects, and the gun in hand is the one its actions fire.
   * No slots, pockets or carrying limit (NPCs don't lose Agility for carrying too much, see actor-npc.mjs).
   * @param {object[]} entries  context.sections.inventory
   * @returns {{locationOptions: Record<string, string>}}  context.inventory, read by drop-entry.hbs
   */
  #prepareInventory(entries) {
    const localize = (key) => game.i18n.localize(key);
    const locationOptions = {
      held: localize(CARRY_MODES.held.label),
      worn: localize(CARRY_MODES.worn.label),
      "": localize(CARRY_MODES.stowed.label),   // placementUpdate("") = stowed, not in a container
    };

    for (const entry of entries) {
      const item = entry.owned ? this.actor.items.get(entry.id) : null;
      if (item?.type !== "gear") continue;
      const carry = item.system.carry;
      const location = (carry === "held" || carry === "worn") ? carry : "";
      entry.gear = {
        quantity: item.system.quantity,
        location,
        locationLabel: locationOptions[location],
      };
    }

    return { locationOptions };
  }


  /**
   * The Inventory tab's "+" button: create a blank piece of gear and open its sheet.
   * (The player sheet asks gear or clothing / bag; NPCs don't use containers.)
   */
  static async #onAddItem(event, target) {
    if (!this.isEditable) return;
    const data = { name: Item.implementation.defaultName({ type: "gear", parent: this.actor }), type: "gear" };
    foundry.utils.mergeObject(data, foundry.utils.expandObject(autoPlacement(this.actor, data)));
    const [created] = await this.actor.createEmbeddedDocuments("Item", [data]);
    created?.sheet?.render({ force: true });
  }

}
