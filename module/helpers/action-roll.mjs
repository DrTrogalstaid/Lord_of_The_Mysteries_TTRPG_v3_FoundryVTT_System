import SkillCheckDialog from "../apps/skill-check-dialog.mjs";
import ActionRollDialog from "../apps/action-roll-dialog.mjs";
import LOTM_VTTRoll from "../dice/lotm-roll.mjs";
import { calculateSkillModifier } from "./skill-modifiers.mjs";
import { effectiveSkillLevel } from "./skill-levels.mjs";
import { computeSkillCheckTotal, signedTerm } from "./skill-check-formula.mjs";
import { canFire, fireGun, gunFor } from "./firearms.mjs";
import { postRoll } from "./message-modes.mjs";

/**
 * Action rolls
 * ------------
 * The one place actions get rolled. Everything that rolls an action calls these:
 *   - the dice button on the actor sheets (#onRollAction in sheets/base-actor-sheet.mjs)
 *   - hotbar macros (rollItemMacro in lotm.mjs, through action.system.rollAttack())
 *   - the "Roll Damage" and "Big Success" buttons on an action's attack message in chat
 *
 * The attack goes through SkillCheckDialog, the same dialog as a plain skill check,
 * so an action's attack bonus always matches the skill's bonus on the Character tab.
 * An action with no skill goes through ActionRollDialog. Both are built on LotmRollDialog (apps/roll-dialog.mjs).
 * Damage has no dialog: it rolls straight away, and its chat message gets Damage / Heal buttons
 * that change the selected tokens' Health, after their damage reduction (applyDamageFromMessage below).
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

/** The skill a spell rolls with when its Skill slot is empty, looked up by name if the configured UUID is gone. */
const SPELL_SKILL_NAME = "Occultism";

/** The default spell skill's UUID once it's been found (a promise, so lookups at the same moment share one). */
let spellSkillLookup = null;

/**
 * The skill spells roll with when their Skill slot is empty: CONFIG.LORD_OF_THE_MYSTERIES.spellSkillUuid
 * (Occultism in the Skills compendium). If that UUID doesn't lead to a skill (the compendium's Occultism was
 * replaced, so it has a new id), the Skills compendium is searched for a skill named Occultism instead.
 * @returns {Promise<string>}  The skill's UUID, or "" when there's no Occultism skill at all.
 */
export function defaultSpellSkillUuid() {
  spellSkillLookup ??= (async () => {
    const configured = CONFIG.LORD_OF_THE_MYSTERIES.spellSkillUuid;
    const found = configured ? await fromUuid(configured).catch(() => null) : null;
    if (found?.type === "skill") return configured;

    const pack = game.packs?.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
    const index = await pack?.getIndex();
    const entry = index?.find((e) => e.name?.toLowerCase() === SPELL_SKILL_NAME.toLowerCase());
    if (!entry) {
      console.warn(`Lord of the Mysteries | No "${SPELL_SKILL_NAME}" skill found, so spells without a skill can't roll with it.`);
    }
    return entry?.uuid ?? "";
  })();
  return spellSkillLookup;
}

/**
 * The skill an action or spell rolls with: its Skill slot, or for a spell with an empty slot, Occultism
 * (defaultSpellSkillUuid). "" = no skill (an action that rolls only its own formula).
 * @param {Item} item  An action or spell.
 * @returns {Promise<string>}  A skill Item's UUID, or "".
 */
export async function rollSkillUuid(item) {
  const own = item?.system?.skill;
  if (own) return own;
  return item?.type === "spell" ? defaultSpellSkillUuid() : "";
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
  const skillUuid = await rollSkillUuid(action);
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
  if (!(await rollSkillUuid(action))) return getUnskilledAttackSummary(actor, action);

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
 * @param {boolean} [options.fast]  Shift-click: roll right away with the dialog's defaults, without showing it.
 * @returns {Promise<Roll|null>}  The roll, or null if it was cancelled or couldn't happen.
 */
export async function rollActionAttack(actor, action, { gunId, fast = false } = {}) {
  if (!actor) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.NoActor", { name: action.name }));
    return null;
  }

  // Not a gun shot: just roll.
  if (action.system.ammoUse !== "fire") return rollAttackDice(actor, action, { fast });

  // A gun shot. No rounds ready = no roll.
  const gun = gunFor(actor, gunId);
  const amount = Math.max(1, action.system.ammoAmount ?? 0);
  if (!gun || !canFire(gun, amount)) return null;

  const roll = await rollAttackDice(actor, action, { fast });
  if (roll) await fireGun(actor, gun, { amount });   // null = the dialog was closed, so nothing was fired
  return roll;
}

