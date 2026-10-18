import LordOfTheMysteriesItemBase from "../base-item.mjs";

/**
 * Gear: anything a character carries (matches, a revolver, a sword, a charm).
 * Clothing and bags are their own type ("container"); gear points at the container it's in.
 *
 * The rules tables are read from CONFIG.LORD_OF_THE_MYSTERIES.inventory (set in lotm.mjs from
 * helpers/inventory-config.mjs) instead of being imported, so this file only imports base-item.mjs,
 * the same as sequence.mjs. Put it in the same folder as sequence.mjs and it will work.
 */
const rules = () => CONFIG.LORD_OF_THE_MYSTERIES.inventory;

export default class LordOfTheMysteriesGear extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // Keep the base Item's description if it has one.
    schema.description ??= new fields.StringField({ required: true, blank: true, initial: "" });

    // Size decides how many slots it takes and which containers it fits in (see inventory-config.mjs).
    schema.size = new fields.StringField({ required: true, initial: "smallMedium", choices: () => Object.keys(rules().ITEM_SIZES) });
    schema.quantity = new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 });

    // Where it is: "stowed" (in containerId), "held" or "worn".
    schema.carry = new fields.StringField({ required: true, initial: "stowed", choices: () => Object.keys(rules().CARRY_MODES) });
    // The id of the clothing / bag Item on the same actor. Blank = not in anything.
    schema.containerId = new fields.StringField({ required: true, blank: true, initial: "" });
    // In one of that container's hidden pockets.
    schema.hidden = new fields.BooleanField({ required: true, initial: false });
    // Magic items. Same field names as Sequences and Abilities, so the character sheet already lists
    // what these grant in the Abilities and Actions tabs (see NESTED_FIELDS in player-character-sheet.mjs).
    schema.abilities_gained = new fields.ArrayField(
      new fields.DocumentUUIDField({ type: "Item", required: true })
    );
    schema.actionList = new fields.ArrayField(
      new fields.DocumentUUIDField({ type: "Item", required: false })
    );

    return schema;
  }

  /** Room taken, in sixths of a slot (see UNITS_PER_SLOT). */
  prepareDerivedData() {
    super.prepareDerivedData();
    const sizes = rules().ITEM_SIZES;
    const size = sizes[this.size] ?? sizes.smallMedium;
    this.unitsEach = size.units;                 // one item
    this.units = size.units * this.quantity;     // the whole stack
  }
}
