import { createEffectsOn, deleteEffectsOn } from "../../effects/effect-application.mjs";
import { tokensInside, zoneCopyData, zoneCopyIds } from "../../effects/effect-areas.mjs";

/**
 * The "Apply LotM Effect" region behavior (type "lotm.applyEffect"): tokens inside the Region have copies of its
 * effects, and lose them when they leave. Zones made by spells use it (effects/effect-areas.mjs), and the GM can add
 * it to any Region by hand: Region config > Behaviors > Apply LotM Effect, then drop effects (from the Effects
 * compendium, an item, ...) in its Effects box.
 *
 * Unlike Foundry's own Apply Active Effect behavior, the copies get a source (the caster), so source-based rules
 * work inside a zone: Fear's -4 counts against the caster. The source isn't affected by its own zone unless
 * "Affects its source too" is ticked.
 *
 *   effects        UUIDs of the effects handed out.
 *   source         Actor UUID: who the copies are about (the caster). Empty for zones made by hand.
 *   includeSource  The source gets the effect too when it's inside.
 *
 * Each copy's origin is this behavior, which is how they're found again when the token leaves. Copies for actors
 * the moving player doesn't own are made by the GM (effects/effect-application.mjs).
 */
export default class LotmApplyEffectBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {

  /** @override */
  static LOCALIZATION_PREFIXES = ["LORD_OF_THE_MYSTERIES.RegionBehaviors.ApplyEffect"];

  /** @override */
  static defineSchema() {
    const { BooleanField, DocumentUUIDField, SetField } = foundry.data.fields;
    return {
      effects: new SetField(new DocumentUUIDField({ type: "ActiveEffect", nullable: false })),
      source: new DocumentUUIDField({ type: "Actor", required: true, nullable: true, initial: null }),
      includeSource: new BooleanField({ required: true, initial: false }),
    };
  }

  /* -------------------------------------------- */
  /*  Events                                       */
  /* -------------------------------------------- */

  /** A token went in: give its actor the copies. Handled by the user who moved it. */
  static async #onTokenEnter(event) {
    if (!event.user.isSelf) return;
    const { token, movement } = event.data;
    const resume = movement ? token.pauseMovement?.() : undefined;
    await this.applyTo(token);
    await resume?.();
  }


  /** A token left: take the copies off its actor. */
  static async #onTokenExit(event) {
    if (!event.user.isSelf) return;
    const { token, movement } = event.data;
    const resume = movement ? token.pauseMovement?.() : undefined;
    await this.removeFrom(token);
    await resume?.();
  }


  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this.#onTokenExit,
  };


  /** The behavior was edited (other effects, another source): hand out the new copies to everyone inside. @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate?.(changed, options, userId);
    if (userId !== game.user.id || !("system" in changed) || !this.behavior?.active) return;
    this.#refreshTokensInside();
  }

  /* -------------------------------------------- */
  /*  Copies                                       */
  /* -------------------------------------------- */

  /**
   * Give a token's actor this zone's copies, unless it already has them (or it's the source and isn't included).
   * @param {TokenDocument} token
   * @returns {Promise<void>}
   */
  async applyTo(token) {
    const actor = token?.actor;
    if (!actor || !this.behavior) return;
    if (!this.includeSource && this.source && actor.uuid === this.source) return;

    // The same token can be handed its copies twice at once (it was inside when the zone was made, and Foundry
    // says it entered): only one goes ahead.
    const key = `${this.behavior.uuid}|${actor.uuid}`;
    if (LotmApplyEffectBehavior.#busy.has(key)) return;
    LotmApplyEffectBehavior.#busy.add(key);
    try {
      if (zoneCopyIds(actor, this.behavior.uuid).length) return;
      const effects = await Promise.all([...this.effects].map((uuid) => fromUuid(uuid).catch(() => null)));
      const data = zoneCopyData(effects, { source: this.source, behaviorUuid: this.behavior.uuid });
      if (data.length) await createEffectsOn(actor, data);
    } finally {
      LotmApplyEffectBehavior.#busy.delete(key);
    }
  }


  /**
   * Take this zone's copies off a token's actor.
   * @param {TokenDocument} token
   * @returns {Promise<void>}
   */
  async removeFrom(token) {
    const actor = token?.actor;
    if (!actor || !this.behavior) return;
    const ids = zoneCopyIds(actor, this.behavior.uuid);
    if (ids.length) await deleteEffectsOn(actor, ids);
  }


  /** Everyone inside the Region right now gets the copies (a zone that was just made). */
  async applyToTokensInside() {
    for (const token of this.#tokensInside()) await this.applyTo(token);
  }


  /** Copies were changed: take the old ones off everyone inside, then hand out new ones. */
  async #refreshTokensInside() {
    for (const token of this.#tokensInside()) {
      await this.removeFrom(token);
      await this.applyTo(token);
    }
  }


  /** The tokens inside the Region: Foundry's list once it has one, otherwise worked out from their centers. */
  #tokensInside() {
    const region = this.region;
    if (!region) return [];
    if (region.tokens?.size) return [...region.tokens];
    return tokensInside(region, region.parent?.tokens ?? []);
  }

  /** Actor+behavior pairs being handed copies right now. */
  static #busy = new Set();
}
