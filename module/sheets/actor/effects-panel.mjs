/**
 * What the actor sheets' Effects tab and sidebar show about effects (data only; the buttons are on the sheet,
 * sheets/base-actor-sheet.mjs):
 *   prepareEffectsPanel(actor)   the status toggles and one row per effect on the actor or lent by its Items
 *   prepareStatusNotes(actor)    hover text for Physical Defense and Movement, one line per status that changes them
 */

import { STATUS_RULES, activeStatusIds, statusRule } from "../../effects/status-effects.mjs";
import { grantedEffectsDiff } from "../../effects/granted-effects.mjs";
import { grantedActionUuids } from "../../effects/effect-grants.mjs";
import { usesLeft } from "../../effects/action-expiry.mjs";
import { skillLevelLabel } from "../../helpers/skill-modifiers.mjs";
import { CATEGORY_BONUS_PATTERN, SKILL_BONUS_PATTERN, changeAmount, effectChanges } from "../../effects/skill-bonuses.mjs";

/**
 * The Effects tab (player and NPC sheets): a toggle for every status, then every effect on the actor, including
 * the ones its Items lend it (a charm's effect). Each row says where the effect came from, how long it has left,
 * whether it's switched off or suppressed (gear that's stowed), and has its statuses' buttons (Stand Up).
 * Copies of granted abilities' passive effects (effects/granted-effects.mjs) say which ability they're from, and
 * when they're out of date (or some are missing), the list gets a Refresh button.
 * @param {Actor} actor
 * @returns {Promise<{statuses: object[], effects: object[], grantedOutOfDate: boolean}>}
 */
export async function prepareEffectsPanel(actor) {
  const localize = (key) => game.i18n.localize(key);
  const active = activeStatusIds(actor);

  // Granted-ability copies: which are out of date, and whether any are missing or extra.
  const granted = await grantedEffectsDiff(actor).catch(() => null);
  const staleIds = new Set((granted?.remove ?? []).map((entry) => entry.id));

  const statuses = Object.values(STATUS_RULES).map((rule) => ({
    id: rule.id,
    name: localize(rule.name),
    img: rule.img,
    active: active.has(rule.id),
  }));

  const effects = [];
  for (const effect of actor.allApplicableEffects()) {
    // Effects on the actor itself, or lent by one of its Items.
    const owned = effect.parent === actor;
    const rules = effect.statusRules ?? [];
    // A linked effect another one brought with it (the Bound that comes with Helpless). It follows that effect,
    // so it has no buttons of its own (see documents/active-effect.mjs).
    const bringer = effect.impliedByEffect ?? null;

    const details = [];
    const source = effect.sourceActor?.name;
    if (source) details.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Source", { name: source }));
    const grantedFrom = effect.system?.grantedFrom;
    if (grantedFrom) {
      const ability = granted?.names.get(grantedFrom) ?? fromUuidSync(grantedFrom)?.name ?? "?";
      details.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Granted.Via", { ability, name: effect.parent.name }));
      if (staleIds.has(effect.id)) details.push(localize("LORD_OF_THE_MYSTERIES.Effects.Granted.OutOfDate"));
    } else if (!owned) {
      details.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Via", { name: effect.parent.name }));
    }
    if (bringer) details.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Via", { name: bringer.name }));
    const grants = await effectGrantsText(actor, effect);
    if (grants) details.push(grants);
    details.push(...(await effectUsesText(effect)));
    if (effect.system?.zone) details.push(localize("LORD_OF_THE_MYSTERIES.Effects.Zone.MarkerDetail"));
    if (effect.disabled) details.push(localize("LORD_OF_THE_MYSTERIES.Effects.Disabled"));
    else if (effect.isSuppressed) {
      const stowed = effect.parent?.type === "gear" && effect.parent.system.carry === "stowed";
      details.push(localize(stowed ? "LORD_OF_THE_MYSTERIES.Effects.SuppressedStowed" : "LORD_OF_THE_MYSTERIES.Effects.Suppressed"));
    }

    // Time left, only for effects that run out (a duration, or an expiry event like "end of turn").
    const duration = effect.duration;
    const finite = duration && (Number.isFinite(duration.value) || duration.expiry);

    effects.push({
      uuid: effect.uuid,
      name: effect.name,
      img: effect.img,
      disabled: effect.disabled,
      inactive: effect.disabled || effect.isSuppressed,
      owned,
      locked: !!bringer,
      detail: details.join(" · "),
      duration: finite ? (duration.label ?? "") : "",
      // The first of its statuses with a rules page.
      reference: rules.find((rule) => rule.reference)?.reference ?? null,
      // Status buttons (Stand Up, ...) only on the actor's own effects, not on ones an Item lends it or linked ones.
      buttons: (owned && !bringer) ? rules.flatMap((rule) => rule.buttons(effect)) : [],
    });
  }

  const grantedOutOfDate = !!(granted && (granted.create.length || granted.remove.length));
  return { statuses, effects, grantedOutOfDate };
}


/**
 * How many uses an effect has left, for its row on the Effects tab: one line per Action Used row
 * (effects/action-expiry.mjs), e.g. "Ends after 2 more uses of Smite".
 * @param {ActiveEffect} effect
 * @returns {Promise<string[]>}
 */
