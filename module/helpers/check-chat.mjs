/**
 * What check cards show in chat, worked out from the data the roll dialogs save on each message
 * (flags.lotm.check and flags.lotm.attack, apps/roll-dialog.mjs):
 *   - an attack's hit check: "vs. Physical Defense", then each target with Hit or Miss. The GM also sees each
 *     target's defense number; players don't (knowing it takes an ability in the rulebook)
 *   - Big Success: on a natural 20 the attack's damage buttons are just "Big Success" (half the maximum at least).
 *     On any other natural roll the Big Success button is taken away. Messages from before this have both.
 *   - the Burn Luck button, for whoever can burn Luck on that roll (helpers/luck.mjs)
 *   - the Roll Outcome button, for a roll with outcome tables (helpers/outcome-tables.mjs)
 *   - the Roll Loss button, on a Sanity check: rolls the loss and takes it off (rollSanityLoss, helpers/sanity.mjs)
 *   - a drawn Roll Table result that is an Active Effect (or links one) gets an Apply button (helpers/enrichers.mjs)
 *   - on an outcome's message, its @Sanity / @Check / @Effect buttons are tied to the character who made the check
 *     (helpers/enrichers.mjs)
 *   - parts of a message only the GM should see (class "lotm-gm-only", e.g. defenses on a Luck burn) are removed
 *     for everyone else
 * Nothing is shown for a roll the user isn't allowed to see (a private or blind roll).
 *
 * Registered once from the init hook in lotm.mjs.
 */

import { luckBurners, openBurnLuckDialog } from "./luck.mjs";
import { canRollOutcome, rollOutcome } from "./outcome-tables.mjs";
import { canRollSanityLoss, rollSanityLoss, sanityLossMessage } from "./sanity.mjs";
import { addTableEffectButtons } from "./enrichers.mjs";

/** Foundry's renderTemplate: the chat log is drawn while the world is still loading, maybe before the templates are. */
const { renderTemplate } = foundry.applications.handlebars;

/** How each target of an attack shows: Hit, Miss, or Unknown (it had no defense to check against). */
const HIT_LOOKS = {
  hit: { css: "is-hit", word: "LORD_OF_THE_MYSTERIES.Attack.Hit" },
  miss: { css: "is-miss", word: "LORD_OF_THE_MYSTERIES.Attack.Miss" },
  unknown: { css: "", word: "LORD_OF_THE_MYSTERIES.Attack.Unknown" },
};
const isKnown = (value) => value !== null && value !== undefined;


export function registerCheckChatListeners() {
  // A Sanity check's loss was rolled (by anyone): redraw the check so its Roll Loss button greys out everywhere.
  Hooks.on("createChatMessage", (message) => {
    const source = game.messages.get(message.getFlag("lotm", "sanityLoss")?.sourceId ?? "");
    if (source) ui.chat?.updateMessage?.(source);
  });
  Hooks.on("renderChatMessageHTML", onRenderMessage);
}


/**
 * Every chat message as it's drawn: GM-only parts, table effect buttons, outcome links, and on a check's card its
 * hit / miss results, Big Success and its buttons.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function onRenderMessage(message, html) {
  if (!game.user.isGM) html.querySelectorAll(".lotm-gm-only").forEach((element) => element.remove());

  // A drawn table result that is an effect: an Apply button next to it. Before the next step, so it's tied too.
  addTableEffectButtons(message, html);

  // An outcome table's result: its @Sanity / @Check / @Effect buttons are for the character who made the check.
  const outcomeActor = message.getFlag("lotm", "outcome")?.actorUuid;
  if (outcomeActor) {
    for (const link of html.querySelectorAll("[data-lotm-enricher]")) link.dataset.actorUuid ||= outcomeActor;
  }

  const check = message.getFlag("lotm", "check");
  const content = html.querySelector(".message-content");
  if (!check || !content || !message.isContentVisible) return;

  showBigSuccess(html, check.natural);
  addCheckCardParts(message, content);
}


/**
 * A check card's hit / miss results and its buttons, drawn from templates (in order, once each is ready).
 * @param {ChatMessage} message
 * @param {HTMLElement} content   The message's .message-content.
 */
async function addCheckCardParts(message, content) {
  const attack = message.getFlag("lotm", "attack");
  if (attack) await addAttackResults(content, attack);
  for (const button of cardButtons(message)) await appendCardButton(content, button);
}


/**
 * The buttons at the bottom of a check's card that this user can use. See appendCardButton.
 * @param {ChatMessage} message
 * @returns {object[]}
 */
