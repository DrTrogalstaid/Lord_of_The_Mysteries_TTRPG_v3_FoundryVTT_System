import StatusRule from "../status-rule.mjs";
import { statusChat } from "../status-checks.mjs";

/**
 * Indeterminate Madness (rulebook, Chapter 5: Falling into Uncertain Madness). On while Sanity is below half its
 * maximum (rounded up), off again once it's back to half or more (helpers/sanity.mjs keeps it in step).
 *   - A madness symptom (d8) is rolled when it starts, and every 12 hours after (Roll Symptom on the Effects tab).
 *     The effect is named after it, e.g. "Indeterminate Madness: Paranoia". No outward signs: it's played.
 *   - Every 24 hours a 0/1 sanity check (Daily Check on the Effects tab).
 *   - Sleep no longer restores Sanity (Long Rest skips its +1 Sanity, sheets/player-character-sheet.mjs).
 *   - The second-personality rules (a week in it, or under 3 Sanity) are left to the GM.
 */
export default class IndeterminateMadnessRule extends StatusRule {

  /** Starting it rolls its first symptom. @override */
  async onApplied(effect) {
    if (effect.parent?.documentName !== "Actor") return;
    await this.rollSymptom(effect);
  }


  /**
   * Roll a madness symptom (d8), name the effect after it, and say so to the owners and the GM.
   * @param {ActiveEffect} effect
   */
  async rollSymptom(effect) {
    const actor = effect.parent;
    const { rollMadnessTendency } = await import("../../helpers/sanity.mjs");
    const symptom = await rollMadnessTendency();
    await effect.update({ name: `${game.i18n.localize(this.name)}: ${symptom.label}`, "system.madness": symptom.value });
    await statusChat(actor, this.text("LORD_OF_THE_MYSTERIES.Status.Results.MadnessSymptom", actor, effect, {
      symptom: Handlebars.escapeExpression(symptom.label),
    }));
  }


  /** @override */
  buttons(effect) {
    const buttons = super.buttons(effect);
    const button = (id, label, icon) => ({ statusId: this.id, id, label, icon });
    buttons.push(button("symptom", game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.Buttons.RollSymptom"), "fa-solid fa-dice-d6"));
    buttons.push(button("daily", game.i18n.localize("LORD_OF_THE_MYSTERIES.Status.Buttons.DailySanity"), "fa-solid fa-brain"));
    return buttons;
  }


  /** @override */
  async onButton(buttonId, effect) {
    if (buttonId === "symptom") return this.rollSymptom(effect);
    if (buttonId === "daily") {
      const { openSanityCheck } = await import("../../helpers/sanity.mjs");
      return openSanityCheck(effect.parent, { success: "0", failure: "1", reason: game.i18n.localize(this.name) });
    }
    return super.onButton(buttonId, effect);
  }
}
