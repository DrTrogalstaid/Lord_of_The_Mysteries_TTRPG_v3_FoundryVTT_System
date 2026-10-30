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
 *
 * Hiding granted abilities, actions, spells and skill raises is handled by the base sheet; it's turned on
 * because NPC data has a hiddenGrants list (data/actor/actor-npc.mjs).
 */

import { LordOfTheMysteriesActorSheetBase, SHARED_PARTIALS } from "./base-actor-sheet.mjs";
import { calculateSkillModifier } from "../helpers/skill-modifiers.mjs";
import { atLeastLevel, computeAssociatedLevels, raiseLevel, skillCategoriesOf } from "../helpers/skill-associations.mjs";
import { CARRY_MODES } from "../helpers/inventory-config.mjs";
import { autoPlacement } from "../helpers/inventory.mjs";

const TEMPLATES = "systems/lotm/templates/actor";

/** "+2", "0", "-1" */
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);


export class NpcSheet extends LordOfTheMysteriesActorSheetBase {

  /** NPC actions have no Favorites section or stars. */
  static FAVORITES = false;

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
    sidebar:   { template: `${TEMPLATES}/npc/sidebar.hbs` },
    tabs:      { template: `${TEMPLATES}/npc/tab-nav.hbs` },
    main:      { template: `${TEMPLATES}/npc/main.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    abilities: { template: `${TEMPLATES}/npc/abilities.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    // The player sheet's Spells and Sequences tabs work as they are.
    spells:    { template: `${TEMPLATES}/player-character/parts/spells.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    inventory: { template: `${TEMPLATES}/npc/inventory.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
    sequences: { template: `${TEMPLATES}/player-character/parts/sequences.hbs`, templates: SHARED_PARTIALS, scrollable: [""] },
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
    const sequences = this.actor.items
      .filter((item) => item.type === "sequence")
      .sort((a, b) => (a.system.sequence_number ?? 9) - (b.system.sequence_number ?? 9));
    const top = sequences[0];
    if (!top) return game.i18n.localize("LORD_OF_THE_MYSTERIES.NPC.NoSequence");

    const data = { number: top.system.sequence_number ?? "?", name: top.name, pathway: top.system.pathway };
    const key = top.system.pathway ? "LORD_OF_THE_MYSTERIES.NPC.SequenceLine" : "LORD_OF_THE_MYSTERIES.NPC.SequenceLineNoPathway";
    return game.i18n.format(key, data);
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
   * The Skills list on the Main tab: every skill the GM dropped on the NPC (system.skills, the same place the
   * player sheet keeps skill levels, so action rolls find them), plus skills only a Sequence raises.
   *
   * Each row's level is worked out like the player sheet does: the NPC's own level (at least the starting
   * level, e.g. Dodge's Trained), raised by its Sequences, then by related skills.
   *
   * Rows:
   *   owned           true when the GM dropped it on (trash button). false = only a Sequence gives it (hide button).
   *   category        The system.skills list it's saved in ("" when it can't be saved, so its level can't be changed).
   *   level           The NPC's own level (the dropdown).
   *   effectiveLevel  The level it's rolled at.
   *   modifier        Attribute total + level bonus, like the player sheet shows.
   * @returns {Promise<object[]>}
   */
  async #prepareSkills() {
    const config = CONFIG.LORD_OF_THE_MYSTERIES;
    const folders = config.skillCompendiumFolders ?? {};
    const minimums = config.defaultSkillLevels ?? {};
    const system = this.actor.system;
    const sequenceSteps = system.sequenceSkillSteps ?? {};   // already leaves out hidden raises (base-actor.mjs)
    const levelLabel = (level) => game.i18n.localize(config.skillLevels[level] ?? level);

    // Which owned Sequences raise each skill, for the "Raised by" label.
    const hidden = new Set(system.hiddenGrants ?? []);
    const raisedBy = new Map();   // skill uuid -> [Sequence names]
    for (const item of this.actor.items) {
      if (item.type !== "sequence") continue;
      for (const { skill_uuid, value } of item.system.skill_increase ?? []) {
        if (!skill_uuid || !value || hidden.has(skill_uuid)) continue;
        const names = raisedBy.get(skill_uuid) ?? [];
        if (!names.includes(item.name)) names.push(item.name);
        raisedBy.set(skill_uuid, names);
      }
    }

    // 1. What to list: the skills the GM dropped on, then skills only a Sequence raises.
    const listed = new Map();   // skill uuid -> { category, level } (level null = only from a Sequence)
    for (const [category, entries] of Object.entries(system.skills ?? {})) {
      for (const entry of entries ?? []) {
        if (entry?.skill && !listed.has(entry.skill)) listed.set(entry.skill, { category, level: entry.level });
      }
    }
    for (const [uuid, steps] of Object.entries(sequenceSteps)) {
      if (steps > 0 && !listed.has(uuid)) listed.set(uuid, { category: null, level: null });
    }

    // 2. One row per skill.
    const rows = await Promise.all([...listed].map(async ([uuid, stored]) => {
      const doc = await fromUuid(uuid).catch(() => null);
      const owned = stored.level !== null;

      // A saved skill whose Item was deleted: still listed, so the GM can remove it.
      if (!doc) {
        if (!owned) return null;
        return {
          uuid, name: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing"), img: "icons/svg/hazard.svg",
          broken: true, owned, category: stored.category, level: stored.level, effectiveLevel: stored.level,
          categories: [], canChangeLevel: false,
        };
      }

      const skillAttribute = doc.system?.skill_attribute;
      // Where a drop would file it (see #dropSkill in base-actor-sheet.mjs), for skills only a Sequence gives.
      const category = stored.category ?? ([skillAttribute].find((key) => key && key in folders) ?? "");
      // Same attribute choice as the player sheet: the list's attribute, or the skill's own for lists like Languages.
      const attributeKey = category in config.attributes ? category : (skillAttribute ?? category);
      const attribute = skillAttribute || category;
      const level = atLeastLevel(stored.level ?? "untrained", minimums[uuid]);

      return {
        uuid,
        name: doc.name,
        img: doc.img,
        broken: false,
        owned,
        category,
        attribute,
        attributeLabel: config.attributeAbbreviations[attribute] ? game.i18n.localize(config.attributeAbbreviations[attribute]) : "",
        attributeTotal: system.attributes[attributeKey]?.total ?? 0,
        flatModifier: doc.system?.modifier ?? 0,
        categories: skillCategoriesOf(doc.system),
        level,
        effectiveLevel: level,
        canChangeLevel: !!category,
        raisedByLabel: (raisedBy.get(uuid) ?? []).join(", "),
        associated: false,
        associatedTooltip: "",
      };
    }));
    const skills = rows.filter(Boolean);

    // 3. Sequence raises, then related skills (same steps as the player sheet's #applySkillAssociations).
    const working = skills.filter((row) => !row.broken);
    const raised = working.map((row) => ({ ...row, level: raiseLevel(row.level, sequenceSteps[row.uuid] ?? 0) }));
    const results = computeAssociatedLevels(raised);

    for (const row of working) {
      const steps = sequenceSteps[row.uuid] ?? 0;
      const result = results.get(row.uuid);
      row.effectiveLevel = result?.level ?? row.level;
      row.modifier = calculateSkillModifier(row.effectiveLevel, row.attributeTotal);
      if (row.effectiveLevel === row.level) continue;   // nothing raised it: no badge

      row.associated = true;
      const reasons = [];
      if (steps > 0) {
        reasons.push(game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.RaisedBySequence", { steps }));
      }
      if (result?.raised) {
        reasons.push(game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.RaisedBy", {
          level: levelLabel(result.level),
          sources: result.sources.map((source) => `${source.name} (${levelLabel(source.level)})`).join(", "),
        }));
      }
      row.associatedTooltip = reasons.join(" · ");
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
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


  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Skill level dropdowns. They have no `name` (the form doesn't save them); each saves only its own skill,
    // so a change can't wipe the rest of the list.
    for (const select of this.element.querySelectorAll("[data-npc-skill-level]")) {
      if (select.dataset.bound) continue;
      select.dataset.bound = "1";
      select.addEventListener("change", (event) => this.#onSkillLevelChange(event));
    }
  }


  /**
   * Save a skill's new level from its dropdown. A skill the NPC only had through a Sequence gets its own
   * saved level this way (and then a trash button instead of the hide button).
   * @param {Event} event
   */
  async #onSkillLevelChange(event) {
    if (!this.isEditable) return;
    const select = event.currentTarget;
    const row = select.closest("[data-skill-uuid]");
    const uuid = row?.dataset.skillUuid;
    const category = row?.dataset.category;
    if (!uuid || !category) return;

    const level = select.value;
    const current = this.actor.toObject().system.skills?.[category] ?? [];
    const index = current.findIndex((entry) => entry.skill === uuid);
    const updated = index < 0
      ? [...current, { skill: uuid, level }]
      : current.map((entry, i) => (i === index ? { ...entry, level } : entry));
    await this.actor.update({ [`system.skills.${category}`]: updated });
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