/**
 * The attack roll itself, with or without a skill (no ammo handling: that's in rollActionAttack above).
 * @param {Actor} actor
 * @param {Item} action
 * @param {object} [options]
 * @param {boolean} [options.fast]  Shift-click: skip the dialog.
 * @returns {Promise<Roll|null>}
 */
async function rollAttackDice(actor, action, { fast = false } = {}) {
  if (!(await rollSkillUuid(action))) return rollActionWithoutSkill(actor, action, { fast });

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
    // Added to the chat message: the flags and damage buttons (see actionChatExtras).
    chat: actionChatExtras(actor, action),
  }, { fast });
}

/**
 * Roll an action that has no skill: its Attack Roll Macro (e.g. "1d20 +@attributes.agi.total[AGI]")
 * plus its Modifiers field, through ActionRollDialog (the same roll dialog as everything else, so it has
 * modifiers, the who-sees-it buttons and the Spirituality checkbox).
 * @param {Actor} actor
 * @param {Item} action
 * @param {object} [options]
 * @param {boolean} [options.fast]  Shift-click: skip the dialog.
 * @returns {Promise<Roll|null>}
 */
async function rollActionWithoutSkill(actor, action, { fast = false } = {}) {
  const formula = getAttackFormula(action);
  if (!formula || !Roll.validate(formula)) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.InvalidAttack", { name: action.name }));
    return null;
  }
  return ActionRollDialog.prompt(actor, action, formula, { chat: actionChatExtras(actor, action), fast });
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
 * The key in CONFIG.LORD_OF_THE_MYSTERIES.damageTypes for some text: "fire", "Fire" and the translated name all
 * give "fire". null when the text isn't a damage type (e.g. a label like "2d6[Explosion]").
 * @param {string} text
 * @returns {string|null}
 */
export function damageTypeKey(text) {
  const value = String(text ?? "").trim().toLowerCase();
  if (!value) return null;
  const types = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes ?? {};
  if (value in types) return value;
  return Object.keys(types).find((key) => game.i18n.localize(types[key]).toLowerCase() === value) ?? null;
}

/**
 * A damage type as a readable name: a key ("fire") in the user's language, anything else as typed.
 * @param {string} type
 * @returns {string}  "" for no type.
 */
export function damageTypeName(type) {
  if (!type) return "";
  const key = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes?.[type];
  return key ? game.i18n.localize(key) : type;
}

/**
 * The action's own Damage Type: a damageTypes key when it is one, otherwise the text as typed ("piercing").
 * @param {Item} action
 * @returns {string}  "" when it has none.
 */
function defaultDamageType(action) {
  const text = action?.system.damageType?.trim() ?? "";
  return damageTypeKey(text) ?? text;
}

/**
 * The action's damage type as a readable name. The field is free text, so:
 *   "fire" (a key in CONFIG.LORD_OF_THE_MYSTERIES.damageTypes) -> "Fire" in the user's language
 *   anything else ("piercing")                                 -> shown as typed
 * @param {Item} action
 * @returns {string}  "" when the action has no damage type.
 */
export function getDamageTypeLabel(action) {
  return damageTypeName(defaultDamageType(action));
}

/**
 * Whether a damage formula names a damage type itself, like "2d6[fire] + 1d4[cold]".
 * @param {string} formula
 * @returns {boolean}
 */
function formulaNamesTypes(formula) {
  return [...formula.matchAll(/\[([^\]]+)\]/g)].some((match) => damageTypeKey(match[1]));
}

/**
 * How much of each damage type a damage roll did.
 *
 * Every part of the formula is the type it names in brackets ("2d6[fire]"), or the action's Damage Type
 * when it doesn't name one. So "2d6[fire] + 1d4 + 3" on an action set to Physical is fire for the 2d6 and
 * physical for the rest. A formula that multiplies or divides can't be split up, so all of it is the action's type.
 *
 * @param {Roll} roll            An evaluated damage roll.
 * @param {string} defaultType   The action's Damage Type (see defaultDamageType). "" = untyped.
 * @returns {{type: string, label: string, amount: number}[]}  One row per type, in the order they first appear.
 */
