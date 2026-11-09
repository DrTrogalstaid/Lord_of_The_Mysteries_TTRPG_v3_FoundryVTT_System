/**
 * Hover text for skills on the player and NPC sheets: why a skill rolls higher than the player's pick (Sequence,
 * effects, related skills), and its bonuses from effects.
 */

import { skillBonusRowsFor } from "../../helpers/check-bonuses.mjs";

/**
 * Hover text for a skill that active effects raise: "Effects: Eagle Eye (+1, at most Advanced), Focus (+1)".
 * Used by the player and NPC sheets' skill lists.
 * @param {{value: number, maxLevel: string, name: string}[]} raises   actor.system.effectSkillRaises[uuid]
 * @param {(level: string) => string} levelLabel
 * @returns {string}
 */
export function effectRaiseText(raises, levelLabel) {
  const parts = (raises ?? []).map((raise) => {
    const detail = raise.maxLevel
      ? game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.EffectStepsCapped", { steps: raise.value, level: levelLabel(raise.maxLevel) })
      : game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.EffectSteps", { steps: raise.value });
    return `${raise.name} (${detail})`;
  });
  return game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.RaisedByEffects", { sources: parts.join(", ") });
}


/**
 * Hover text for a skill rolled higher than the player's pick: "Sequence: +1 level(s) · Effects: ... · Rolled at
 * Trained, raised by Sword (Advanced)". Empty when nothing raised it. Used by the player and NPC sheets.
 * @param {object} record   The skill's record (actor.system.skills[key]).
 * @param {(level: string) => string} levelLabel
 * @returns {string}
 */
export function skillRaiseText(record, levelLabel) {
  if (!record || record.effectiveLevel === record.ownLevel) return "";
  const reasons = [];
  if (record.sequenceSteps > 0) {
    reasons.push(game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.RaisedBySequence", { steps: record.sequenceSteps }));
  }
  if (record.boostedByEffects) reasons.push(effectRaiseText(record.effectRaises, levelLabel));
  const associated = record.associated;
  if (associated?.raised) {
    reasons.push(game.i18n.format("LORD_OF_THE_MYSTERIES.SkillAssociation.RaisedBy", {
      level: levelLabel(associated.level),
      sources: associated.sources.map((source) => `${source.name} (${levelLabel(source.level)})`).join(", "),
    }));
  }
  return reasons.join(" · ");
}


/**
 * Hover text for a skill's number: "Click to roll", and its bonuses from effects when it has any
 * ("Bonuses: Marksman's Focus +2, Drill (Firearms) +1"). Used by the player and NPC sheets.
 * @param {Actor} actor
 * @param {string} key   The skill's key.
 * @returns {string}
 */
export function skillRollTooltip(actor, key) {
  const roll = game.i18n.localize("LORD_OF_THE_MYSTERIES.SkillCheck.RollTooltip");
  const rows = skillBonusRowsFor(actor, key);
  if (!rows.length) return roll;
  const signed = (n) => (n < 0 ? `${n}` : `+${n}`);
  const list = rows.map((row) => `${row.label} ${signed(row.value)}`).join(", ");
  return `${roll} · ${game.i18n.format("LORD_OF_THE_MYSTERIES.SkillBonuses.Tooltip", { list })}`;
}
