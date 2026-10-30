/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return foundry.applications.handlebars.loadTemplates([
    // Actor partials.
    'systems/lotm/templates/actor/parts/actor-features.hbs',
    'systems/lotm/templates/actor/parts/actor-items.hbs',
    'systems/lotm/templates/actor/parts/actor-spells.hbs',
    'systems/lotm/templates/actor/parts/actor-effects.hbs',
    'systems/lotm/templates/actor/player-character/character.hbs',
    'systems/lotm/templates/actor/player-character/parts/biography.hbs',
    'systems/lotm/templates/actor/player-character/parts/header.hbs',
    'systems/lotm/templates/actor/player-character/parts/sidebar.hbs',
    'systems/lotm/templates/actor/player-character/parts/tab-nav.hbs',

    // Partials shared by the player and NPC sheets (see SHARED_PARTIALS in sheets/base-actor-sheet.mjs).
    'systems/lotm/templates/actor/player-character/parts/drop-section.hbs',
    'systems/lotm/templates/actor/player-character/parts/drop-entry.hbs',
    'systems/lotm/templates/actor/player-character/parts/section-entry.hbs',
    'systems/lotm/templates/actor/player-character/parts/action-groups.hbs',
    'systems/lotm/templates/actor/player-character/parts/hidden-grants.hbs',
    'systems/lotm/templates/actor/player-character/parts/entry-rolls.hbs',
    'systems/lotm/templates/actor/player-character/parts/entry-favorite.hbs',

    // App partials
    'systems/lotm/templates/apps/skill-check-dialog.hbs',
    'systems/lotm/templates/apps/attribute-check-dialog.hbs',
    'systems/lotm/templates/apps/action-roll-dialog.hbs',
    // Shared by every roll dialog (see ROLL_DIALOG_PARTIALS in apps/roll-dialog.mjs).
    'systems/lotm/templates/apps/roll-dialog/modifiers.hbs',
    'systems/lotm/templates/apps/roll-dialog/spirituality.hbs',
    'systems/lotm/templates/apps/roll-dialog/footer.hbs',

    // Item partials
    'systems/lotm/templates/item/parts/item-effects.hbs',
    'systems/lotm/templates/item/parts/item-header.hbs',
  ]);
};
