/**
 * The one-line chat messages about effects ("Klein applies Terrified to Goblin.", "Klein switches on Spirit Vision.",
 * "Blessing ends: Smite was used 1 time(s).") all look the same: the effect's icon, then the line
 * (templates/chat/effect-line.hbs).
 */

import { renderTemplateSync } from "../helpers/render.mjs";

/**
 * Post a one-line effect message.
 * @param {object} options
 * @param {object} options.speaker      ChatMessage speaker data.
 * @param {string} options.img          The icon.
 * @param {string} options.key          Lang key of the line.
 * @param {object} [options.data]       Its values (escaped by the template).
 * @param {string} [options.extra]      HTML that goes after the line (already safe).
 * @returns {Promise<ChatMessage>}
 */
export function postEffectLine({ speaker, img, key, data = {}, extra = "" }) {
  return ChatMessage.create({
    speaker,
    content: renderTemplateSync("systems/lotm/templates/chat/effect-line.hbs", { img, key, data, extra }),
  });
}
