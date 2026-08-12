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

    // Item partials
    'systems/lotm/templates/item/parts/item-effects.hbs',
    'systems/lotm/templates/item/parts/item-header.hbs',
  ]);
};
