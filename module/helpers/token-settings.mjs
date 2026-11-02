/**
 * Token defaults.
 *
 *   - Every new actor's token shows Health in bar 1 (resources.hp).
 *   - New player characters' tokens are linked to the actor ("Link Actor Data"): damage on the token changes the
 *     character itself. NPCs keep Foundry's default (unlinked), so each NPC token tracks its own Health.
 *   - Two world settings, "Display Name" and "Resource Bars": who sees each token's name and bars.
 *     They apply to new actors, and changing one updates every actor and every token already on a scene.
 *
 * Used by documents/actor.mjs (_preCreate) and lotm.mjs (registerTokenSettings, in the init hook).
 * Foundry's own "Prototype Token Overrides" (Core settings) can set the same things; these come after it,
 * so for these four the system's choice wins.
 */

/** The attribute bar 1 shows on every actor's token. */
export const HEALTH_BAR = "resources.hp";

/**
 * Who can see a token's name or bars. Values from Foundry's CONST.TOKEN_DISPLAY_MODES, labels from Foundry's own
 * language file (the same words its token config uses).
 */
function displayModeChoices() {
  const modes = CONST.TOKEN_DISPLAY_MODES;
  return {
    [modes.NONE]: "TOKEN.DISPLAY_NONE",
    [modes.CONTROL]: "TOKEN.DISPLAY_CONTROL",
    [modes.OWNER_HOVER]: "TOKEN.DISPLAY_OWNER_HOVER",
    [modes.HOVER]: "TOKEN.DISPLAY_HOVER",
    [modes.OWNER]: "TOKEN.DISPLAY_OWNER",
    [modes.ALWAYS]: "TOKEN.DISPLAY_ALWAYS",
  };
}

/** Register the two settings. Called from the init hook in lotm.mjs. */
export function registerTokenSettings() {
  const modes = CONST.TOKEN_DISPLAY_MODES;
  const setting = (key, field, initial) => game.settings.register("lotm", key, {
    name: `LORD_OF_THE_MYSTERIES.Settings.${key}.Name`,
    hint: `LORD_OF_THE_MYSTERIES.Settings.${key}.Hint`,
    scope: "world",
    config: true,
    type: Number,
    choices: displayModeChoices(),
    default: initial,
    onChange: (value) => applyEverywhere({ [field]: Number(value) }),
  });
  setting("tokenDisplayName", "displayName", modes.OWNER_HOVER);
  setting("tokenDisplayBars", "displayBars", modes.OWNER_HOVER);
}

/**
 * What a new actor's prototype token gets (documents/actor.mjs _preCreate).
 * @param {string} type  The actor's type ("character", "npc").
 * @returns {object}     Update data for prototypeToken.
 */
export function prototypeTokenDefaults(type) {
  const defaults = {
    bar1: { attribute: HEALTH_BAR },
    displayName: game.settings.get("lotm", "tokenDisplayName"),
    displayBars: game.settings.get("lotm", "tokenDisplayBars"),
  };
  // Player characters: one Health for the character and all its tokens.
  if (type === "character") defaults.actorLink = true;
  return defaults;
}

/**
 * A setting changed: give every actor in the world, and every token on every scene, the new value.
 * Only one GM does this (the active one), so the updates aren't sent twice. Compendium actors aren't changed;
 * they get the setting when they're imported.
 * @param {object} changes  e.g. { displayName: 30 }
 */
async function applyEverywhere(changes) {
  if (!game.user.isActiveGM) return;

  const prototype = Object.fromEntries(Object.entries(changes).map(([key, value]) => [`prototypeToken.${key}`, value]));
  const actorUpdates = game.actors.map((actor) => ({ _id: actor.id, ...prototype }));
  if (actorUpdates.length) await Actor.implementation.updateDocuments(actorUpdates);

  for (const scene of game.scenes) {
    const tokenUpdates = scene.tokens.map((token) => ({ _id: token.id, ...changes }));
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates);
  }
}
