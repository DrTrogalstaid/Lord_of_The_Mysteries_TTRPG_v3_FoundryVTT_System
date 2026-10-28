import SkillCheckDialog from "../apps/skill-check-dialog.mjs";
import LOTM_VTTRoll from "../dice/lotm-roll.mjs";
import { calculateSkillModifier } from "./skill-modifiers.mjs";
import { effectiveSkillLevel } from "./skill-levels.mjs";
import { computeSkillCheckTotal, signedTerm } from "./skill-check-formula.mjs";
import { canFire, fireGun, gunFor } from "./firearms.mjs";

/**
 * Action rolls
 * ------------
 * The one place actions get rolled. Everything that rolls an action calls these:
 *   - the dice button on the character sheet (PlayerCharacterSheet.#onRollAction)
 *   - hotbar macros (rollItemMacro in lotm.mjs, through action.system.rollAttack())
 *   - the "Roll Damage" button on an action's attack message in chat
 *
 * The attack goes through SkillCheckDialog, the same dialog as a plain skill check,
 * so an action's attack bonus always matches the skill's bonus on the Character tab.
 *
 * The actor is passed in separately because an action granted by a Sequence, ability
 * or gear isn't always owned by the character directly, so action.actor can be empty.
 */

/* -------------------------------------------- */
/*  Skill lookup                                 */
/* -------------------------------------------- */

/**
 * Find the character's record of a skill: which category it's stored under and its level.
 * A skill dropped on gear may be the compendium copy or a world copy of the one on the character,
 * so it matches either. A skill the character has never touched is untrained, filed under the same
 * category a drop on the sheet would use (see PlayerCharacterSheet #dropSkill).
 * (Moved here from PlayerCharacterSheet._findSkillEntry so hotbar macros can use it too.)
 * @param {Actor} actor
 * @param {Item} skill
 * @param {string} skillUuid
 * @returns {{uuid: string, category: string, level: string}}
 */
export function findSkillEntry(actor, skill, skillUuid) {
  const ids = [skillUuid, skill.uuid, skill._stats?.compendiumSource].filter(Boolean);
  for (const [category, entries] of Object.entries(actor.system.skills ?? {})) {
    const entry = (entries ?? []).find((e) => ids.includes(e.skill));
    if (entry) return { uuid: entry.skill, category, level: entry.level };
  }
  const folders = CONFIG.LORD_OF_THE_MYSTERIES.skillCompendiumFolders ?? {};
  // (system.category used to be checked first here, but those are related-skill categories like "fighting",
  // never a tab, and the field is now system.categories.)
  const category = [skill.system.skill_attribute].find((key) => key && key in folders)
    ?? skill.system.skill_attribute;
  return { uuid: skillUuid, category, level: "untrained" };
}

/**
 * Everything SkillCheckDialog needs to know about the skill an action rolls with.
 * Used both to roll the action and to show its "+5" on the sheet, so the two always agree.
 * @param {Actor} actor
 * @param {Item} action
 * @returns {Promise<{skill: Item, uuid: string, category: string, level: string, attribute: string, flatModifier: number}|null>}
 *   null when the action has no skill, or its skill no longer exists.
 */
async function resolveActionSkill(actor, action) {
  const skillUuid = action.system.skill;
  if (!skillUuid) return null;

  const skill = await fromUuid(skillUuid).catch(() => null);
  if (!skill) return null;

  const { uuid, category } = findSkillEntry(actor, skill, skillUuid);
  // The level it's rolled at: the character's own, or higher if a related skill raises it
  // (Advanced Sword makes Melee Trained) or it has a starting level (Dodge). Same as the Character tab shows.
  const level = await effectiveSkillLevel(actor, uuid);
  return {
    skill,
    uuid,
    category,
    level,
    attribute: skill.system.skill_attribute || category,
    flatModifier: skill.system.modifier ?? 0,
  };
}

/**
 * The dice an action's attack rolls: its Attack Roll Macro when that's a valid formula, otherwise 1d20.
 * (The same rule as SkillCheckDialog #baseDie.)
 * @param {Item} action
 * @returns {string}
 */
