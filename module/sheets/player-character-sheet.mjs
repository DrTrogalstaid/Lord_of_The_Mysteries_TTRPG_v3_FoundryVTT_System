/**
 * Player Character sheet.
 *
 * NOTE ON PLACEHOLDER NAME: replace every occurrence of "lotm" in this file
 * (and in the .hbs templates) with your actual system id, i.e. whatever you
 * registered in your system.json's "id" field. It's used in:
 *   - static PARTS template paths ("systems/lotm/templates/...")
 *   - the "lotm" CSS class in DEFAULT_OPTIONS.classes (also referenced by actor-sheet.css)
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;


export class PlayerCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {


  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["lotm", "sheet", "actor", "player-character"],
    position: {
      width: 850,
      height: 830
    },
    window: {
      resizable: true,
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.PlayerCharacter"
    },
    form: {
      submitOnChange: true
    },
    actions: {
      shortRest: PlayerCharacterSheet._onShortRest,
      longRest: PlayerCharacterSheet._onLongRest,
      spendLuck: PlayerCharacterSheet._onSpendLuck,
      spendSpirituality: PlayerCharacterSheet._onSpendSpirituality,
      editImage: PlayerCharacterSheet._onEditImage
    }
  };

  /** @override */
  static PARTS = {
    header: {
      template: "systems/lotm/templates/actor/player-character/parts/header.hbs"
    },
    sidebar: {
      template: "systems/lotm/templates/actor/player-character/parts/sidebar.hbs"
    },
    tabs: {
      // Doubles as the "Character Info" box header / page-selector shown in the mockup.
      template: "systems/lotm/templates/actor/player-character/parts/tab-nav.hbs"
    },
    character: {
      template: "systems/lotm/templates/actor/player-character/character.hbs",
      scrollable: [""]
    },
    biography: {
      template: "systems/lotm/templates/actor/player-character/parts/biography.hbs",
      scrollable: [""]
    }
  };

  /** @override */
  static TABS = {
    // The "Character Info" box's page selector (Character Info / Biography).
    sheet: {
      tabs: [
        { id: "character", label: "LORD_OF_THE_MYSTERIES.Tabs.Character" },
        { id: "biography", label: "LORD_OF_THE_MYSTERIES.Tabs.Biography" }
      ],
      initial: "character"
    },
    // The nested sub-page selector under the Languages box (Strength / Charisma / Agility / Perception).
    // Content is stubbed out for now - skills will be added later.
    skills: {
      tabs: [
        { id: "strength", label: "LORD_OF_THE_MYSTERIES.Tabs.Strength" },
        { id: "charisma", label: "LORD_OF_THE_MYSTERIES.Tabs.Charisma" },
        { id: "agility", label: "LORD_OF_THE_MYSTERIES.Tabs.Agility" },
        { id: "perception", label: "LORD_OF_THE_MYSTERIES.Tabs.Perception" }
      ],
      initial: "strength"
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
    context.source = this.actor.toObject().system;

    // Two independent tab groups: the "Character Info"/"Biography" page selector,
    // and the nested skills sub-tabs (Strength/Charisma/Agility/Perception).
    context.tabs = this._prepareTabs("sheet");
    context.skillTabs = this._prepareTabs("skills");

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    context.partId = `${this.id}-${partId}`;

    switch (partId) {
      case "character":
        context.tab = context.tabs.character;
        context.attributesList = this._prepareAttributes();
        break;

      case "biography":
        context.tab = context.tabs.biography;
        // Single journal-style field for now (system.biography is a plain StringField).
        // Swap/extend this once the full Biography page layout is designed.
        context.enrichedBiography = await TextEditor.enrichHTML(
          this.actor.system.biography ?? "",
          {
            secrets: this.actor.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor
          }
        );
        break;
    }

    return context;
  }

  /**
   * Flatten system.attributes into an array of {key, label, base, beyonder_bonus, corruption, total}
   * for easy iteration in the template. `total` is computed here since the data model doesn't
   * currently define a derived-data getter for it. Keys/labels come straight from
   * CONFIG.LORD_OF_THE_MYSTERIES.attributes (str/agi/wil/phy/cha/ins/luc/edu) so this stays in
   * sync with helpers/config.mjs automatically.
   * @returns {object[]}
   */
  _prepareAttributes() {
    return Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.attributes).map(([key, label]) => {
      const attr = this.actor.system.attributes[key] ?? {};
      const base = attr.base ?? 0;
      const beyonder_bonus = attr.beyonder_bonus ?? 0;
      const corruption = attr.corruption ?? 0;
      return {
        key,
        label,
        base,
        beyonder_bonus,
        corruption,
        total: base + beyonder_bonus + corruption
      };
    });
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */
  /*  Stubbed per request - wire each of these up to the real macro/logic later. */

  /**
   * @this {PlayerCharacterSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static _onShortRest(event, target) {
    console.log(`${this.actor.name}: Short Rest triggered (not yet implemented)`);
    // TODO: call the Short Rest macro, e.g. game.macros.getName("Short Rest")?.execute({actor: this.actor});
  }

  static _onLongRest(event, target) {
    console.log(`${this.actor.name}: Long Rest triggered (not yet implemented)`);
    // TODO: call the Long Rest macro.
  }

  static _onSpendLuck(event, target) {
    console.log(`${this.actor.name}: Spend Luck triggered (not yet implemented)`);
    // TODO: call the Spend Luck macro.
  }

  static _onSpendSpirituality(event, target) {
    console.log(`${this.actor.name}: Spend Spirituality triggered (not yet implemented)`);
    // TODO: call the Spend Spirituality macro.
  }

  /**
   * Open the core FilePicker to change the actor's portrait image.
   */
  static _onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.actor, attr);
    const fp = new FilePicker({
      type: "image",
      current,
      callback: path => this.actor.update({ [attr]: path })
    });
    return fp.browse();
  }
}
