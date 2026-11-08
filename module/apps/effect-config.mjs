import { effectUse, targetedTokens, useData } from "../effects/effect-application.mjs";

const { ActiveEffectConfig } = foundry.applications.sheets;

/**
 * The effect sheet: Foundry's own (Details, Duration, Changes) plus a "LotM" tab with the system's fields.
 *
 * LotM tab:
 *   Source          who the effect is about (Fear's source, the enemy Advantage is over). Set it from the token
 *                   you've targeted, or clear it.
 *   Use             only for effects on Items: Passive (lent to the owner), or handed out to Targets / Self /
 *                   Area / Zone (effects/effect-application.mjs). Shape and Size only show for Area and Zone.
 *   Status fields   only when the effect has that status: Resisted (Fear), Penalty Halved (Angry),
 *                   Internal Bleeding (Bleeding).
 *   Copied from     on a copy made from an ability a Sequence or gear grants (read-only).
 *   Also ends when  on the Duration tab, below Foundry's duration: Action Used rows (effects/action-expiry.mjs).
 *                   Drop an action or spell on the box for a new row, or on a row to change its action. A row with
 *                   no action counts the actions the effect grants (any action, if it grants none). The effect ends
 *                   at whichever comes first: the duration, or any row. (No Duration tab: the box is on the LotM tab.)
 *   Grants          what the effect gives while it's active (effects/effect-grants.mjs):
 *                     Actions          drop actions on the list (system.actionList)
 *                     Skill Increases  drop skills on the list, then set +levels and "at most" (system.skillIncreases)
 *                   Dropping or removing saves what's typed on the sheet first, then the change, so nothing is lost.
 *
 * "Use" isn't a field of its own: Passive is core's transfer, the others are system.application.mode.
 * _processFormData turns the dropdown into those two fields.
 */
