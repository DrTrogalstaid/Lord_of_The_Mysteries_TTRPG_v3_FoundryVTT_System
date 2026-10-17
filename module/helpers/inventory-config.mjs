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
 * Turn one of the tables above into { key: label } for a <select> ({{selectOptions ... localize=true}}).
 * @param {Record<string, {label: string}>} table
 * @returns {Record<string, string>}
 */
export function labelMap(table) {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [key, value.label]));
}
