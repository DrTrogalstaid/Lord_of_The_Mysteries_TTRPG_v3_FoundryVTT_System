/**
 * Inventory rules data ("carry items" rules).
 *
 * Everything the rules give as a number lives here, so the rest of the code never has to
 * hard-code a slot count. Change a number here and the sheets and the math follow.
 */

/**
 * Item sizes are counted in sixths of a slot ("units"), so every size is a whole number:
 * 3 tiny items = 1 slot, 2 small items = 1 slot. Adding up whole numbers never has rounding errors,
 * which adding 0.333 three times would.
 */
export const UNITS_PER_SLOT = 6;

/**
 * Item sizes.
 *   units  How much room one item takes, in sixths of a slot.
 *   rank   Bigger number = bigger item. Used to check whether an item fits in a container.
 */
export const ITEM_SIZES = {
  tiny:        { units: 2,  rank: 1, label: "LORD_OF_THE_MYSTERIES.Inventory.Sizes.tiny" },        // match box, paper figurine, pen, candle
  small:       { units: 3,  rank: 2, label: "LORD_OF_THE_MYSTERIES.Inventory.Sizes.small" },       // notebook, tarot deck, charm, necklace
  smallMedium: { units: 6,  rank: 3, label: "LORD_OF_THE_MYSTERIES.Inventory.Sizes.smallMedium" }, // knife, potion, purse, revolver
  medium:      { units: 12, rank: 4, label: "LORD_OF_THE_MYSTERIES.Inventory.Sizes.medium" },      // sword, rifle, large bottle of wine
  mediumLarge: { units: 18, rank: 5, label: "LORD_OF_THE_MYSTERIES.Inventory.Sizes.mediumLarge" }, // steam rifle, longbow, sniper rifle
  large:       { units: 24, rank: 6, label: "LORD_OF_THE_MYSTERIES.Inventory.Sizes.large" },       // giant weapon, full body armor
};

/** How a gear item is carried. Held and worn items count toward Strength but not toward pockets. */
export const CARRY_MODES = {
  stowed: { label: "LORD_OF_THE_MYSTERIES.Inventory.Carry.stowed" },
  held:   { label: "LORD_OF_THE_MYSTERIES.Inventory.Carry.held" },
  worn:   { label: "LORD_OF_THE_MYSTERIES.Inventory.Carry.worn" },
};

/** Time it takes to take something out of a bag. */
export const DRAW_ACTIONS = {
  move:      "LORD_OF_THE_MYSTERIES.Inventory.Draw.move",
  fullRound: "LORD_OF_THE_MYSTERIES.Inventory.Draw.fullRound",
};

/**
 * Clothing and bags.
 *   category       "clothing" or "bag".
 *   slots          Item slots it provides.
 *   hidden         Hidden pockets it can have.
 *   maxSize        Biggest item size that fits (key of ITEM_SIZES). Pockets only fit small-medium and smaller.
 *   draw           Action needed to take an item out ("" = not stated by the rules).
 *   prestige       Lowest prestige level to wear it (key of CONFIG.LORD_OF_THE_MYSTERIES.skillLevels). Shown, not enforced.
 *   combatPenalty  Penalty to skill and ability checks when fighting while carrying it.
 */
