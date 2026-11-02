import LordOfTheMysteriesActorBase from "./base-actor.mjs";

/**
 * NPC data.
 *
 * Everything an NPC has for the rules (attributes, resources, defenses, skills, Sequences, armor) comes from
 * LordOfTheMysteriesActorBase and is worked out exactly like a player character's, in its prepareDerivedData().
 * This class doesn't replace prepareDerivedData, so that all runs for NPCs too.
 *
 * What's different for NPCs:
 *   organization   Who the NPC belongs to, shown in the sheet header.
 *   hiddenGrants   Granted abilities, actions, spells and Sequence skill raises the GM hid on this NPC, without
 *                  changing the Item that grants them. Each entry is a hide key (see _prepareSections in
 *                  sheets/base-actor-sheet.mjs): the granted Item's uuid, or "<gear item id>#<action uuid>"
 *                  for an action on one piece of gear.
 *   No Agility penalty for carrying too much (_carryingAgilityPenalty below). Worn armor's penalty still applies.
 *
 * Notes are kept in `biography` (from the base schema).
 */
export default class LordOfTheMysteriesNPC extends LordOfTheMysteriesActorBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.organization = new fields.StringField({ required: true, blank: true });
    schema.hiddenGrants = new fields.ArrayField(
      new fields.StringField({ required: true, blank: false })
    );

    return schema;
  }

  /**
   * NPCs don't lose Agility for carrying more than their Strength allows, so the GM can give them any gear.
   * @override
   */
  _carryingAgilityPenalty() {
    return 0;
  }
}
