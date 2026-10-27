import LordOfTheMysteriesItemBase from "../base-item.mjs";

/**
 * Gear: anything a character carries (matches, a revolver, a sword, a charm, a suit of armor).
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

    // Armor. "none" for everything that isn't armor. Its numbers come from ARMOR_TYPES (inventory-config.mjs),
    // the same way a container's slots come from CONTAINER_TYPES. It protects while carry is "worn".
    schema.armorKind = new fields.StringField({ required: true, initial: "none", choices: () => Object.keys(rules().ARMOR_TYPES) });
    // Damage the armor itself has taken. Kept on the Item, so it stays with the armor when it's taken off or handed over.
    schema.armorState = new fields.SchemaField({
      // Hits of fire damage taken (cotton / leather is destroyed at its fireLimit).
      fireHits: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      // 0 intact, 1 penetrated, 2 broken (see ARMOR_BREACH).
      breach: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 2, initial: 0 }),
      // Wound expansion steps (one per 10 effective damage). Each lowers the critical-strike penalty against the gap by 2.
      expansion: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Room taken, in sixths of a slot (see UNITS_PER_SLOT).
    const sizes = rules().ITEM_SIZES;
    const size = sizes[this.size] ?? sizes.smallMedium;
    this.unitsEach = size.units;                 // one item
    this.units = size.units * this.quantity;     // the whole stack

    this._prepareArmor();
  }

  /** Copy this armor kind's numbers onto the Item, so the inventory math and sheets can just read them. */
  _prepareArmor() {
    const types = rules().ARMOR_TYPES;
    const type = types[this.armorKind] ?? types.none;
    const damageTypes = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes;

    this.isArmor = type !== types.none;
    this.armorValue = type.armor;
    // { physical: 5, fire: 5 } for the math, and a list with labels for the sheets.
    this.reduction = Object.fromEntries(type.reduces.map((damageType) => [damageType, type.reduction]));
    this.reductionList = type.reduces.map((damageType) => ({
      damageType,
      label: damageTypes[damageType] ?? damageType,
      value: type.reduction,
    }));
    this.agilityPenalty = type.agility;
    this.strengthNeeds = {
      halfMove: type.halfMoveBelow,
      immobile: type.immobileBelow,
      cannotWear: type.cannotWearBelow,
    };
    this.unprotected = [...type.unprotected];
    this.fireLimit = type.fireLimit;
    this.destroyed = type.fireLimit !== null && this.armorState.fireHits >= type.fireLimit;
    this.critPenaltyReduction = this.armorState.expansion * 2;
  }
}
