// Import document classes.
import { LordOfTheMysteriesActor } from './documents/actor.mjs';
import { LordOfTheMysteriesItem } from './documents/item.mjs';
import { LordOfTheMysteriesActiveEffect } from './documents/active-effect.mjs';

// Import sheet classes.
// Both actor sheets extend LordOfTheMysteriesActorSheetBase (sheets/base-actor-sheet.mjs).
import { PlayerCharacterSheet } from "./sheets/player-character-sheet.mjs";
import { NpcSheet } from "./sheets/npc-sheet.mjs";
import { LordOfTheMysteriesItemSheet } from './sheets/item-sheet.mjs';
import { LordOfTheMysteriesSequenceSheet } from './sheets/item/character_building/sequence-sheet.mjs';
import { LordOfTheMysteriesSkillSheet } from './sheets/item/character_building/skill-sheet.mjs';
import { LordOfTheMysteriesAbilitySheet } from './sheets/item/character_building/ability-sheet.mjs';
import { LordOfTheMysteriesActionSheet } from './sheets/item/character_building/action-sheet.mjs';
import { LordOfTheMysteriesSpellSheet } from './sheets/item/character_building/spell-sheet.mjs';
import { LordOfTheMysteriesGearSheet, LordOfTheMysteriesContainerSheet } from './sheets/item/inventory/inventory-sheets.mjs';

// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { LORD_OF_THE_MYSTERIES } from './helpers/config.mjs';
import * as INVENTORY_RULES from './helpers/inventory-config.mjs';
import { registerCurrencySettings } from './helpers/currency.mjs';
import { registerTokenSettings } from './helpers/token-settings.mjs';
import { STATUS_RULES, registerStatusEffects } from './effects/status-effects.mjs';

// Import custom Roll class.
import LOTM_VTTRoll from './dice/lotm-roll.mjs';

// Import action attack/damage rolls (the "Roll Damage" chat button listener).
import { registerActionChatListeners } from './helpers/action-roll.mjs';

// Import DataModel classes
import * as models from './data/_module.mjs';

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function () {
  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.lotm = {
    LordOfTheMysteriesActor,
    LordOfTheMysteriesItem,
    rollItemMacro,
    // Every status's rules, by id (effects/status-effects.mjs), e.g. game.lotm.statusRules.bound
    statusRules: STATUS_RULES,
  };

  // Add custom constants for configuration.
  CONFIG.LORD_OF_THE_MYSTERIES = LORD_OF_THE_MYSTERIES;
  CONFIG.LORD_OF_THE_MYSTERIES.inventory = { ...INVENTORY_RULES };

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    // 1d20 + the Agility total (after armor and carrying penalties).
    formula: '1d20 + @attributes.agi.total',
    decimals: 2,
  };

  // Register the system's custom Roll class as the default, so every roll
  // (skill checks from the new dialog, but also any inline [[/r ...]] roll
  // or /roll chat command) gets its tooltip/cleanFormula behavior -- see
  // module/dice/lotm-roll.mjs for what that adds over the base Roll class.
  // Put at the front rather than replacing the list, so the core Roll class
  // stays registered for older chat messages and other modules' rolls.
  CONFIG.Dice.rolls.unshift(LOTM_VTTRoll);

  // Make the "Roll damage" button on action attack messages work.
  registerActionChatListeners();

  // World setting read by SkillCheckDialog.prompt(): when off, untrained
  // skills can't be rolled at all.
  game.settings.register('lotm', 'allowUntrainedSkillChecks', {
    name: 'LORD_OF_THE_MYSTERIES.Settings.AllowUntrainedSkillChecks.Name',
    hint: 'LORD_OF_THE_MYSTERIES.Settings.AllowUntrainedSkillChecks.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  // Money: the local currency prices are shown in, exchange rates, and the exchange fee (helpers/currency.mjs).
  registerCurrencySettings();

  // Token "Display Name" / "Resource Bars" for every actor (helpers/token-settings.mjs).
  registerTokenSettings();

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = LordOfTheMysteriesActor;
  // Note that you don't need to declare a DataModel
  // for the base actor/item classes - they are included
  // with the Character/NPC as part of super.defineSchema()
  CONFIG.Actor.dataModels = {
    character: models.LordOfTheMysteriesCharacter,
    npc: models.LordOfTheMysteriesNPC
  }
  CONFIG.Item.documentClass = LordOfTheMysteriesItem;
  CONFIG.Item.dataModels = {
    item: models.LordOfTheMysteriesItem,
    feature: models.LordOfTheMysteriesFeature,
    spell: models.LordOfTheMysteriesSpell,
    sequence: models.LordOfTheMysteriesSequence,
    skill: models.LordOfTheMysteriesSkill,
    ability: models.LordOfTheMysteriesAbility,
    action: models.LordOfTheMysteriesAction,
    gear: models.LordOfTheMysteriesGear,
    container: models.LordOfTheMysteriesContainer
  }

  // Active Effects: statuses, spell effects and the effects Items lend their owner (see documents/active-effect.mjs,
  // data/effect/effect.mjs and effects/status-effects.mjs). Every new effect is the system's "effect" type.
  CONFIG.ActiveEffect.documentClass = LordOfTheMysteriesActiveEffect;
  CONFIG.ActiveEffect.dataModels.effect = models.LordOfTheMysteriesEffect;
  CONFIG.ActiveEffect.defaultType = 'effect';
  // An effect whose duration has run out is deleted (Foundry's effect registry checks durations as time passes).
  CONFIG.ActiveEffect.expiryAction = 'delete';

  // World setting: Invisible hides the token like Foundry's own invisibility, or is only a status icon.
  // Read once here, when the statuses are registered, so changing it needs a reload.
  game.settings.register('lotm', 'invisibleHidesToken', {
    name: 'LORD_OF_THE_MYSTERIES.Settings.InvisibleHidesToken.Name',
    hint: 'LORD_OF_THE_MYSTERIES.Settings.InvisibleHidesToken.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  // The system's statuses replace Foundry's own list (Token HUD, Effects tab).
  registerStatusEffects({ invisibleHidesToken: game.settings.get('lotm', 'invisibleHidesToken') });

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet('core', foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet('lotm', NpcSheet, {
    types: ['npc'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetTitles.NPC',
  });
  foundry.documents.collections.Actors.registerSheet('lotm', PlayerCharacterSheet, {
    types: ['character'], // whatever `type` PlayerCharacterData is registered under
    makeDefault: true,
    label: "LORD_OF_THE_MYSTERIES.SheetTitles.PlayerCharacter"
  });

  foundry.documents.collections.Items.unregisterSheet('core', foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesItemSheet, {
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Item',
  });
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesSequenceSheet, {
    types: ['sequence'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Sequence'
  });
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesSkillSheet, {
    types: ['skill'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Skill'
  });
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesAbilitySheet, {
    types: ['ability'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Ability'
  });
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesActionSheet, {
    types: ['action'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Action'
  });
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesSpellSheet, {
    types: ['spell'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Action'
  });
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesGearSheet, {
    types: ['gear'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Gear'
  });
  foundry.documents.collections.Items.registerSheet('lotm', LordOfTheMysteriesContainerSheet, {
    types: ['container'],
    makeDefault: true,
    label: 'LORD_OF_THE_MYSTERIES.SheetLabels.Container'
  });

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper('toLowerCase', function (str) {
  return str.toLowerCase();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.lotm.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'lotm.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Actions and spells roll their attack (skill bonus + dialog). Everything else uses the item's own roll.
    if (item.type === "action" || item.type === "spell") return item.system.rollAttack();
    item.roll();
  });
}
