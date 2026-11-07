/**
 * The start-of-turn card: when a creature's turn starts in combat, one chat card lists what its statuses need
 * (rulebook: "at the beginning of each round"), with a button for each roll. Nothing is rolled automatically.
 *
 *   Bleeding   Roll 1d2: Health lost (none for a Beyonder with physical improvement)
 *   Bloodbath  Roll Physique (DC 15): fail = faints, Helpless (ordinary people only)
 *   Dying      Roll Physique (DC 10): fail = dies; Roll Will (DC 15) to take an attack, casting or move action
 *   Fear       Roll Will (DC 15) to resist the forced movement
 *   Angry      Roll Will (DC 20) to calm down
 *   Shock      a reminder of the lost action
 *   Semi-Out-of-Control  Roll Will (DC 10): fail = a 0/1 sanity check; rounds left and the madness tendency
 * What each status shows, and what its buttons do, is in its StatusRule (turnStart, onTurnCheck; effects/rules/).
 *
 * The card is posted by the GM's client (LordOfTheMysteriesCombat, documents/combat.mjs) and whispered to the
 * creature's owners and the GMs. Its owners (or a GM) click the buttons. Each button works once: the effect
 * remembers it in system.turnChecks.
 */

import { statusRule } from "./status-effects.mjs";
import { ownersAndGMs } from "./status-checks.mjs";

/**
 * Post the start-of-turn card for a creature, if any of its statuses need something this turn.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {TokenDocument} [options.token]   The combatant's token, for the card's speaker.
 * @returns {Promise<ChatMessage|null>}     null when there was nothing to post.
 */
export async function postTurnStartCard(actor, { token = null } = {}) {
  if (!actor || actor.statuses?.has("dead")) return null;

  const escape = Handlebars.escapeExpression;
  const rows = [];
  for (const effect of actor.allApplicableEffects()) {
    if (!effect.active) continue;
    // Only the effect's own statuses: implied ones (the Bound that comes with Helpless) have their own effects.
    for (const id of effect.statuses) {
      const rule = statusRule(id);
      const section = rule?.turnStart(actor, effect);
      if (!section) continue;

      const buttons = (section.buttons ?? []).map((button) => `
        <button type="button" data-lotm-turn-check="${escape(button.check)}" data-status-id="${escape(rule.id)}"
                data-effect-uuid="${escape(effect.uuid)}">${escape(button.label)}</button>`).join("");
      rows.push(`
      <li class="turn-start-status">
        <img src="${escape(rule.img)}" alt="" />
        <div>
          <strong>${escape(effect.name)}</strong> ${section.text}
          ${buttons ? `<div class="turn-start-buttons">${buttons}</div>` : ""}
        </div>
      </li>`);
    }
  }
  if (!rows.length) return null;

  const title = game.i18n.format("LORD_OF_THE_MYSTERIES.Status.TurnStart.Title", { name: escape(token?.name ?? actor.name) });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token }),
    content: `<div class="lotm chat-turn-start">
      <p class="chat-turn-start-title">${title}</p>
      <ul class="turn-start-list">${rows.join("")}
      </ul>
    </div>`,
    whisper: ownersAndGMs(actor),
    flags: { lotm: { turnStart: { actorUuid: actor.uuid } } },
  });
}


/**
 * Make the start-of-turn cards' buttons work. Called once from the init hook in lotm.mjs.
 * A button that's been used already (or whose effect is gone) is shown greyed out.
 */
export function registerTurnStartChatListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll("button[data-lotm-turn-check]")) {
      const effect = fromUuidSync(button.dataset.effectUuid);
      if (!effect || usedChecks(effect).includes(checkKey(message, button))) button.disabled = true;
      button.addEventListener("click", (event) => onTurnCheckButton(event, message, button));
    }
  });
}


/** "<card id>:<check>", how a used button is remembered on its effect. */
function checkKey(message, button) {
  return `${message.id}:${button.dataset.lotmTurnCheck}`;
}


/** The buttons already used for an effect (system.turnChecks). */
function usedChecks(effect) {
  return effect.system?.turnChecks ?? [];
}


/**
 * A start-of-turn card button: its status rolls (onTurnCheck), then the effect remembers the button was used.
 * Shift-click rolls without the dialog.
 * @param {MouseEvent} event
 * @param {ChatMessage} message
 * @param {HTMLButtonElement} button
 */
async function onTurnCheckButton(event, message, button) {
  event.preventDefault();
  const warn = (key) => ui.notifications.warn(game.i18n.localize(`LORD_OF_THE_MYSTERIES.Status.TurnStart.${key}`));

  const effect = await fromUuid(button.dataset.effectUuid).catch(() => null);
  const rule = statusRule(button.dataset.statusId);
  if (!effect || !rule) return warn("Gone");
  if (!effect.isOwner) return warn("NotOwner");

  const key = checkKey(message, button);
  if (usedChecks(effect).includes(key)) return warn("AlreadyUsed");

  button.disabled = true;
  const used = await rule.onTurnCheck(button.dataset.lotmTurnCheck, effect, { fast: event.shiftKey });
  if (!used) {
    button.disabled = false;       // the dialog was closed without rolling
    return;
  }

  // Remember it (unless the effect is gone, e.g. Angry calmed down). Older cards' buttons are forgotten.
  if (effect.parent?.effects?.has(effect.id)) {
    const kept = usedChecks(effect).filter((entry) => entry.startsWith(`${message.id}:`));
    await effect.update({ "system.turnChecks": [...kept, key] });
  }
}
