import { GRANT_TRIGGER_TYPES, syncGrantedEffects } from "../effects/granted-effects.mjs";

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class LordOfTheMysteriesItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

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
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    // Who sees it: what the chat sidebar is set to (Foundry v14's "messageMode"; "rollMode" is deprecated).
    const messageMode = game.settings.get('core', 'messageMode');
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        flavor: label,
        content: item.system.description ?? '',
      }, { messageMode });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData.actor);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        flavor: label,
      }, { messageMode });
      return roll;
    }
  }
}
