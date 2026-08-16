/**
 * Player Character sheet.
 **/

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;


export class PlayerCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {


  /** @override */
  static DEFAULT_OPTIONS = {

    tag: "form",
    classes: ["lotm", "sheet", "actor", "player-character"],
    actions: {
      shortRest: PlayerCharacterSheet._onShortRest,
      longRest: PlayerCharacterSheet._onLongRest,
      spendLuck: PlayerCharacterSheet._onSpendLuck,
      spendSpirituality: PlayerCharacterSheet._onSpendSpirituality,
      editImage: PlayerCharacterSheet._onEditImage
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 850,
      height: 830
    },
    window: {
      resizable: true,
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.PlayerCharacter"
    }
  };

  /** @override */
  /** Pieces of the sheet that can be viewed and reloaded independently */
  static PARTS = {
    header:    { template: "systems/lotm/templates/actor/player-character/parts/header.hbs" },
    sidebar:   { template: "systems/lotm/templates/actor/player-character/parts/sidebar.hbs" },
    tabs:      { template: "systems/lotm/templates/actor/player-character/parts/tab-nav.hbs" },  // Doubles as the "Character Info" box header / page-selector shown in the mockup.
    character: { template: "systems/lotm/templates/actor/player-character/character.hbs", scrollable: [""] },
    biography: { template: "systems/lotm/templates/actor/player-character/parts/biography.hbs", scrollable: [""] }
  };

  /** @override */
  static TABS = {
    
    // The "Character Info" box's page selector (Character Info,Biography, etc.).
    sheet: {
      tabs: [
        { id: "character", label: "LORD_OF_THE_MYSTERIES.Tabs.Character" },
        { id: "biography", label: "LORD_OF_THE_MYSTERIES.Tabs.Biography" }
      ],
      initial: "character"
    },

    skills: {
      tabs: [
        { id: "str", label: "LORD_OF_THE_MYSTERIES.Attributes.Str.long" },
        { id: "agi", label: "LORD_OF_THE_MYSTERIES.Attributes.Agi.long" },
        { id: "cha", label: "LORD_OF_THE_MYSTERIES.Attributes.Cha.long" },
        { id: "ins", label: "LORD_OF_THE_MYSTERIES.Attributes.Ins.long" },
        { id: "edu", label: "LORD_OF_THE_MYSTERIES.Attributes.Edu.long" },
      ],
      initial: "str"
    }
  };

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  /** Creates Basic Datamodel, which is used to fill the HTML together with Handlbars with Data */
  async _prepareContext(options) {
    
    const context = await super._prepareContext(options);
    
    context.actor = this.actor;
    context.system = this.actor.system;
    context.source = this.actor.toObject().system;

    // Two independent tab groups: the "Character Info","Biography", etc. page selector,
    // and the nested skills sub-tabs.
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
        context.skillsByCategory = await this._prepareSkillList();
        context.skillLevelOptions = CONFIG.LORD_OF_THE_MYSTERIES.skillLevels;
        break;

      case "biography":
        context.tab = context.tabs.biography;
        // Single journal-style field for now (system.biography is a plain StringField).
        // Swap/extend this once the full Biography page layout is designed.
        context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
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
   * for easy iteration in the template. 
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

  /**
   * Build the full, per-category skill list shown on the sheet, sourced directly from the
   * skills_compendium pack's folder structure - NOT from whatever the actor happens to have
   * stored. Each tab (str/agi/cha/ins/edu/...) corresponds to a Folder of the same name inside
   * the compendium (see CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders); every Item in that
   * folder is listed, so the full compendium roster shows up automatically instead of needing to
   * be dragged on one at a time.
   *
   * Folder#contents on a compendium-housed Folder returns index entries (not full Documents) -
   * {_id, uuid, name, img, type, sort, folder} - so this never needs to fromUuid() each skill
   * individually, only pack.getIndex() once up front.
   *
   * If the actor already has a stored level for a given skill (matched by uuid), that level is
   * used; otherwise it defaults to "untrained" for display. Nothing is written to the actor here -
   * persistence happens the normal way, the first time the player changes a level (see the hidden
   * `skill` uuid input paired with each level <select> in character.hbs): the whole category's
   * array (all currently-rendered rows, in this same order) is submitted and saved together.
   * @returns {Promise<Record<string, {uuid: string, name: string, img: string, level: string}[]>>}
   */
  async _prepareSkillList() {
    const pack = game.packs.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
    const skillsByCategory = {};

    if (!pack) {
      console.warn(`Lord of the Mysteries | Skills compendium "${CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId}" not found.`);
      return skillsByCategory;
    }

    await pack.getIndex(); // ensures the index - and therefore each Folder's .contents - is populated

    for (const [category, folderName] of Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders)) {
      const folder = pack.folders.getName(folderName);
      if (!folder) {
        console.warn(`Lord of the Mysteries | No "${folderName}" folder found in the skills compendium (category: ${category}).`);
      }
      const indexEntries = folder?.contents ?? [];

      // Preserve whatever level the actor already has recorded for a skill, matched by uuid.
      // Anything not yet touched simply defaults to "untrained" for display.
      const stored = this.actor.system.skills[category] ?? [];
      const levelByUuid = new Map(stored.map(entry => [entry.skill, entry.level]));

      skillsByCategory[category] = indexEntries
        .map(entry => ({
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img,
          level: levelByUuid.get(entry.uuid) ?? "untrained"
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return skillsByCategory;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

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
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: path => this.actor.update({ [attr]: path })
    });
    return fp.browse();
  }
}