export function damageByType(roll, defaultType = "") {
  const whole = [{ type: defaultType, label: damageTypeName(defaultType), amount: roll.total }];
  const OperatorTerm = foundry.dice?.terms?.OperatorTerm;

  const totals = new Map();
  let sign = 1;
  for (const term of roll.terms ?? []) {
    if (OperatorTerm && term instanceof OperatorTerm) {
      if (term.operator === "+") sign = 1;
      else if (term.operator === "-") sign = -1;
      else return whole;
      continue;
    }
    const value = Number(term.total);
    if (!Number.isFinite(value)) continue;
    const type = damageTypeKey(term.flavor) ?? defaultType;
    totals.set(type, (totals.get(type) ?? 0) + sign * value);
  }

  const rows = [...totals].map(([type, amount]) => ({ type, label: damageTypeName(type), amount }));
  const sum = rows.reduce((total, row) => total + row.amount, 0);
  // Anything that didn't add up (an unusual formula): don't guess, use the action's type for all of it.
  return rows.length && sum === roll.total ? rows : whole;
}

/**
 * What the sheet's Damage button shows on hover, e.g. "2d6+3 Fire".
 * A formula that names its own types ("2d6[fire] + 1d4[cold]") shows just the formula, since the types are in it.
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
  return (type && !formulaNamesTypes(formula)) ? `${formula} ${type}` : formula;
}

/**
 * The average of a roll formula: halfway between its lowest and highest result, rounded down
 * (2d6+3 -> 10, 1d8 -> 4). @values are filled in from the actor first, so "1d8+@damageBonus" works too.
 * @param {string} formula
 * @param {object} rollData
 * @returns {Promise<number>}
 */
export async function averageRoll(formula, rollData) {
  const [low, high] = await Promise.all([
    new Roll(formula, rollData).evaluate({ minimize: true }),
    new Roll(formula, rollData).evaluate({ maximize: true }),
  ]);
  return Math.floor((low.total + high.total) / 2);
}

/**
 * The average of a damage formula, per damage type (see damageByType): halfway between each type's lowest and
 * highest result, rounded down. "2d6[fire] + 1d4[cold]" -> 7 fire, 2 cold.
 * @param {string} formula
 * @param {object} rollData
 * @param {string} defaultType  The action's Damage Type, for parts that don't name one.
 * @returns {Promise<{type: string, label: string, amount: number}[]>}
 */
export async function averageByType(formula, rollData, defaultType = "") {
  const [low, high] = await Promise.all([
    new LOTM_VTTRoll(formula, rollData).evaluate({ minimize: true }),
    new LOTM_VTTRoll(formula, rollData).evaluate({ maximize: true }),
  ]);
  const highByType = new Map(damageByType(high, defaultType).map((part) => [part.type, part.amount]));
  return damageByType(low, defaultType).map((part) => ({
    ...part,
    amount: Math.floor((part.amount + (highByType.get(part.type) ?? part.amount)) / 2),
  }));
}

/**
 * Roll an action's damage from its Damage Roll Macro and post it to chat.
 *
 * The message gets "Damage" and "Heal" buttons that apply the amount to the selected tokens
 * (applyDamageFromMessage below). The amount, and how much of it is each damage type, is saved on the message
 * (flags.lotm.damage). Damage types: see damageByType; a roll with more than one gets a line like "5 Fire · 3 Cold".
 *
 * Big Success: the damage is never less than the formula's average. If the roll comes out lower,
 * the average is used instead, and the message says so.
 *
 * @param {Actor} actor
 * @param {Item} action
 * @param {object} [options]
 * @param {boolean} [options.bigSuccess]  Roll as a Big Success (the "Big Success" button on the attack's message).
 * @returns {Promise<Roll|null>}
 */