export default class LotmActiveEffectConfig extends ActiveEffectConfig {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["lotm-effect-config"],
    actions: {
      sourceFromTarget: LotmActiveEffectConfig.#onSourceFromTarget,
      clearSource: LotmActiveEffectConfig.#onClearSource,
      openGrant: LotmActiveEffectConfig.#onOpenGrant,
      removeGrantedAction: LotmActiveEffectConfig.#onRemoveGrantedAction,
      removeSkillIncrease: LotmActiveEffectConfig.#onRemoveSkillIncrease,
      addExpiryEvent: LotmActiveEffectConfig.#onAddExpiryEvent,
      removeExpiryEvent: LotmActiveEffectConfig.#onRemoveExpiryEvent,
      clearExpiryAction: LotmActiveEffectConfig.#onClearExpiryAction,
    },
  };

  /**
   * The tab the "Also ends when" box is on: Foundry's Duration tab, or the LotM tab if there isn't one.
   * @type {string}
   */
  static EXPIRY_TAB = ActiveEffectConfig.PARTS?.duration ? "duration" : "lotm";

  /**
   * Foundry's parts, with "Also ends when" right after Duration, and the LotM tab added before the footer (if there
   * is one). @override
   */
  static PARTS = (() => {
    const { footer, ...parts } = ActiveEffectConfig.PARTS;
    const expiry = { template: "systems/lotm/templates/effects/effect-expiry.hbs" };
    const result = {};
    for (const [id, part] of Object.entries(parts)) {
      result[id] = part;
      if (id === "duration") result.lotmExpiry = expiry;
    }
    result.lotm = { template: "systems/lotm/templates/effects/effect-lotm.hbs" };
    if (!result.lotmExpiry) result.lotmExpiry = expiry;   // no Duration tab: at the end of the LotM tab
    if (footer) result.footer = footer;
    return result;
  })();

  /** Foundry's tabs, with LotM added at the end. @override */
  static TABS = (() => {
    const tabs = foundry.utils.deepClone(ActiveEffectConfig.TABS ?? {});
    tabs.sheet ??= { tabs: [], initial: "details" };
    tabs.sheet.tabs.push({ id: "lotm", icon: "fa-solid fa-moon", label: "LORD_OF_THE_MYSTERIES.Effects.Config.Tab" });
    return tabs;
  })();

  /* -------------------------------------------- */
  /*  Rendering                                    */
  /* -------------------------------------------- */

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "lotmExpiry") return this.#prepareExpiryContext(context);
    if (partId !== "lotm") return context;

    const effect = this.document;
    const source = effect._source.system ?? {};
    const onItem = effect.parent?.documentName === "Item";
    const use = effectUse(effect);
    const localize = (key) => game.i18n.localize(key);

    // Use: Passive only for effects on Items.
    const uses = {};
    if (onItem) uses.passive = localize("LORD_OF_THE_MYSTERIES.Effects.Use.passive");
    for (const [key, label] of Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.effectApplicationModes)) uses[key] = localize(label);

    const sourceActor = effect.sourceActor;
    const granted = source.grantedFrom ? await fromUuid(source.grantedFrom).catch(() => null) : null;
    const units = canvas?.scene?.grid?.units || game.system?.grid?.units || "";

    context.tab = context.tabs?.lotm ?? context.tab;
    context.lotm = {
      editable: this.isEditable,
      sourceUuid: source.source ?? "",
      sourceName: sourceActor?.name ?? (source.source ? localize("LORD_OF_THE_MYSTERIES.Effects.Config.SourceMissing") : ""),
      onItem,
      use,
      uses,
      isArea: use === "area" || use === "zone",
      isToggle: use === "toggle",
      upkeep: source.upkeep ?? 0,
      shape: source.application?.shape ?? "circle",
      shapes: Object.fromEntries(Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.effectAreaShapes).map(([key, label]) => [key, localize(label)])),
      size: source.application?.size ?? 1,
      sizeLabel: game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Config.Size", { units }),
      showResisted: effect.statuses.has("fear"),
      hasResisted: !!source.hasResisted,
      showHalved: effect.statuses.has("angry"),
      isPenaltyHalved: !!source.isPenaltyHalved,
      showInternal: effect.statuses.has("bleeding"),
      hasInternalBleeding: !!source.hasInternalBleeding,
      grantedFrom: source.grantedFrom ? (granted?.name ?? source.grantedFrom) : "",
      ...(await this.#prepareGrants(source)),
    };
    return context;
  }


  /**
   * The "Also ends when" box: the Action Used rows, with each one's action looked up.
   * @param {object} context
   * @returns {Promise<object>}
   */
  async #prepareExpiryContext(context) {
    const tabId = LotmActiveEffectConfig.EXPIRY_TAB;
    const source = this.document._source.system ?? {};
    const anyLabel = game.i18n.localize((source.actionList ?? []).length
      ? "LORD_OF_THE_MYSTERIES.Effects.Expiry.AnyGranted"
      : "LORD_OF_THE_MYSTERIES.Effects.Expiry.AnyAction");
    const missing = game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing");

    const rows = await Promise.all((source.expiryEvents ?? []).map(async (row, index) => {
      const doc = row.actionUuid ? await fromUuid(row.actionUuid).catch(() => null) : null;
      return {
        index,
        type: row.type ?? "actionUsed",
        actionUuid: row.actionUuid ?? "",
        hasAction: !!row.actionUuid,
        name: row.actionUuid ? (doc?.name ?? missing) : anyLabel,
        img: row.actionUuid ? (doc?.img ?? "icons/svg/hazard.svg") : "icons/svg/d20-grey.svg",
        broken: !!row.actionUuid && !doc,
        uses: row.uses ?? 1,
        used: row.used ?? 0,
      };
    }));

    context.tab = context.tabs?.[tabId] ?? context.tab;
    context.lotmExpiry = { editable: this.isEditable, tabId, rows };
    return context;
  }


  /**
   * The Grants lists: the granted actions, and the skill increases with their "at most" dropdowns.
   * Items that no longer exist are shown as missing, so they can still be removed.
   * @param {object} source   The effect's saved system data.
   * @returns {Promise<{grantedActions: object[], skillIncreases: object[], maxLevelOptions: Record<string, string>}>}
   */
  async #prepareGrants(source) {
    const missing = game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing");
    const look = async (uuid) => {
      const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
      return doc
        ? { uuid, name: doc.name, img: doc.img, broken: false }
        : { uuid, name: missing, img: "icons/svg/hazard.svg", broken: true };
    };

    const grantedActions = await Promise.all((source.actionList ?? []).map(async (uuid, index) => ({
      ...(await look(uuid)), index,
    })));
    const skillIncreases = await Promise.all((source.skillIncreases ?? []).map(async (row, index) => ({
      ...(await look(row.skillUuid)), index, value: row.value ?? 1, maxLevel: row.maxLevel ?? "",
    })));

    const maxLevelOptions = { "": game.i18n.localize("LORD_OF_THE_MYSTERIES.Effects.Config.Grants.NoLimit") };
    for (const [key, label] of Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels)) {
      maxLevelOptions[key] = game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Config.Grants.AtMost", {
        level: game.i18n.localize(label),
      });
    }
    return { grantedActions, skillIncreases, maxLevelOptions };
  }


  /** Show Shape and Size only while Use is Area or Zone, and the per-round cost only while it's Toggle. @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const select = this.element.querySelector("select[name=lotmUse]");
    const area = this.element.querySelector("[data-lotm-area-fields]");
    const toggle = this.element.querySelector("[data-lotm-toggle-fields]");
    select?.addEventListener("change", () => {
      if (area) area.hidden = !["area", "zone"].includes(select.value);
      if (toggle) toggle.hidden = select.value !== "toggle";
    });
    this.#bindGrantZones();
    this.#bindExpiryZone();
  }


  /**
   * Make the "Also ends when" box accept dropped actions and spells: on a row = that row's action, anywhere else in
   * the box = a new row for it.
   */
  #bindExpiryZone() {
    if (!this.isEditable) return;
    const zone = this.element.querySelector("[data-lotm-expiry-zone]");
    if (!zone) return;
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", (event) => {
      if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.remove("drag-over");

      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (data?.type !== "Item" || !data.uuid) return;
      const doc = await fromUuid(data.uuid).catch(() => null);
      if (!doc) return;
      if (!["action", "spell"].includes(doc.type)) {
        ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Expiry.NotAnAction", { name: doc.name }));
        return;
      }

      const rows = this.#currentRows("expiryEvents", ["actionUuid", "uses", "used"]);
      const index = Number(event.target.closest("[data-expiry-index]")?.dataset.expiryIndex);
      if (Number.isInteger(index) && rows[index]) rows[index].actionUuid = doc.uuid;
      else rows.push({ type: "actionUsed", actionUuid: doc.uuid, uses: 1, used: 0 });
      await this.#saveWith({ "system.expiryEvents": rows });
    });
  }


  /** Make the Grants lists ([data-lotm-grant-zone="actions" | "skills"]) accept dropped Items. */
  #bindGrantZones() {
    if (!this.isEditable) return;
    for (const zone of this.element.querySelectorAll("[data-lotm-grant-zone]")) {
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();               // without this the browser never fires "drop"
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", (event) => {
        if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", (event) => this.#onDropGrant(event, zone));
    }
  }


  /**
   * An Item was dropped on a Grants list: an action on Actions, a skill on Skill Increases.
   * The same action or skill isn't added twice.
   * @param {DragEvent} event
   * @param {HTMLElement} zone
   */
  async #onDropGrant(event, zone) {
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove("drag-over");

    const kind = zone.dataset.lotmGrantZone;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item" || !data.uuid) return;
    const doc = await fromUuid(data.uuid).catch(() => null);
    if (!doc) return;

    const wanted = kind === "actions" ? "action" : "skill";
    if (doc.type !== wanted) {
      ui.notifications.warn(game.i18n.format(`LORD_OF_THE_MYSTERIES.Effects.Config.Grants.${kind === "actions" ? "NotAnAction" : "NotASkill"}`, { name: doc.name }));
      return;
    }

    const source = this.document._source.system ?? {};
    if (kind === "actions") {
      const list = [...(source.actionList ?? [])];
      if (list.includes(doc.uuid)) return;
      await this.#saveWith({ "system.actionList": [...list, doc.uuid] });
    } else {
      const rows = this.#currentSkillRows();
      if (rows.some((row) => row.skillUuid === doc.uuid)) return;
      await this.#saveWith({ "system.skillIncreases": [...rows, { skillUuid: doc.uuid, value: 1, maxLevel: "" }] });
    }
  }


  /**
   * The skill increase rows as they are on the sheet right now (typed but unsaved values included).
   * @returns {{skillUuid: string, value: number, maxLevel: string}[]}
   */
  #currentSkillRows() {
    return this.#currentRows("skillIncreases", ["value", "maxLevel"]);
  }


  /**
   * A list of rows in system data as it is on the sheet right now: the saved rows, with whatever is typed in their
   * inputs (named system.<field>.<index>.<key>). Number inputs are read as whole numbers of 0 or more.
   * @param {string} field   e.g. "skillIncreases"
   * @param {string[]} keys  The row keys that have inputs.
   * @returns {object[]}
   */
  #currentRows(field, keys) {
    const saved = foundry.utils.deepClone(this.document._source.system?.[field] ?? []);
    for (const [index, row] of saved.entries()) {
      for (const key of keys) {
        const input = this.element.querySelector(`[name="system.${field}.${index}.${key}"]`);
        if (!input || input.value === "") continue;
        row[key] = input.type === "number" ? Math.max(0, Math.round(Number(input.value)) || 0) : input.value;
        if (key === "uses") row.uses = Math.max(1, row.uses);   // an Action Used row lasts at least 1 use
      }
    }
    return saved;
  }


  /**
   * Save what's typed on the sheet together with a change, so a drop or a remove doesn't throw away edits that
   * weren't saved yet (this sheet saves with its Save button, not on every change).
   * @param {object} changes   e.g. { "system.actionList": [...] }
   */
  async #saveWith(changes) {
    let data = {};
    try {
      const form = this.form ?? this.element.querySelector("form") ?? this.element;
      const formData = new foundry.applications.ux.FormDataExtended(form);
      data = this._prepareSubmitData(null, form, formData) ?? {};
    } catch (error) {
      // A field that doesn't validate yet: save just the change, the rest stays typed on the sheet.
      console.warn("lotm | Couldn't save the effect sheet's other fields with this change", error);
      data = {};
    }
    data = foundry.utils.mergeObject(foundry.utils.expandObject(data), foundry.utils.expandObject(changes), { inplace: false });
    await this.document.update(data);
  }

  /* -------------------------------------------- */
  /*  Saving                                       */
  /* -------------------------------------------- */

  /**
   * The Use dropdown becomes transfer and system.application.mode (only when it was changed, so ticking Foundry's
   * own Transfer box on the Details tab still works). An empty Source is saved as none.
   * @override
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);

    const use = data.lotmUse;
    delete data.lotmUse;
    if (use && use !== effectUse(this.document)) {
      for (const [path, value] of Object.entries(useData(use))) foundry.utils.setProperty(data, path, value);
    }

    if (data.system && ("source" in data.system) && !data.system.source) data.system.source = null;
    return data;
  }

  /* -------------------------------------------- */
  /*  Buttons                                      */
  /* -------------------------------------------- */

  /**
   * Put a value in the Source field and its name next to it, then let the form save as it normally would.
   * @param {string} uuid
   * @param {string} name
   */
  #setSource(uuid, name) {
    const input = this.element.querySelector("input[name='system.source']");
    const label = this.element.querySelector("[data-lotm-source-name]");
    if (!input) return;
    input.value = uuid;
    if (label) label.textContent = name || game.i18n.localize("LORD_OF_THE_MYSTERIES.Effects.Config.NoSource");
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }


  /** Source: the token you have targeted (exactly one). */
  static #onSourceFromTarget(event, target) {
    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Effects.Config.TargetOne"));
      return;
    }
    this.#setSource(targets[0].actor.uuid, targets[0].name);
  }


  /** Source: none. */
  static #onClearSource(event, target) {
    this.#setSource("", "");
  }


  /** Click a granted action's or skill's name: open its sheet. */
  static async #onOpenGrant(event, target) {
    const doc = await fromUuid(target.dataset.uuid).catch(() => null);
    doc?.sheet?.render({ force: true });
  }


  /** The trash can on a granted action (data-index = its place in system.actionList). */
  static async #onRemoveGrantedAction(event, target) {
    if (!this.isEditable) return;
    const index = Number(target.dataset.index);
    const list = [...(this.document._source.system?.actionList ?? [])];
    if (!Number.isInteger(index) || index < 0 || index >= list.length) return;
    list.splice(index, 1);
    await this.#saveWith({ "system.actionList": list });
  }


  /** "Add: Action Used": a new row counting the effect's granted actions (or any action), 1 use. */
  static async #onAddExpiryEvent(event, target) {
    if (!this.isEditable) return;
    const rows = this.#currentRows("expiryEvents", ["actionUuid", "uses", "used"]);
    rows.push({ type: "actionUsed", actionUuid: "", uses: 1, used: 0 });
    await this.#saveWith({ "system.expiryEvents": rows });
  }


  /** The trash can on an "Also ends when" row (data-index = its place in system.expiryEvents). */
  static async #onRemoveExpiryEvent(event, target) {
    if (!this.isEditable) return;
    const index = Number(target.dataset.index);
    const rows = this.#currentRows("expiryEvents", ["actionUuid", "uses", "used"]);
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) return;
    rows.splice(index, 1);
    await this.#saveWith({ "system.expiryEvents": rows });
  }


  /** The X on a row's action: back to counting the effect's granted actions (or any action). */
  static async #onClearExpiryAction(event, target) {
    if (!this.isEditable) return;
    const index = Number(target.dataset.index);
    const rows = this.#currentRows("expiryEvents", ["actionUuid", "uses", "used"]);
    if (!rows[index]) return;
    rows[index].actionUuid = "";
    await this.#saveWith({ "system.expiryEvents": rows });
  }


  /** The trash can on a skill increase (data-index = its place in system.skillIncreases). */
  static async #onRemoveSkillIncrease(event, target) {
    if (!this.isEditable) return;
    const index = Number(target.dataset.index);
    const rows = this.#currentSkillRows();
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) return;
    rows.splice(index, 1);
    await this.#saveWith({ "system.skillIncreases": rows });
  }
}
