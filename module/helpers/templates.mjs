/**
 * Chat card and dialog templates (helpers/render.mjs). Loaded when the world starts, so renderTemplateSync can use
 * them right away.
 */
export const CARD_TEMPLATES = [
  "systems/lotm/templates/chat/learning.hbs",
  "systems/lotm/templates/dialogs/study.hbs",
  "systems/lotm/templates/dialogs/learning-success.hbs",
  "systems/lotm/templates/dialogs/gun-choice.hbs",
  "systems/lotm/templates/dialogs/gun-load.hbs",
  "systems/lotm/templates/chat/bullet.hbs",
  "systems/lotm/templates/chat/ammo.hbs",
  "systems/lotm/templates/chat/damage-buttons.hbs",
  "systems/lotm/templates/chat/apply-buttons.hbs",
  "systems/lotm/templates/chat/damage-roll.hbs",
  "systems/lotm/templates/chat/damage-taken.hbs",
  "systems/lotm/templates/chat/luck-spent.hbs",
  "systems/lotm/templates/chat/luck-burn.hbs",
  "systems/lotm/templates/chat/luck-note.hbs",
  "systems/lotm/templates/dialogs/burn-luck.hbs",
  "systems/lotm/templates/chat/turn-start.hbs",
  "systems/lotm/templates/dialogs/money.hbs",
  "systems/lotm/templates/chat/money-log.hbs",
  "systems/lotm/templates/chat/effect-line.hbs",
  "systems/lotm/templates/chat/effect-buttons.hbs",
  "systems/lotm/templates/dialogs/area-tokens.hbs",
  "systems/lotm/templates/chat/rolled-value.hbs",
  "systems/lotm/templates/chat/paragraphs.hbs",
  "systems/lotm/templates/chat/sanity-loss.hbs",
  "systems/lotm/templates/chat/promotion.hbs",
  "systems/lotm/templates/chat/check-result.hbs",
  "systems/lotm/templates/chat/check-flavor.hbs",
  "systems/lotm/templates/chat/spirituality.hbs",
  "systems/lotm/templates/chat/attack-results.hbs",
  "systems/lotm/templates/chat/card-button.hbs",
  "systems/lotm/templates/dialogs/status-restrictions.hbs",
  "systems/lotm/templates/chat/used-despite.hbs",
  "systems/lotm/templates/chat/item-note.hbs",
  "systems/lotm/templates/dialogs/spend.hbs",
  "systems/lotm/templates/chat/long-rest.hbs",
  "systems/lotm/templates/chat/item-card.hbs",
];

/**
 * Load the templates that are used as partials or rendered without waiting (Foundry compiles and caches them, and
 * registers each as a partial under its path).
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return foundry.applications.handlebars.loadTemplates([
    ...CARD_TEMPLATES,

    // Actor partials.
    'systems/lotm/templates/actor/player-character/character.hbs',
    'systems/lotm/templates/actor/player-character/parts/biography.hbs',
    'systems/lotm/templates/actor/player-character/parts/header.hbs',
    'systems/lotm/templates/actor/player-character/parts/tab-nav.hbs',
    // The sidebar both actor sheets share, and its damage reduction / resistance boxes.
    'systems/lotm/templates/actor/parts/sidebar.hbs',
    'systems/lotm/templates/actor/parts/damage-defenses.hbs',

    // Partials shared by the player and NPC sheets (see SHARED_PARTIALS in sheets/base-actor-sheet.mjs).
    'systems/lotm/templates/actor/player-character/parts/drop-section.hbs',
    'systems/lotm/templates/actor/player-character/parts/drop-entry.hbs',
    'systems/lotm/templates/actor/player-character/parts/section-entry.hbs',
    'systems/lotm/templates/actor/player-character/parts/action-groups.hbs',
    'systems/lotm/templates/actor/player-character/parts/hidden-grants.hbs',
    'systems/lotm/templates/actor/player-character/parts/entry-rolls.hbs',
    'systems/lotm/templates/actor/player-character/parts/entry-favorite.hbs',
    'systems/lotm/templates/actor/player-character/parts/drop-section-header.hbs',

    // App partials
    'systems/lotm/templates/apps/skill-check-dialog.hbs',
    'systems/lotm/templates/apps/attribute-check-dialog.hbs',
    'systems/lotm/templates/apps/action-roll-dialog.hbs',
    'systems/lotm/templates/apps/sanity-check-dialog.hbs',
    'systems/lotm/templates/apps/promotion-dialog.hbs',
    // Shared by every roll dialog (see ROLL_DIALOG_PARTIALS in apps/roll-dialog.mjs).
    'systems/lotm/templates/apps/roll-dialog/modifiers.hbs',
    'systems/lotm/templates/apps/roll-dialog/spirituality.hbs',
    'systems/lotm/templates/apps/roll-dialog/footer.hbs',

    // Item partials
    'systems/lotm/templates/item/parts/item-header.hbs',
    'systems/lotm/templates/item/parts/action-traits.hbs',
    'systems/lotm/templates/item/parts/item-effects.hbs',
    'systems/lotm/templates/item/parts/tab-nav.hbs',

    // Used by actor and item sheets: a rich text field.
    'systems/lotm/templates/parts/rich-text.hbs',
  ]);
};
