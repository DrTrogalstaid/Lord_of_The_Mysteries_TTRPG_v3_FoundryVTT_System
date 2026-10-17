import LordOfTheMysteriesItemBase from "../base-item.mjs";
import { CONTAINER_TYPES, CONTAINER_UPGRADES } from "../../../helpers/inventory-config.mjs";

/**
 * Clothing or a bag: something with pockets. Gear items point at it with system.containerId.
 * Its slot count comes from its kind plus its tailoring upgrade (see inventory-config.mjs).
 */
export default class LordOfTheMysteriesContainer extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.description ??= new fields.StringField({ required: true, blank: true, initial: "" });

    // Which row of CONTAINER_TYPES this is (poor clothes, backpack, ...).
    schema.kind = new fields.StringField({ required: true, initial: "ordinary", choices: () => Object.keys(CONTAINER_TYPES) });
    // One tailoring upgrade at most -- the rules say they don't stack.
    schema.upgrade = new fields.StringField({ required: true, initial: "none", choices: () => Object.keys(CONTAINER_UPGRADES) });
    // Number of pockets, chosen by the player. Flavor only: the rules say it doesn't change item slots.
    schema.pockets = new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 2 });
    // Worn / carried right now. A suitcase left at the inn is unequipped: its contents don't count toward Strength.
    schema.equipped = new fields.BooleanField({ required: true, initial: true });

    return schema;
  }

  /** Copy the numbers for this kind (plus the upgrade) onto the Item, so everything else can just read them. */
  prepareDerivedData() {
    super.prepareDerivedData();
    const type = CONTAINER_TYPES[this.kind] ?? CONTAINER_TYPES.ordinary;
    const upgrade = CONTAINER_UPGRADES[this.upgrade] ?? CONTAINER_UPGRADES.none;

    this.category = type.category;                      // "clothing" or "bag"
    this.slots = type.slots + upgrade.slots;
    this.hiddenPockets = type.hidden + upgrade.hidden;
    this.maxSize = type.maxSize;
    this.draw = type.draw;
    this.prestige = type.prestige;
    this.combatPenalty = type.combatPenalty;
  }
}
