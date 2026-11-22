import LordOfTheMysteriesActorBase from "./base-actor.mjs";
import { OVERRIDABLE_STATS, applyStatOverrides } from "../../helpers/stat-overrides.mjs";

/**
 * NPC data.
 *
 * Everything an NPC has for the rules (attributes, resources, defenses, skills, Sequences, armor) comes from
 * LordOfTheMysteriesActorBase and is worked out exactly like a player character's, in its prepareDerivedData().
 * This class runs all of that first, then puts the GM's stat overrides on top (prepareDerivedData below).
 *
 * What's different for NPCs:
 *   organization   Who the NPC belongs to, shown in the sheet header.
 *   hiddenGrants   Granted abilities, actions, spells and Sequence skill raises the GM hid on this NPC, without
 *                  changing the Item that grants them. Each entry is a hide key (see _prepareSections in
 *                  sheets/base-actor-sheet.mjs): the granted Item's uuid, or "<gear item id>#<action uuid>"
 *                  for an action on one piece of gear.
 *   statOverrides  Numbers the GM typed over the sidebar's worked-out stats (Health / Sanity / Spirituality / Luck
 *                  maximums, the three defenses, Movement), one per stat (helpers/stat-overrides.mjs). null = use the
 *                  calculated number. An Active Effect can set one too: system.statOverrides.movement  Override  60.
 *   No Agility penalty for carrying too much (_carryingAgilityPenalty below). Worn armor's penalty still applies.
 *   Only the skills the GM drops on them, not every standard skill (_includesStandardSkills below).
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

    schema.statOverrides = new fields.SchemaField(Object.fromEntries(OVERRIDABLE_STATS.map(({ key }) => [
      key,
      new fields.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
    ])));

    return schema;
  }

  /**
   * Everything the base class works out, then the GM's stat overrides, last, so they replace the finished numbers.
   * @override
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    // Display only, not in the schema: per stat, the calculated number, the override and the number now, for the
    // sidebar's boxes (see applyStatOverrides).
    this.overridableStats = applyStatOverrides(this, this.statOverrides, this.statusChanges);
  }

  /**
   * NPCs only have the skills the GM drops on them (and any a Sequence or effect gives), not every standard skill.
   * @override
   */
  _includesStandardSkills() {
    return false;
  }

  /**
   * NPCs don't lose Agility for carrying more than their Strength allows, so the GM can give them any gear.
   * @override
   */
  _carryingAgilityPenalty() {
    return 0;
  }
}
