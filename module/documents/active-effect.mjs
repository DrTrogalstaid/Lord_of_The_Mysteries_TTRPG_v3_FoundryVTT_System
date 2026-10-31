import { statusRule, withImpliedStatuses } from "../effects/status-effects.mjs";

/**
 * The system's Active Effect document. Statuses (Bound, Fear, ...), spell effects and the effects Items lend their
 * owner are all Active Effects. What each status does is in its StatusRule (effects/status-rule.mjs); this class
 * connects an effect to those rules.
 *
 * Implied statuses: a status can bring others with it (Helpless brings Bound, see `implies` in
 * effects/status-effects.mjs). Foundry draws one token icon per effect, so each implied status gets its own
 * linked effect on the actor, with system.impliedBy set to the effect that brought it:
 *   - created when that effect is created (or gets the status later)
 *   - turned off and on with it, and removed with it (also when it runs out)
 *   - can't be removed on its own while that effect is still there
 * Only effects on an actor get linked effects. An effect an Item lends its owner doesn't; its implied statuses
 * still count for the rules (activeStatusIds), they just have no icon of their own.
 *
 * The effect's own data (system.source, system.impliedBy, ...) is described in data/effect/effect.mjs.
 * @extends {ActiveEffect}
 */
export class LordOfTheMysteriesActiveEffect extends ActiveEffect {

  /**
   * The rules of this effect's statuses, including the statuses they imply (Helpless adds Bound).
   * Statuses the system doesn't know (another module's) are left out.
   * @type {import("../effects/status-rule.mjs").default[]}
   */
  get statusRules() {
    return [...withImpliedStatuses(new Set(this.statuses))].map(statusRule).filter(Boolean);
  }


  /**
   * The actor this effect is about: the source of Fear or Anger, or the enemy you have Advantage over.
   * null when the effect has no source (toggled from the Token HUD, or a Scene Region's effect).
   * @type {Actor|null}
   */
  get sourceActor() {
    const uuid = this.system?.source;
    return uuid ? (fromUuidSync(uuid) ?? null) : null;
  }


  /**
   * The effect that brought this one with it (the Helpless a Bound came with), or null.
   * @type {ActiveEffect|null}
   */
  get impliedByEffect() {
    const id = this.system?.impliedBy;
    return id ? (this.parent?.effects?.get(id) ?? null) : null;
  }


  /**
   * Gear only lends its effects (its own, and the ones copied from abilities it grants) while it's held or worn.
   * Stowed in a coat or bag, they stop applying until it's taken out again; the effects stay on the gear.
   * @override
   */
  get isSuppressed() {
    const item = this.parent;
    if (item?.documentName === "Item" && item.type === "gear" && item.system.carry === "stowed") return true;
    return super.isSuppressed;
  }

  /* -------------------------------------------- */
  /*  Linked effects for implied statuses          */
  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    // Only the user who made the change creates the linked effects, so they aren't made once per player.
    if (userId === game.user.id) this.#syncImpliedEffects();
  }


  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id) return;
    if (("statuses" in changed) || ("disabled" in changed)) this.#syncImpliedEffects();
  }


  /** @override */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (userId !== game.user.id) return;
    // This effect is gone: remove the effects it brought with it.
    const ids = this.#impliedEffects().map((effect) => effect.id);
    if (ids.length) this.parent.deleteEmbeddedDocuments("ActiveEffect", ids, { lotmImpliedBy: this.id });
  }


  /**
   * A linked effect can't be removed on its own while the effect that brought it is still there
   * (clicking Bound on a Helpless creature): remove Helpless instead.
   * @override
   */
  async _preDelete(options, user) {
    if ((await super._preDelete(options, user)) === false) return false;
    const parentId = this.system?.impliedBy;
    if (!parentId || options.lotmImpliedBy === parentId) return;

    const bringer = this.impliedByEffect;
    // Gone already, or being deleted in the same go: nothing to protect.
    if (!bringer || options.ids?.includes?.(parentId)) return;

    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.ImpliedLocked", {
      name: this.name, parent: bringer.name,
    }));
    return false;
  }


  /**
   * This effect's linked effects: the ones on the same actor whose impliedBy is this effect.
   * @returns {ActiveEffect[]}
   */
  #impliedEffects() {
    const actor = this.parent;
    if (actor?.documentName !== "Actor") return [];
    return actor.effects.filter((effect) => effect.system?.impliedBy === this.id);
  }


  /**
   * Make this effect's linked effects match its statuses: one per implied status it doesn't have itself,
   * turned off when it is. Extra ones (a status was taken off it) are removed.
   * @returns {Promise<void>}
   */
  async #syncImpliedEffects() {
    const actor = this.parent;
    if (actor?.documentName !== "Actor") return;

    // The statuses this effect brings that it doesn't have itself: Helpless -> Bound.
    const wanted = new Set();
    for (const id of this.statuses) {
      for (const extra of statusRule(id)?.implies ?? []) {
        if (!this.statuses.has(extra)) wanted.add(extra);
      }
    }

    const linked = this.#impliedEffects();
    const extra = linked.filter((effect) => ![...effect.statuses].some((id) => wanted.has(id)));
    const kept = linked.filter((effect) => !extra.includes(effect));
    const have = new Set(kept.flatMap((effect) => [...effect.statuses]));

    const toUpdate = kept
      .filter((effect) => effect.disabled !== this.disabled)
      .map((effect) => ({ _id: effect.id, disabled: this.disabled }));
    const toCreate = [...wanted]
      .filter((id) => !have.has(id) && statusRule(id))
      .map((id) => statusRule(id).toEffectData({ impliedBy: this.id }, { disabled: this.disabled }));

    if (extra.length) await actor.deleteEmbeddedDocuments("ActiveEffect", extra.map((effect) => effect.id), { lotmImpliedBy: this.id });
    if (toUpdate.length) await actor.updateEmbeddedDocuments("ActiveEffect", toUpdate);
    if (toCreate.length) await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
  }
}