export function getAttackDice(action) {
  const formula = action?.system.attackRollMacro?.trim() ?? "";
  if (!formula || formula.toLowerCase() === "na" || !Roll.validate(formula)) return "1d20";
  return formula;
}

/**
 * The action's own Attack Roll Macro, or "" when it has none. Blank and "na" both mean none.
 * Unlike getAttackDice there's no 1d20 fallback: an action with no skill needs a real formula to roll.
 * @param {Item} action
 * @returns {string}
 */
export function getAttackFormula(action) {
  const formula = action?.system.attackRollMacro?.trim() ?? "";
  return formula.toLowerCase() === "na" ? "" : formula;
}

/**
 * What the sheet's attack button shows for an action: the skill name and the bonus added to the dice.
 * The bonus is worked out exactly like the total in SkillCheckDialog before the player adds anything:
 *   attribute total + skill level bonus + the skill's own modifier + the action's Modifiers field
 * An action with no skill but its own Attack Roll Macro gets a plain "Roll" button instead
 * (see getUnskilledAttackSummary).
 * @param {Actor} actor
 * @param {Item} action
 * @returns {Promise<{label: string, bonus: number, bonusLabel: string, tooltip: string}|null>}
 *   null when there's nothing to roll with (no character, no skill or formula, or the skill is gone).
 */
export async function getActionAttackSummary(actor, action) {
  if (!actor) return null;
  if (!action.system.skill) return getUnskilledAttackSummary(actor, action);

  const info = await resolveActionSkill(actor, action);
  if (!info) return null;

  // The action's Modifiers field goes in as one modifier, the same way the dialog adds it.
  const actionModifier = Number(action.system.modifiers) || 0;
  const modifiers = actionModifier ? [{ id: "action", label: action.name, value: actionModifier }] : [];

  const bonus = computeSkillCheckTotal({
    attrTotal: actor.system.attributes[info.attribute]?.total ?? 0,
    levelBonus: calculateSkillModifier(info.level, 0),
    flatModifier: info.flatModifier,
    modifiers,
  });

  // "+5", "+0" or "-2"
  const bonusLabel = bonus < 0 ? `${bonus}` : `+${bonus}`;
  return {
    label: info.skill.name,
    bonus,
    bonusLabel,
    // Hover text, e.g. "1d20 + 5"
    tooltip: `${getAttackDice(action)} ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`,
  };
}

/**
 * The attack button for an action with no skill: "Roll", plus the action's Modifiers field when it has one.
 * @param {Actor} actor
 * @param {Item} action
 * @returns {{label: string, bonus: number, bonusLabel: string, tooltip: string}|null}
 *   null when the action has no Attack Roll Macro either, so there's nothing to roll.
 */
function getUnskilledAttackSummary(actor, action) {
  const formula = getAttackFormula(action);
  if (!formula) return null;

  const bonus = Number(action.system.modifiers) || 0;
  // Hover text with @values filled in from the character, e.g. "1d20 +3[AGI]", like the damage button's.
  const filled = Roll.replaceFormulaData(formula, actor.getRollData(), { missing: "0" });
  return {
    label: game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Roll"),
    bonus,
    // Only show a bonus when the action adds one; the formula itself already has its own terms.
    bonusLabel: bonus ? signedTerm(bonus) : "",
    tooltip: bonus ? `${filled} ${signedTerm(bonus)}` : filled,
  };
}

/* -------------------------------------------- */
/*  Attack                                       */
/* -------------------------------------------- */

/**
 * What every action attack adds to its chat message: which action/character it was (for the
 * damage button), and the "Roll Damage" button itself when the action has a damage formula.
 * @param {Actor} actor
 * @param {Item} action
 * @returns {{flags: object, footer: string}}
 */
function actionChatExtras(actor, action) {
  return {
    flags: { lotm: { actionUuid: action.uuid, actorUuid: actor.uuid } },
    footer: getDamageFormula(action) ? damageButtonHTML() : "",
  };
}

