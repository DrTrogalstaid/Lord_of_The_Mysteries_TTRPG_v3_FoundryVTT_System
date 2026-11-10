import StatusRule from "../status-rule.mjs";
import { rollStatusCheck, statusChat } from "../status-checks.mjs";
import { langHTML } from "../../helpers/render.mjs";

/** The Will check at the start of each turn; failing it is a 0/1 sanity check. */
const WILL_DC = 10;
/** The Will check to resist acting on the madness tendency. */
const RESIST_DC = 15;

/**
 * Semi-Out-of-Control (rulebook, Chapter 5: Falling into madness). Started by losing 3+ Sanity at once
 * (helpers/sanity.mjs), with system.roundsLeft = 1d2 and system.madness = a d8 madness tendency.
 *   - Writhing on the ground: no move actions (a warning with Use Anyway).
 *   - Using a Beyonder ability means a 1/1d2 sanity check (a note on action and spell rolls).
 *   - At the start of each of its turns: a Will check (DC 10), or a 0/1 sanity check.
 *   - Acting on its madness tendency can be resisted with a Will check (DC 15), from the Effects tab.
 *   - Counts down one round at the start of each of its turns in combat (onTurnStart) and ends after the last one.
 *     Out of combat the GM ends it with the Recovered button.
 */
export default class SemiOutOfControlRule extends StatusRule {

  /** The madness tendency's name ("" when it has none). */
  tendency(effect) {
    const key = CONFIG.LORD_OF_THE_MYSTERIES.madnessTendencies?.[effect.system?.madness];
    return key ? game.i18n.localize(key) : "";
  }


  /** Count down a round; after the last one it ends. @override */
  async onTurnStart(actor, effect) {
    const left = Number(effect.system?.roundsLeft) || 0;
    if (left <= 0) return this.endStatus(effect, { chat: "LORD_OF_THE_MYSTERIES.Status.Chat.Recovered" });
    await effect.update({ "system.roundsLeft": left - 1 });
  }


  /** @override */
  turnStart(actor, effect) {
    const left = Number(effect.system?.roundsLeft) || 0;
    const rounds = left > 0
      ? langHTML("LORD_OF_THE_MYSTERIES.Status.TurnStart.SemiRoundsLeft", { rounds: left })
      : langHTML("LORD_OF_THE_MYSTERIES.Status.TurnStart.SemiLastRound");
    return {
      text: this.text("LORD_OF_THE_MYSTERIES.Status.TurnStart.SemiOutOfControl", actor, effect, {
        dc: WILL_DC, tendency: this.tendency(effect), rounds,
      }),
      buttons: [{ check: "will", label: game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollWill", { dc: WILL_DC }) }],
    };
  }


  /** @override */
  async onTurnCheck(check, effect, { fast = false } = {}) {
    if (check !== "will") return false;
    return this.#rollWill(effect, { fast });
  }


  /** Will (DC 10) and Resist Madness (Will 15), for when there's no start-of-turn card (out of combat). @override */
  buttons(effect) {
    const buttons = super.buttons(effect);
    const button = (id, label, icon) => ({ statusId: this.id, id, label, icon });
    buttons.push(button("will", game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.RollWill", { dc: WILL_DC }), "fa-solid fa-brain"));
    buttons.push(button("resist", game.i18n.format("LORD_OF_THE_MYSTERIES.Status.Buttons.ResistMadness", { dc: RESIST_DC }), "fa-solid fa-shield-halved"));
    return buttons;
  }


  /** @override */
  async onButton(buttonId, effect) {
    if (buttonId === "will") return this.#rollWill(effect);
    if (buttonId === "resist") {
      const actor = effect.parent;
      const result = await rollStatusCheck(actor, {
        attribute: "wil", dc: RESIST_DC, reason: game.i18n.localize(this.name), outcome: this.outcomeFor("resist", effect),
      });
      if (result) await this.applyCheckResult("resist", effect, result.success);
      return;
    }
    return super.onButton(buttonId, effect);
  }


  /**
   * will:   failing means a 0/1 sanity check (the sanity check dialog opens). A pass Luck makes afterwards can't undo
   *         a sanity check that was already rolled, so that's left to the GM.
   * resist: says whether it resisted acting on its madness.
   * @override
   */
  async applyCheckResult(check, effect, success, { isLuckChange = false } = {}) {
    const actor = effect.parent;
    if (check === "will") {
      if (success) return !isLuckChange;
      const { openSanityCheck } = await import("../../helpers/sanity.mjs");
      await openSanityCheck(actor, { success: "0", failure: "1", reason: game.i18n.localize(this.name) });
      return true;
    }
    if (check === "resist") {
      const line = success ? "LORD_OF_THE_MYSTERIES.Status.Results.ResistedMadness" : "LORD_OF_THE_MYSTERIES.Status.Results.GaveInToMadness";
      await statusChat(actor, this.text(line, actor, effect, { tendency: this.tendency(effect) }));
      return true;
    }
    return false;
  }


  /** The start-of-turn Will check. */
  async #rollWill(effect, { fast = false } = {}) {
    const actor = effect.parent;
    const result = await rollStatusCheck(actor, {
      attribute: "wil", dc: WILL_DC, reason: game.i18n.localize(this.name), fast, outcome: this.outcomeFor("will", effect),
    });
    if (!result) return false;
    await this.applyCheckResult("will", effect, result.success);
    return true;
  }
}