function cardButtons(message) {
  const buttons = [];

  // Roll Outcome (once per roll).
  if (canRollOutcome(message)) {
    const isRolled = () => !!message.getFlag("lotm", "outcomeRolled");
    buttons.push({
      rowClass: "lotm-outcome-buttons", buttonClass: "lotm-roll-outcome", icon: "fa-solid fa-table-list",
      label: "LORD_OF_THE_MYSTERIES.Outcome.Button", hint: "LORD_OF_THE_MYSTERIES.Outcome.ButtonHint",
      disabled: isRolled(),
      onClick: oncePerRoll(() => rollOutcome(message), isRolled),
    });
  }

  // Roll Loss on a Sanity check (once per check, like Roll Outcome).
  if (canRollSanityLoss(message)) {
    const isRolled = () => !!sanityLossMessage(message);
    buttons.push({
      rowClass: "lotm-sanity-loss-buttons", buttonClass: "lotm-roll-sanity-loss", icon: "fa-solid fa-brain",
      label: "LORD_OF_THE_MYSTERIES.Sanity.RollLoss", hint: "LORD_OF_THE_MYSTERIES.Sanity.RollLossHint",
      disabled: isRolled(),
      onClick: oncePerRoll(() => rollSanityLoss(message), isRolled),
    });
  }

  // Burn Luck.
  if (luckBurners(message).length) {
    buttons.push({
      rowClass: "lotm-luck-buttons", buttonClass: "lotm-burn-luck", icon: "fa-solid fa-clover",
      label: "LORD_OF_THE_MYSTERIES.Luck.Burn", hint: "LORD_OF_THE_MYSTERIES.Luck.BurnHint",
      onClick: () => openBurnLuckDialog(message),
    });
  }
  return buttons;
}


/**
 * Hit or miss, above the roll (the part that expands to show the dice), so it reads with the card's other text.
 * @param {HTMLElement} content   The message's .message-content.
 * @param {object} attack         flags.lotm.attack
 */
async function addAttackResults(content, attack) {
  const block = document.createElement("div");
  block.classList.add("lotm", "chat-attack-results");
  block.innerHTML = await renderTemplate("systems/lotm/templates/chat/attack-results.hbs", attackResultsData(attack));
  const roll = content.querySelector(".dice-roll");
  if (roll) roll.before(block);
  else content.prepend(block);
}


/**
 * Big Success is only offered on a natural 20: there it replaces the damage button; on any other natural roll it's
 * taken away. (Messages from before natural rolls were saved keep both.)
 * @param {HTMLElement} html
 * @param {number|undefined} natural   The d20's natural roll.
 */
function showBigSuccess(html, natural) {
  if (natural === 20) {
    html.querySelector('button[data-lotm-action="damage"]')?.remove();
    html.querySelector('button[data-lotm-action="bigSuccess"]')?.classList.add("is-natural");
  }
  else if (typeof natural === "number") {
    html.querySelector('button[data-lotm-action="bigSuccess"]')?.remove();
  }
}


/**
 * A button on its own row at the bottom of a check's card (Roll Outcome, Roll Loss, Burn Luck).
 * @param {HTMLElement} content   The message's .message-content.
 * @param {object} options
 * @param {string} options.rowClass, options.buttonClass, options.icon   CSS classes (icon: Font Awesome).
 * @param {string} options.label, options.hint   Lang keys for its text and its hover text.
 * @param {boolean} [options.disabled]
 * @param {(button: HTMLButtonElement) => any} options.onClick
 */
async function appendCardButton(content, { rowClass, buttonClass, icon, label, hint, disabled = false, onClick }) {
  const holder = document.createElement("div");
  holder.classList.add(rowClass);
  holder.innerHTML = await renderTemplate("systems/lotm/templates/chat/card-button.hbs", { buttonClass, icon, label, hint });
  const button = holder.querySelector("button");
  if (disabled) button.disabled = true;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onClick(button);
  });
  content.append(holder);
}


/**
 * A click handler for a button that can be used once per roll: greyed out while it runs, and back on if nothing
 * was posted (cancelled) and it hasn't been done since.
 * @param {() => Promise<any>} run    Does it; returns something truthy when it posted.
 * @param {() => boolean} isDone      Whether it has been done for this roll.
 * @returns {(button: HTMLButtonElement) => Promise<void>}
 */
function oncePerRoll(run, isDone) {
  return async (button) => {
    button.disabled = true;
    const posted = await run();
    if (!posted && !isDone()) button.disabled = false;
  };
}


/**
 * What templates/chat/attack-results.hbs shows: the defense checked, and each target's Hit or Miss. Only the GM gets
 * the defense numbers.
 * @param {{defenseTarget: string, targets: object[]}} attack   flags.lotm.attack
 * @returns {object}
 */
function attackResultsData(attack) {
  const defenseKey = CONFIG.LORD_OF_THE_MYSTERIES.defenseTargets?.[attack.defenseTarget];
  return {
    defense: defenseKey ? game.i18n.localize(defenseKey) : attack.defenseTarget,
    targets: (attack.targets ?? []).map((target) => ({
      ...hitLook(target.hit),
      name: target.name,
      defense: target.defense,
      showDefense: game.user.isGM && isKnown(target.defense),
    })),
  };
}


/**
 * @param {boolean|null} hit   A target's hit check: null when it had no defense to check against.
 * @returns {{css: string, word: string}}  A HIT_LOOKS entry.
 */
function hitLook(hit) {
  if (!isKnown(hit)) return HIT_LOOKS.unknown;
  return hit ? HIT_LOOKS.hit : HIT_LOOKS.miss;
}