/**
 * Roll an action's attack. With a skill: opens SkillCheckDialog, which adds the action's
 * Attack Roll Macro, its Modifiers field, and the "Roll Damage" button. Without a skill:
 * rolls the Attack Roll Macro straight away (rollActionWithoutSkill below).
 *
 * Actions set to "Fires rounds" (system.ammoUse, see helpers/firearms.mjs) also use up ammo:
 *   - before rolling, the gun must have the rounds ready, otherwise nothing is rolled ("Click. Revolver is empty.")
 *   - the rounds are only taken out once the attack is actually rolled, so closing the dialog costs nothing.
 * @param {Actor} actor   The character rolling.
 * @param {Item} action   The action item.
 * @param {object} [options]
 * @param {string} [options.gunId]  The gun the action came from (set by the character sheet for actions listed
 *                                  under a gun). Without it, the gun in the character's hand is used.
 * @returns {Promise<Roll|null>}  The roll, or null if it was cancelled or couldn't happen.
 */
export async function rollActionAttack(actor, action, { gunId } = {}) {
  if (!actor) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.NoActor", { name: action.name }));
    return null;
  }

  // Not a gun shot: just roll.
  if (action.system.ammoUse !== "fire") return rollAttackDice(actor, action);

  // A gun shot. No rounds ready = no roll.
  const gun = gunFor(actor, gunId);
  const amount = Math.max(1, action.system.ammoAmount ?? 0);
  if (!gun || !canFire(gun, amount)) return null;

  const roll = await rollAttackDice(actor, action);
  if (roll) await fireGun(actor, gun, { amount });   // null = the dialog was closed, so nothing was fired
  return roll;
}

/**
 * The attack roll itself, with or without a skill (no ammo handling: that's in rollActionAttack above).
 * @param {Actor} actor
 * @param {Item} action
 * @returns {Promise<Roll|null>}
 */
async function rollAttackDice(actor, action) {
  if (!action.system.skill) return rollActionWithoutSkill(actor, action);

  const info = await resolveActionSkill(actor, action);
  if (!info) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.ActionSkill.Missing", { name: action.name }));
    return null;
  }

  return SkillCheckDialog.prompt(actor, {
    uuid: info.uuid,
    name: info.skill.name,
    category: info.category,
    attribute: info.attribute,
    level: info.level,
    flatModifier: info.flatModifier,
    // The action item itself. The dialog reads its fields straight from action.system.
    action,
    // Added to the chat message: the flags and "Roll Damage" button (see actionChatExtras).
    chat: actionChatExtras(actor, action),
  });
}

/**
 * Roll an action that has no skill: its Attack Roll Macro (e.g. "1d20 +@attributes.agi.total[AGI]")
 * plus its Modifiers field. There's no skill to set up, so there's no dialog: it rolls right away.
 * @param {Actor} actor
 * @param {Item} action
 * @returns {Promise<Roll|null>}
 */
async function rollActionWithoutSkill(actor, action) {
  const baseFormula = getAttackFormula(action);
  if (!baseFormula || !Roll.validate(baseFormula)) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.InvalidAttack", { name: action.name }));
    return null;
  }

  // Add the Modifiers field as a labelled N[Label] term, the same style skill checks use,
  // so it gets its own row in the chat card's breakdown.
  const modifier = Number(action.system.modifiers) || 0;
  const formula = modifier ? `${baseFormula} ${signedTerm(modifier)}[${action.name}]` : baseFormula;

  const roll = await new LOTM_VTTRoll(formula, actor.getRollData()).evaluate();

  const chat = actionChatExtras(actor, action);
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: Handlebars.escapeExpression(action.name) + chat.footer,
    flags: chat.flags,
    rollMode: game.settings.get("core", "rollMode"),
  });
  return roll;
}

/* -------------------------------------------- */
/*  Damage                                       */
/* -------------------------------------------- */