export async function rollActionDamage(actor, action, { bigSuccess = false } = {}) {
  if (!actor) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.NoActor", { name: action.name }));
    return null;
  }

  const formula = getDamageFormula(action);
  if (!formula || !Roll.validate(formula)) {
    ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.InvalidDamage", { name: action.name }));
    return null;
  }

  const rollData = actor.getRollData();
  const roll = await new LOTM_VTTRoll(formula, rollData).evaluate();

  // The amount the Damage / Heal buttons apply.
  // How much of it is each damage type (see damageByType).
  const defaultType = defaultDamageType(action);
  let parts = damageByType(roll, defaultType);
  let amount = roll.total;
  let note = "";
  if (bigSuccess) {
    // Below the average: every type is raised to its own average, so damage reduction still sees each type.
    const averages = await averageByType(formula, rollData, defaultType);
    const average = averages.reduce((total, part) => total + part.amount, 0);
    const raised = roll.total < average;
    if (raised) {
      parts = averages;
      amount = average;
    }
    const key = raised ? "LORD_OF_THE_MYSTERIES.Action.BigSuccessRaised" : "LORD_OF_THE_MYSTERIES.Action.BigSuccessKept";
    note = `<div class="lotm chat-big-success"><i class="fa-solid fa-star"></i> ${game.i18n.format(key, { rolled: roll.total, average })}</div>`;
  }

  // The types' names for the title ("Shoot: Damage (Fire, Cold)").
  const typeNames = parts.map((part) => part.label).filter(Boolean);
  const flavor = game.i18n.format(
    bigSuccess ? "LORD_OF_THE_MYSTERIES.Action.BigSuccessFlavor" : "LORD_OF_THE_MYSTERIES.Action.DamageFlavor",
    {
      action: Handlebars.escapeExpression(action.name),
      type: typeNames.length ? ` (${Handlebars.escapeExpression(typeNames.join(", "))})` : "",
    }
  );
  // More than one type: "5 Fire · 3 Cold" under the title.
  const untyped = game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.Untyped");
  const breakdown = parts.length > 1
    ? `<div class="lotm chat-damage-types">${parts.map((part) =>
        `<span class="chat-damage-type" data-damage-type="${Handlebars.escapeExpression(part.type)}">${part.amount} ${Handlebars.escapeExpression(part.label || untyped)}</span>`
      ).join(" · ")}</div>`
    : "";

  await postRoll(roll, {
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: flavor + breakdown + note + applyButtonsHTML(amount),
    flags: { lotm: { actionUuid: action.uuid, actorUuid: actor.uuid, damage: {
      amount,
      bigSuccess,
      // { fire: 5, cold: 3 } ("" = untyped). Adds up to `amount`. Damage reduction is taken off each one
      // when the Damage button is used (applyDamageFromMessage).
      types: Object.fromEntries(parts.map((part) => [part.type, part.amount])),
    } } },
  });
  return roll;
}

/* -------------------------------------------- */
/*  Chat buttons                                 */
/* -------------------------------------------- */

/**
 * HTML for the buttons the roll dialogs add under an action's attack roll: "Roll Damage", then "Big Success".
 * @returns {string}
 */