export const CONTAINER_TYPES = {
  poor:          { category: "clothing", slots: 2,  hidden: 0, maxSize: "smallMedium", draw: "",          prestige: "untrained",  combatPenalty: 0,  label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.poor" },
  ordinary:      { category: "clothing", slots: 4,  hidden: 0, maxSize: "smallMedium", draw: "",          prestige: "trained",    combatPenalty: 0,  label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.ordinary" },
  formal:        { category: "clothing", slots: 8,  hidden: 2, maxSize: "smallMedium", draw: "",          prestige: "proficient", combatPenalty: 0,  label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.formal" },
  wizardRobe:    { category: "clothing", slots: 12, hidden: 4, maxSize: "smallMedium", draw: "",          prestige: "advanced",   combatPenalty: 0,  label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.wizardRobe" },
  messenger:     { category: "bag",      slots: 2,  hidden: 1, maxSize: "smallMedium", draw: "move",      prestige: "",           combatPenalty: 0,  label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.messenger" },
  backpack:      { category: "bag",      slots: 4,  hidden: 2, maxSize: "medium",      draw: "fullRound", prestige: "",           combatPenalty: 0,  label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.backpack" },
  suitcase:      { category: "bag",      slots: 6,  hidden: 3, maxSize: "mediumLarge", draw: "fullRound", prestige: "",           combatPenalty: -2, label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.suitcase" },
  largeSuitcase: { category: "bag",      slots: 8,  hidden: 4, maxSize: "large",       draw: "fullRound", prestige: "",           combatPenalty: -2, label: "LORD_OF_THE_MYSTERIES.Inventory.Containers.largeSuitcase" },
};

/**
 * Tailoring upgrades (crafting check or a commissioned tailor). A garment or bag has one upgrade at most:
 * the rules say they don't stack, so the container stores a single choice.
 * Keys match the skill level keys so the upgrade reads as "made with Mastery-level crafting".
 *   slots / hidden  What the upgrade adds.
 *   dc              Crafting check difficulty, shown on the container sheet.
 */
export const CONTAINER_UPGRADES = {
  none:        { slots: 0, hidden: 0, dc: null, label: "LORD_OF_THE_MYSTERIES.Inventory.Upgrades.none" },
  proficient:  { slots: 2, hidden: 1, dc: 15,   label: "LORD_OF_THE_MYSTERIES.Inventory.Upgrades.proficient" },
  advanced:    { slots: 3, hidden: 2, dc: 15,   label: "LORD_OF_THE_MYSTERIES.Inventory.Upgrades.advanced" },
  mastery:     { slots: 4, hidden: 3, dc: 20,   label: "LORD_OF_THE_MYSTERIES.Inventory.Upgrades.mastery" },
  lore:        { slots: 5, hidden: 4, dc: 25,   label: "LORD_OF_THE_MYSTERIES.Inventory.Upgrades.lore" },
  grandMaster: { slots: 6, hidden: 5, dc: 30,   label: "LORD_OF_THE_MYSTERIES.Inventory.Upgrades.grandMaster" },
};

/**
 * Damage types that count as "external" for enchanted full body armor
 * (keys of CONFIG.LORD_OF_THE_MYSTERIES.damageTypes). The rules don't list them, so this is a GM call:
 * edit the list and the enchanted armor follows.
 */
export const EXTERNAL_DAMAGE_TYPES = ["physical", "fire", "cold", "lightning"];

/**
 * Armor. A gear item is armor when its armorKind isn't "none"; it protects while it's worn (carry = "worn").
 * Only one suit counts at a time ("external armor can only be superimposed with skin armor").
 *   armor            Armor points.
 *   reduction        Damage reduction against each type in `reduces`.
 *   reduces          Damage types (keys of CONFIG.LORD_OF_THE_MYSTERIES.damageTypes) the reduction applies to.
 *   agility          Temporary Agility penalty while worn.
 *   halfMoveBelow    Strength below this halves movement (rounded up). null = no limit.
 *   immobileBelow    Strength below this: can't move at all. null = no limit.
 *   cannotWearBelow  Strength below this: can't be worn, gives no protection. null = no limit.
 *   fireLimit        Destroyed after this many hits of fire damage. null = fire doesn't destroy it.
 *   unprotected      Vital points it doesn't protect.
 * Suggested item sizes: cotton/leather medium, chain/iron mediumLarge, half / full / enchanted large.
 */
export const ARMOR_TYPES = {
  none:          { armor: 0, reduction: 0, reduces: [],                     agility: 0, halfMoveBelow: null, immobileBelow: null, cannotWearBelow: null, fireLimit: null, unprotected: [],            label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.Types.none" },
  cottonLeather: { armor: 2, reduction: 2, reduces: ["physical"],           agility: 0, halfMoveBelow: null, immobileBelow: null, cannotWearBelow: null, fireLimit: 2,    unprotected: [],            label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.Types.cottonLeather" },
  chainIron:     { armor: 4, reduction: 3, reduces: ["physical", "fire"],   agility: 2, halfMoveBelow: null, immobileBelow: null, cannotWearBelow: null, fireLimit: null, unprotected: [],            label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.Types.chainIron" },
  halfBody:      { armor: 6, reduction: 4, reduces: ["physical", "fire"],   agility: 4, halfMoveBelow: 6,    immobileBelow: 4,    cannotWearBelow: null, fireLimit: null, unprotected: ["lowerBody"], label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.Types.halfBody" },
  fullBody:      { armor: 8, reduction: 5, reduces: ["physical", "fire"],   agility: 4, halfMoveBelow: 10,   immobileBelow: null, cannotWearBelow: 5,    fireLimit: null, unprotected: [],            label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.Types.fullBody" },
  enchanted:     { armor: 8, reduction: 5, reduces: EXTERNAL_DAMAGE_TYPES,  agility: 2, halfMoveBelow: 8,    immobileBelow: 4,    cannotWearBelow: null, fireLimit: null, unprotected: [],            label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.Types.enchanted" },
};

/**
 * How badly the armor's gap has been opened ("Armor Shattered").
 *   0  Intact.
 *   1  Penetrated: a firearm/explosive got past it for under 10 damage. Critical strikes on the gap
 *      ignore armor and reduction, but get no extra damage.
 *   2  Broken: 10+ effective damage got through. Critical strikes on the gap ignore armor and reduction, +1d6 damage.
 * Wound expansion (armorState.expansion) is counted separately: each step lowers the critical-strike penalty by 2.
 */
export const ARMOR_BREACH = {
  0: { label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.BreachLevels.intact" },
  1: { label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.BreachLevels.penetrated" },
  2: { label: "LORD_OF_THE_MYSTERIES.Inventory.Armor.BreachLevels.broken" },
};

/**
 * Turn one of the tables above into { key: label } for a <select> ({{selectOptions ... localize=true}}).
 * @param {Record<string, {label: string}>} table
 * @returns {Record<string, string>}
 */
export function labelMap(table) {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [key, value.label]));
}