/**
 * The action's damage formula, or "" when it has none. Blank and "na" both mean none,
 * the same as SkillCheckDialog treats the Attack Roll Macro.
 * @param {Item} action
 * @returns {string}
 */
export function getDamageFormula(action) {
  const formula = action?.system.damageRollMacro?.trim() ?? "";
  return formula.toLowerCase() === "na" ? "" : formula;
}

/**
 * The action's damage type as a readable name. The field is free text, so:
 *   "fire" (a key in CONFIG.LORD_OF_THE_MYSTERIES.damageTypes) -> "Fire" in the user's language
 *   anything else ("piercing")                                 -> shown as typed
 * @param {Item} action
 * @returns {string}  "" when the action has no damage type.
 */
export function getDamageTypeLabel(action) {
  const type = action?.system.damageType?.trim() ?? "";
  if (!type) return "";
  const key = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes?.[type.toLowerCase()];
  return key ? game.i18n.localize(key) : type;
}

/**
 * What the sheet's Damage button shows on hover, e.g. "2d6+3 Fire".
 * Values like @str are filled in from the character, so the player sees the real numbers.
 * @param {Actor} actor   The character whose sheet this is (can be empty, then @values stay as typed).
 * @param {Item} action
 * @returns {string}  "" when the action has no damage formula (the sheet then hides the button).
 */
export function getDamageTooltip(actor, action) {
  let formula = getDamageFormula(action);
  if (!formula) return "";

  if (actor) {
    // missing: "0" means an @value the character doesn't have counts as 0, same as when it's rolled.
    formula = Roll.replaceFormulaData(formula, actor.getRollData(), { missing: "0" });
  }

  const type = getDamageTypeLabel(action);
  return type ? `${formula} ${type}` : formula;
}

/**
 * Roll an action's damage from its Damage Roll Macro and post it to chat.
 * @param {Actor} actor
 * @param {Item} action
 * @returns {Promise<Roll|null>}
 */
export async function rollActionDamage(actor, action) {
  if (!actor) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.NoActor", { name: action.name }));
    return null;
  }

  const formula = getDamageFormula(action);
  if (!formula || !Roll.validate(formula)) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.InvalidDamage", { name: action.name }));
    return null;
  }

  const roll = await new LOTM_VTTRoll(formula, actor.getRollData()).evaluate();

  const damageType = getDamageTypeLabel(action);
  const flavor = game.i18n.format("LORD_OF_THE_MYSTERIES.Action.DamageFlavor", {
    action: Handlebars.escapeExpression(action.name),
    type: damageType ? ` (${Handlebars.escapeExpression(damageType)})` : "",
  });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: { lotm: { actionUuid: action.uuid, actorUuid: actor.uuid } },
    rollMode: game.settings.get("core", "rollMode"),
  });
  return roll;
}

/* -------------------------------------------- */
/*  "Roll Damage" button in chat                 */
/* -------------------------------------------- */

/**
 * HTML for the button SkillCheckDialog adds under an action's attack roll.
 * @returns {string}
 */
export function damageButtonHTML() {
  const label = game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.RollDamage");
  return `<button type="button" class="lotm-roll-damage" data-lotm-action="damage">${label}</button>`;
}

/** Make the "Roll Damage" button work. Called once from the init hook in lotm.mjs. */
export function registerActionChatListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const button = html.querySelector("button[data-lotm-action='damage']");
    if (!button) return;

    html.querySelector(".message-content")?.append(button);

    button.addEventListener("click", async () => {
      // SkillCheckDialog saved which action and character this attack was for.
      const actionUuid = message.getFlag("lotm", "actionUuid");
      const actorUuid = message.getFlag("lotm", "actorUuid");
      const [action, actor] = await Promise.all([
        fromUuid(actionUuid).catch(() => null),
        fromUuid(actorUuid).catch(() => null),
      ]);

      if (!action || !actor) {
        ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.Gone"));
        return;
      }
      // Only the character's owners (and the GM) can roll its damage.
      if (!actor.isOwner) return;

      await rollActionDamage(actor, action);
    });
  });
}