async function effectUsesText(effect) {
  const rows = effect.system?.expiryEvents ?? [];
  if (!rows.length) return [];
  const anyKey = grantedActionUuids(effect).length ? "AnyGranted" : "AnyAction";
  return Promise.all(rows.map(async (row) => {
    const action = row.actionUuid
      ? ((await fromUuid(row.actionUuid).catch(() => null))?.name ?? game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing"))
      : game.i18n.localize(`LORD_OF_THE_MYSTERIES.Effects.Expiry.${anyKey}`);
    return game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Expiry.UsesLeft", { count: usesLeft(row), action });
  }));
}


/**
 * What an effect gives, for its row on the Effects tab: "Grants: Smite, Pistol +1 (at most Advanced)".
 * Empty when it grants nothing (effects/effect-grants.mjs).
 * @param {Actor} actor
 * @param {ActiveEffect} effect
 * @returns {Promise<string>}
 */
async function effectGrantsText(actor, effect) {
  const actions = grantedActionUuids(effect);
  const skills = (effect.system?.skillIncreases ?? []).filter((row) => row?.skillUuid && row.value > 0);
  const bonuses = effectBonusParts(actor, effect);
  if (!actions.length && !skills.length && !bonuses.length) return "";

  const nameOf = async (uuid) => (await fromUuid(uuid).catch(() => null))?.name
    ?? game.i18n.localize("LORD_OF_THE_MYSTERIES.Drop.Missing");

  const parts = await Promise.all([
    ...actions.map(nameOf),
    ...skills.map(async (row) => {
      const text = `${await nameOf(row.skillUuid)} +${row.value}`;
      return row.maxLevel
        ? `${text} (${game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Config.Grants.AtMost", { level: skillLevelLabel(row.maxLevel) })})`
        : text;
    }),
    ...bonuses,
  ]);
  return game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Grants", { list: parts.join(", ") });
}


/**
 * An effect's skill roll bonuses, for its row on the Effects tab: "Pistol +2 to rolls", "Firearms skills +1 to rolls"
 * (effects/skill-bonuses.mjs). Override changes are left out: they don't add a set amount.
 * @param {Actor} actor   Whose skills the names come from.
 * @param {ActiveEffect} effect
 * @returns {string[]}
 */
function effectBonusParts(actor, effect) {
  const signed = (n) => (n < 0 ? `${n}` : `+${n}`);
  const parts = [];
  for (const change of effectChanges(effect)) {
    const amount = changeAmount(change);
    if (!amount) continue;
    const key = String(change.key ?? "");
    const skill = key.match(SKILL_BONUS_PATTERN)?.[1];
    const category = skill ? null : key.match(CATEGORY_BONUS_PATTERN)?.[1];
    if (skill) {
      const name = actor.system.skillFor?.(skill)?.name || skill;
      parts.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.SkillBonus", { skill: name, value: signed(amount) }));
    } else if (category) {
      const label = game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories?.[category] ?? category);
      parts.push(game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.CategoryBonus", { category: label, value: signed(amount) }));
    }
  }
  return parts;
}


/**
 * Hover text for the sidebar's Physical Defense and Movement, one line per status that changes them,
 * e.g. "Bound: no Agility, no Dodge". Empty when no status does. The text is HTML (lines joined with <br>).
 * @param {Actor} actor
 * @returns {{physical: string, movement: string}}
 */
export function prepareStatusNotes(actor) {
  const localize = (key) => game.i18n.localize(key);
  const { defense, movement } = actor.system.statusModifiers ?? {};
  const portionNote = (portion, half, none) => {
    if (portion === "half") return localize(half);
    if (portion === "none") return localize(none);
    return null;
  };
  const line = (id, parts) => {
    const name = localize(statusRule(id)?.name ?? id);
    return Handlebars.escapeExpression(`${name}: ${parts.filter(Boolean).join(", ")}`);
  };

  const physical = (defense?.sources ?? []).map((id) => {
    const rule = statusRule(id)?.defense ?? {};
    const modifier = Number(rule.modifier) || 0;
    return line(id, [
      portionNote(rule.agility, "LORD_OF_THE_MYSTERIES.Effects.Notes.AgilityHalf", "LORD_OF_THE_MYSTERIES.Effects.Notes.AgilityNone"),
      portionNote(rule.dodge, "LORD_OF_THE_MYSTERIES.Effects.Notes.DodgeHalf", "LORD_OF_THE_MYSTERIES.Effects.Notes.DodgeNone"),
      modifier ? game.i18n.format("LORD_OF_THE_MYSTERIES.Effects.Notes.Modifier", { value: modifier > 0 ? `+${modifier}` : `${modifier}` }) : null,
    ]);
  });

  const moves = (movement?.sources ?? []).map((id) => {
    const rule = statusRule(id)?.movement ?? {};
    return line(id, [
      portionNote(rule.agility, "LORD_OF_THE_MYSTERIES.Effects.Notes.AgilityHalf", "LORD_OF_THE_MYSTERIES.Effects.Notes.AgilityNone"),
    ]);
  });

  return { physical: physical.join("<br>"), movement: moves.join("<br>") };
}
