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
    },
  };

  /** Foundry's parts, with the LotM tab added before the footer (if there is one). @override */
  static PARTS = (() => {
    const { footer, ...parts } = ActiveEffectConfig.PARTS;
    return {
      ...parts,
      lotm: { template: "systems/lotm/templates/effects/effect-lotm.hbs" },
      ...(footer ? { footer } : {}),
    };
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
    };
    return context;
  }


  /** Show Shape and Size only while Use is Area or Zone. @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const select = this.element.querySelector("select[name=lotmUse]");
    const area = this.element.querySelector("[data-lotm-area-fields]");
    if (select && area) {
      select.addEventListener("change", () => {
        area.hidden = !["area", "zone"].includes(select.value);
      });
    }
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
}
