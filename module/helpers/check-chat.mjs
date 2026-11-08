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

const escape = (text) => Handlebars.escapeExpression(text ?? "");


export function registerCheckChatListeners() {
  // A Sanity check's loss was rolled (by anyone): redraw the check so its Roll Loss button greys out everywhere.
  Hooks.on("createChatMessage", (message) => {
    const source = game.messages.get(message.getFlag("lotm", "sanityLoss")?.sourceId ?? "");
    if (source) ui.chat?.updateMessage?.(source);
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
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

    // Hit or miss, above the roll (the part that expands to show the dice), so it reads with the card's other text.
    const attack = message.getFlag("lotm", "attack");
    if (attack) {
      const block = document.createElement("div");
      block.classList.add("lotm", "chat-attack-results");
      block.innerHTML = attackResultsHTML(attack);
      const roll = content.querySelector(".dice-roll");
      if (roll) roll.before(block);
      else content.prepend(block);
    }

    // Big Success: only offered on a natural 20.
    if (check.natural === 20) {
      html.querySelector('button[data-lotm-action="damage"]')?.remove();
      html.querySelector('button[data-lotm-action="bigSuccess"]')?.classList.add("is-natural");
    }
    else if (typeof check.natural === "number") {
      html.querySelector('button[data-lotm-action="bigSuccess"]')?.remove();
    }

    // Roll Outcome (once per roll).
    if (canRollOutcome(message)) {
      const holder = document.createElement("div");
      holder.classList.add("lotm-outcome-buttons");
      holder.innerHTML = `<button type="button" class="lotm-roll-outcome" data-tooltip="${escape(game.i18n.localize("LORD_OF_THE_MYSTERIES.Outcome.ButtonHint"))}">`
        + `<i class="fa-solid fa-table-list"></i> ${game.i18n.localize("LORD_OF_THE_MYSTERIES.Outcome.Button")}</button>`;
      const button = holder.querySelector("button");
      if (message.getFlag("lotm", "outcomeRolled")) button.disabled = true;
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const posted = await rollOutcome(message);
        if (!posted && !message.getFlag("lotm", "outcomeRolled")) button.disabled = false;
      });
      content.append(holder);
    }

    // Roll Loss on a Sanity check (once per check, like Roll Outcome).
    if (canRollSanityLoss(message)) {
      const holder = document.createElement("div");
      holder.classList.add("lotm-sanity-loss-buttons");
      holder.innerHTML = `<button type="button" class="lotm-roll-sanity-loss" data-tooltip="${escape(game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.RollLossHint"))}">`
        + `<i class="fa-solid fa-brain"></i> ${game.i18n.localize("LORD_OF_THE_MYSTERIES.Sanity.RollLoss")}</button>`;
      const button = holder.querySelector("button");
      if (sanityLossMessage(message)) button.disabled = true;
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const posted = await rollSanityLoss(message);
        if (!posted && !sanityLossMessage(message)) button.disabled = false;
      });
      content.append(holder);
    }

    // Burn Luck.
    if (luckBurners(message).length) {
      const holder = document.createElement("div");
      holder.classList.add("lotm-luck-buttons");
      holder.innerHTML = `<button type="button" class="lotm-burn-luck" data-tooltip="${escape(game.i18n.localize("LORD_OF_THE_MYSTERIES.Luck.BurnHint"))}">`
        + `<i class="fa-solid fa-clover"></i> ${game.i18n.localize("LORD_OF_THE_MYSTERIES.Luck.Burn")}</button>`;
      holder.querySelector("button").addEventListener("click", (event) => {
        event.preventDefault();
        openBurnLuckDialog(message);
      });
      content.append(holder);
    }
  });
}


/**
 * The hit check's list: "vs. Physical Defense", then one row per target.
 * @param {{defenseTarget: string, targets: object[]}} attack
 * @returns {string}  HTML.
 */
function attackResultsHTML(attack) {
  const defenseKey = CONFIG.LORD_OF_THE_MYSTERIES.defenseTargets?.[attack.defenseTarget];
  const against = game.i18n.format("LORD_OF_THE_MYSTERIES.Attack.Against", {
    defense: escape(defenseKey ? game.i18n.localize(defenseKey) : attack.defenseTarget),
  });
  if (!attack.targets?.length) {
    return `<p class="attack-against">${against}</p><p class="hint">${game.i18n.localize("LORD_OF_THE_MYSTERIES.Attack.NoTargets")}</p>`;
  }

  const rows = attack.targets.map((target) => {
    const known = target.hit !== null && target.hit !== undefined;
    const css = known ? (target.hit ? "is-hit" : "is-miss") : "";
    const word = known
      ? game.i18n.localize(`LORD_OF_THE_MYSTERIES.Attack.${target.hit ? "Hit" : "Miss"}`)
      : game.i18n.localize("LORD_OF_THE_MYSTERIES.Attack.Unknown");
    const defense = (game.user.isGM && target.defense !== null && target.defense !== undefined)
      ? ` <span class="attack-defense" data-tooltip="${escape(game.i18n.localize("LORD_OF_THE_MYSTERIES.Attack.DefenseHint"))}">(${target.defense})</span>`
      : "";
    return `<li class="${css}"><span class="attack-target">${escape(target.name)}</span>`
      + `<span class="attack-result">${word}${defense}</span></li>`;
  }).join("");
  return `<p class="attack-against">${against}</p><ul class="attack-targets">${rows}</ul>`;
}
