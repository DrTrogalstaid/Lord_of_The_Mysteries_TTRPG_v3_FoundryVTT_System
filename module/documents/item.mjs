import { GRANT_TRIGGER_TYPES, syncGrantedEffects } from "../effects/granted-effects.mjs";

/**
 * The system's Item: keeps copied effects pointing at their Item, keeps granted-ability effects in step, and posts
 * an Item to chat from a hotbar macro.
 * @extends {Item}
 */
export class LordOfTheMysteriesItem extends Item {
  /**
   * A copied Item (dropped on a character, duplicated, imported from a compendium) brings its effects along, still
   * naming the Item they were copied from as their origin. Point them at this Item, so effects handed out from it
   * know whose they are (documents/active-effect.mjs fills in their source from that).
   * Then, for a Sequence, gear or ability on an actor: update the copies of granted abilities' passive effects
   * (effects/granted-effects.mjs). Only the user who created the Item does this.
   * @override
   */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (userId !== game.user.id) return;
    const updates = this.effects
      .filter((effect) => effect.origin !== this.uuid)
      .map((effect) => ({ _id: effect.id, origin: this.uuid }));
    const fixOrigins = updates.length ? this.updateEmbeddedDocuments("ActiveEffect", updates) : Promise.resolve();
    if (this.#grantsMatter()) fixOrigins.then(() => syncGrantedEffects(this.actor));
  }


  /**
   * A Sequence or gear's granted abilities changed, or an owned ability was renamed: update the copies of granted
   * abilities' passive effects.
   * @override
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id || !this.#grantsMatter()) return;
    if (changed.system?.abilities_gained !== undefined || ("name" in changed)) syncGrantedEffects(this.actor);
  }


  /**
   * A Sequence, gear or ability left the actor: another Item may now be the one granting an ability, or an ability
   * the actor owned is now only granted. Update the copies.
   * @override
   */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (userId !== game.user.id || !this.#grantsMatter()) return;
    syncGrantedEffects(this.actor);
  }


  /** An owned Sequence, gear or ability: one whose changes can change the granted-ability copies. */
  #grantsMatter() {
    return this.parent?.documentName === "Actor" && GRANT_TRIGGER_TYPES.includes(this.type);
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Convert the actor document to a plain object.
   *
   * The built in `toObject()` method will ignore derived data when using Data Models.
   * This additional method will instead use the spread operator to return a simplified
   * version of the data.
   *
   * @returns {object} Plain object either via deepClone or the spread operator.
   */
  toPlainObject() {
    const result = { ...this };

    // Simplify system data.
    result.system = this.system.toPlainObject();

    // Add effects.
    result.effects = this.effects?.size > 0 ? this.effects.contents : [];

    return result;
  }

  /**
   * Post the Item's description to chat (a hotbar macro for anything but an action or spell, which roll their attack
   * instead: rollItemMacro in lotm.mjs).
   */
  async roll() {
    // Who sees it: what the chat sidebar is set to (Foundry v14's "messageMode"; "rollMode" is deprecated).
    const messageMode = game.settings.get('core', 'messageMode');
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `[${this.type}] ${this.name}`,
      content: this.system.description ?? '',
    }, { messageMode });
  }
}