export function damageButtonHTML() {
  const damage = game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.RollDamage");
  const big = game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.BigSuccess");
  const bigHint = Handlebars.escapeExpression(game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.BigSuccessHint"));
  return `<div class="lotm-damage-buttons">
    <button type="button" class="lotm-roll-damage" data-lotm-action="damage">${damage}</button>
    <button type="button" class="lotm-roll-damage big-success" data-lotm-action="bigSuccess" data-tooltip="${bigHint}">${big}</button>
  </div>`;
}

/**
 * HTML for the buttons under a damage roll: apply it to the selected tokens as damage, or as healing.
 * @param {number} amount
 * @returns {string}
 */
function applyButtonsHTML(amount) {
  const hint = Handlebars.escapeExpression(game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.ApplyHint"));
  const damage = game.i18n.format("LORD_OF_THE_MYSTERIES.Action.ApplyDamage", { amount });
  const heal = game.i18n.format("LORD_OF_THE_MYSTERIES.Action.ApplyHeal", { amount });
  return `<div class="lotm-apply-buttons">
    <button type="button" class="lotm-apply" data-lotm-apply="damage" data-tooltip="${hint}"><i class="fa-solid fa-heart-crack"></i> ${damage}</button>
    <button type="button" class="lotm-apply" data-lotm-apply="heal" data-tooltip="${hint}"><i class="fa-solid fa-heart"></i> ${heal}</button>
  </div>`;
}

/**
 * Take an actor's damage reduction off incoming damage, one damage type at a time:
 * 5 physical and 6 fire against Physical 3 and Fire 2 reduction is 2 physical and 4 fire, so 6 damage.
 * A type's damage never goes below 0. Untyped damage, and types the actor has no reduction against, aren't reduced.
 * @param {Record<string, number>} types       Incoming damage per type, e.g. { physical: 5, fire: 6 } ("" = untyped).
 * @param {Record<string, number>} reduction   The actor's system.damageReduction, e.g. { physical: 3, fire: 2 }.
 * @returns {{incoming: number, reduced: number, total: number,
 *            parts: {type: string, label: string, amount: number, reduction: number, taken: number}[]}}
 *   incoming  damage before reduction; reduced  how much was taken off; total  damage after reduction.
 */
export function reduceDamage(types, reduction = {}) {
  const parts = Object.entries(types ?? {}).map(([type, value]) => {
    const amount = Number(value) || 0;
    const against = type ? Math.max(0, Number(reduction?.[type]) || 0) : 0;
    const taken = amount > 0 ? Math.max(0, amount - against) : amount;
    return { type, label: damageTypeName(type), amount, reduction: amount - taken, taken };
  });
  const incoming = parts.reduce((sum, part) => sum + part.amount, 0);
  const total = Math.max(0, parts.reduce((sum, part) => sum + part.taken, 0));
  return { incoming, reduced: incoming - total, total, parts };
}

/**
 * The Damage / Heal buttons on a damage message: change every selected token's Health by the message's amount.
 *
 * Damage: each token's damage reduction (its actor's system.damageReduction: the rows on its sheet plus its worn
 * armor, see base-actor.mjs) is taken off each damage type first (reduceDamage). Shift-click applies the damage
 * without any reduction (for attacks that ignore it). Healing is never reduced.
 * Health stays between 0 and its maximum.
 * Each token needs to be one the user owns (the GM owns them all), otherwise it's skipped with a warning.
 * Every damaged token gets a chat message with the breakdown (postDamageTaken). The notice the user gets also
 * shows the Health before and after; the chat message doesn't.
 *
 * @param {ChatMessage} message
 * @param {"damage"|"heal"} kind
 * @param {object} [options]
 * @param {boolean} [options.ignoreReduction]  Apply the full damage (Shift-click).
 */
export async function applyDamageFromMessage(message, kind, { ignoreReduction = false } = {}) {
  const damage = message.getFlag("lotm", "damage");
  const amount = Number(damage?.amount);
  if (!Number.isFinite(amount)) return;
  // Messages from before damage types were saved: all of it untyped, so nothing reduces it.
  const types = damage.types && Object.keys(damage.types).length ? damage.types : { "": amount };

  const tokens = canvas.tokens?.controlled ?? [];
  if (!tokens.length) {
    ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.SelectToken"));
    return;
  }

  for (const token of tokens) {
    const actor = token.actor;
    const hp = actor?.system.resources?.hp;
    if (!hp) continue;
    if (!actor.isOwner) {
      ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.NotOwner", { name: token.name }));
      continue;
    }

    const before = Number(hp.value) || 0;

    if (kind === "heal") {
      const after = hp.max > 0 ? Math.min(hp.max, before + amount) : before + amount;
      await actor.update({ "system.resources.hp.value": after });
      ui.notifications.info(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.Healed", { name: token.name, amount, before, after }));
      continue;
    }

    const result = reduceDamage(types, ignoreReduction ? {} : actor.system.damageReduction);
    const after = Math.max(0, before - result.total);
    await actor.update({ "system.resources.hp.value": after });
    // Tell the table what happened (without the Health that's left).
    await postDamageTaken(token, result, message, { ignoreReduction });

    if (!result.reduced) {
      ui.notifications.info(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.Damaged", { name: token.name, amount: result.total, before, after }));
      continue;
    }
    // How much each type was reduced by.
    const details = result.parts
      .filter((part) => part.reduction > 0)
      .map((part) => `${part.label} ${part.reduction}`)
      .join(", ");
    ui.notifications.info(game.i18n.format("LORD_OF_THE_MYSTERIES.Action.DamagedReduced", {
      name: token.name, amount: result.total, incoming: result.incoming, reduced: result.reduced, details, before, after,
    }));
  }
}

/**
 * Chat message for a token that took damage: how much of each type came in, how much its damage reduction took off,
 * and how much it took. Its Health isn't shown.
 *
 * Posted as the token. It's seen by the same people as the damage roll it came from: a damage roll that was
 * whispered or blind gives a result that's whispered or blind to the same people, so it can't give a hidden roll away.
 *
 * @param {Token} token
 * @param {ReturnType<reduceDamage>} result
 * @param {ChatMessage} source      The damage roll's message.
 * @param {object} [options]
 * @param {boolean} [options.ignoreReduction]  The damage was applied with Shift (no reduction).
 * @returns {Promise<ChatMessage>}
 */
async function postDamageTaken(token, result, source, { ignoreReduction = false } = {}) {
  const localize = (key) => game.i18n.localize(`LORD_OF_THE_MYSTERIES.Action.DamageTaken.${key}`);
  const escape = Handlebars.escapeExpression;
  const untyped = game.i18n.localize("LORD_OF_THE_MYSTERIES.Action.Untyped");
  const minus = (n) => (n ? `−${n}` : "0");

  const rows = result.parts.map((part) => `
      <tr data-damage-type="${escape(part.type)}">
        <td>${escape(part.label || untyped)}</td>
        <td>${part.amount}</td>
        <td>${minus(part.reduction)}</td>
        <td><strong>${part.taken}</strong></td>
      </tr>`).join("");
  // With more than one type, a total row at the bottom.
  const totals = result.parts.length > 1 ? `
      <tr class="chat-damage-total">
        <td>${localize("Total")}</td>
        <td>${result.incoming}</td>
        <td>${minus(result.reduced)}</td>
        <td><strong>${result.total}</strong></td>
      </tr>` : "";

  const title = game.i18n.format("LORD_OF_THE_MYSTERIES.Action.DamageTaken.Title", {
    name: escape(token.name), amount: result.total,
  });
  const content = `<div class="lotm chat-damage-taken">
    <p class="chat-damage-title">${title}</p>
    <table class="chat-damage-table">
      <thead><tr>
        <th>${localize("Type")}</th><th>${localize("Incoming")}</th><th>${localize("Reduced")}</th><th>${localize("Taken")}</th>
      </tr></thead>
      <tbody>${rows}${totals}
      </tbody>
    </table>
    ${ignoreReduction ? `<p class="chat-damage-ignored">${localize("Ignored")}</p>` : ""}
  </div>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: token.document, actor: token.actor }),
    content,
    // Same audience as the damage roll.
    whisper: [...(source.whisper ?? [])],
    blind: !!source.blind,
    flags: { lotm: { damageTaken: { tokenUuid: token.document?.uuid ?? "", ...result } } },
  });
}

/**
 * Make the chat buttons work. Called once from the init hook in lotm.mjs.
 *   Attack messages:  "Roll Damage" and "Big Success" (older messages have only the one damage button)
 *   Damage messages:  "Damage" and "Heal"
 * The buttons are written into the message's flavor, which Foundry shows above the roll, so they're moved
 * below it into the message's content.
 */
export function registerActionChatListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const content = html.querySelector(".message-content");

    // Roll Damage / Big Success
    const rollButtons = html.querySelectorAll("button[data-lotm-action]");
    if (rollButtons.length) {
      const holder = html.querySelector(".lotm-damage-buttons") ?? rollButtons[0];
      content?.append(holder);
      for (const button of rollButtons) {
        button.addEventListener("click", () => onRollDamageButton(message, button.dataset.lotmAction === "bigSuccess"));
      }
    }

    // Damage / Heal
    const applyButtons = html.querySelectorAll("button[data-lotm-apply]");
    if (applyButtons.length) {
      const holder = html.querySelector(".lotm-apply-buttons");
      if (holder) content?.append(holder);
      for (const button of applyButtons) {
        // Shift-click: apply the damage without the targets' damage reduction.
        button.addEventListener("click", (event) => applyDamageFromMessage(message, button.dataset.lotmApply, {
          ignoreReduction: event.shiftKey,
        }));
      }
    }
  });
}

/**
 * Roll Damage / Big Success on an attack message.
 * @param {ChatMessage} message
 * @param {boolean} bigSuccess
 */
async function onRollDamageButton(message, bigSuccess) {
  // The roll dialog saved which action and character this attack was for.
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

  await rollActionDamage(actor, action, { bigSuccess });
}
