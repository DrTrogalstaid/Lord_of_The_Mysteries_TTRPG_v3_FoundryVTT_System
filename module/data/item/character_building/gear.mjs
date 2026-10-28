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
    // What one of these is worth, in Loen pennies (£1 = 240). Typed and shown as £/s/d; see helpers/currency.mjs.
    schema.value = new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 });

    // Purses and wallets carry the character's cash: one balance per currency, in that currency's
    // smallest coin ({ loen: 1250 } = £5 4s 2d). Kept on the Item, so a looted wallet keeps its money.
    schema.isPurse = new fields.BooleanField({ required: true, initial: false });
    schema.money = new fields.TypedObjectField(
      new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
    );

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

    // ---- Firearms ----
    // One round inside a gun. It remembers what it is (name, image) and which ammo Item it came out of,
    // so a silver bullet stays a silver bullet, and unloading puts it back in the right box.
    // (A function, so the magazine and the chamber each get their own copy of these fields.)
    const roundFields = () => ({
      name: new fields.StringField({ required: true, blank: true, initial: "" }),
      img: new fields.StringField({ required: true, blank: true, initial: "" }),
      ammoId: new fields.StringField({ required: true, blank: true, initial: "" }),
    });

    // A gun. The rounds are stored on the gun itself, so a dropped or looted gun is still loaded.
    // All the loading / firing is in helpers/firearms.mjs.
    schema.isFirearm = new fields.BooleanField({ required: true, initial: false });
    schema.firearm = new fields.SchemaField({
      // Only ammo with the same caliber loads into it. Blank = any ammo.
      caliber: new fields.StringField({ required: true, blank: true, initial: "" }),
      // Rounds the magazine / cylinder holds (the chamber is extra).
      capacity: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 6 }),
      // Fires from a chamber that has to be loaded first (pistols with a slide, rifles with a bolt).
      // Off for revolvers: they fire straight from the cylinder.
      hasChamber: new fields.BooleanField({ required: true, initial: false }),
      // After a shot the next round goes into the chamber by itself (semi-automatic).
      selfLoading: new fields.BooleanField({ required: true, initial: false }),
      // The rounds in the magazine, in the order they were loaded. The first one is fired first.
      magazine: new fields.ArrayField(new fields.SchemaField(roundFields())),
      // The round in the chamber, or null when it's empty.
      chamber: new fields.SchemaField(roundFields(), { required: true, nullable: true, initial: null }),
    });

    // ---- Ammunition ----
    // A box of rounds. Quantity = how many boxes. Every box is full except the open one on top.
    // Loose rounds: set perBox to 1, then quantity is just the number of rounds.
    schema.isAmmo = new fields.BooleanField({ required: true, initial: false });
    schema.ammo = new fields.SchemaField({
      caliber: new fields.StringField({ required: true, blank: true, initial: "" }),
      perBox: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
      // Rounds left in the open box.
      rounds: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
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

    // Ammo: rounds in the whole stack (the open box plus the full ones under it).
    this.ammoTotal = this.quantity > 0
      ? Math.min(this.ammo.rounds, this.ammo.perBox) + (this.quantity - 1) * this.ammo.perBox
      : 0;
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
