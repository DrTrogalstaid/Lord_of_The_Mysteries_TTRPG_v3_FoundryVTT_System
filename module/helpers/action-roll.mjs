import SkillCheckDialog from "../apps/skill-check-dialog.mjs";
import LOTM_VTTRoll from "../dice/lotm-roll.mjs";

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
  const category = [skill.system.category, skill.system.skill_attribute].find((key) => key && key in folders)
    ?? skill.system.skill_attribute;
  return { uuid: skillUuid, category, level: "untrained" };
}

/* -------------------------------------------- */
/*  Attack                                       */
/* -------------------------------------------- */

/**
 * Roll an action's attack: opens SkillCheckDialog for the action's skill.
 * The dialog adds the action's Attack Roll Macro, its Modifiers field, and the "Roll Damage" button.
 * @param {Actor} actor   The character rolling.
 * @param {Item} action   The action item.
 * @returns {Promise<Roll|null>}  The roll, or null if it was cancelled or couldn't happen.
 */
export async function rollActionAttack(actor, action) {
  if (!actor) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.NoActor", { name: action.name }));
    return null;
  }

  const skillUuid = action.system.skill;
  if (!skillUuid) return null; // no skill set: the sheet doesn't show a dice button for these

  const skill = await fromUuid(skillUuid).catch(() => null);
  if (!skill) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.ActionSkill.Missing", { name: action.name }));
    return null;
  }

  const { uuid, category, level } = findSkillEntry(actor, skill, skillUuid);
  return SkillCheckDialog.prompt(actor, {
    uuid,
    name: skill.name,
    category,
    attribute: skill.system.skill_attribute || category,
    level,
    flatModifier: skill.system.modifier ?? 0,
    // The action item itself. The dialog reads its fields straight from action.system.
    action,
    // Added to the chat message: which action/character this was (for the damage button),
    // and the "Roll Damage" button itself when the action has a damage formula.
    chat: {
      flags: { lotm: { actionUuid: action.uuid, actorUuid: actor.uuid } },
      footer: getDamageFormula(action) ? damageButtonHTML() : "",
    },
  });
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

  const damageType = action.system.damageType?.trim();
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
