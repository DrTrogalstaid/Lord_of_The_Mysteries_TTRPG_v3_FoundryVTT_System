import { statusRule, withImpliedStatuses } from "../effects/status-effects.mjs";
import { effectUse } from "../effects/effect-application.mjs";
import { deleteZoneRegion } from "../effects/effect-areas.mjs";

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
 * Effects on Items (spells, actions, abilities, gear): each is either passive (lent to the Item's owner) or handed
 * out when the Item is used (effects/effect-application.mjs). Two things are filled in when an effect is created:
 *   - on an Item: its origin is that Item, so copies handed out from it remember where they came from
 *   - on an actor, with no source yet: the source is whoever owns the Item it came from. Dragging Terrify's effect
 *     from Klein's spell onto a goblin's token makes Klein the one the goblin fears.
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
   * How this effect is used: "passive" (an Item lends it to its owner) or how it's handed out: "targets", "self",
   * "area" or "zone" (effects/effect-application.mjs).
   * @type {string}
   */
  get use() {
    return effectUse(this);
  }


  /** Lent to the owner of the Item it's on (core's transfer), rather than handed out when the Item is used. */
  get isPassive() {
    return this.use === "passive";
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
  /*  Origin and source                            */
  /* -------------------------------------------- */

  /**
   * Fill in where the effect came from, and who it's about, when that can be told:
   *   - on an Item: origin = the Item
   *   - on an actor, with no source: source = the owner of its origin Item, when that's another actor
   * @override
   */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const parent = this.parent;

    if (parent?.documentName === "Item" && !this.origin) {
      this.updateSource({ origin: parent.uuid });
    }

    if (parent?.documentName === "Actor" && !this.system?.source && this.origin) {
      const owner = originOwner(this.origin);
      if (owner && owner.uuid !== parent.uuid) this.updateSource({ "system.source": owner.uuid });
    }
  }

  /* -------------------------------------------- */
  /*  Linked effects for implied statuses          */
  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    // Only the user who made the change does these, so they don't happen once per player.
    if (userId !== game.user.id) return;
    this.#syncImpliedEffects();
    // Each status's own step when it's put on an actor (Bloodbath starts Bleeding).
    if (this.parent?.documentName === "Actor") {
      for (const id of this.statuses) statusRule(id)?.onApplied(this);
    }
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
    // A zone's marker: the zone goes with it (effects/effect-areas.mjs).
    if (this.system?.zone) deleteZoneRegion(this.system.zone);
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


/**
 * The actor who owns the document an origin UUID points to: the actor itself, or the owner of an Item.
 * null when it can't be found right away, or nobody owns it (a world or compendium Item).
 * @param {string} uuid
 * @returns {Actor|null}
 */
function originOwner(uuid) {
  let doc = null;
  try {
    doc = fromUuidSync(uuid, { strict: false });
  } catch {
    return null;
  }
  if (!doc) return null;
  if (doc.documentName === "Actor") return doc;
  return doc.actor ?? null;
}
