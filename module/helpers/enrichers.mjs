/**
 * Buttons inside text: @Sanity[...] (or @Sanity[...], the same), @Check[...], @Effect[...] and @Damage[...].
 *
 * Write them in any text Foundry turns into HTML: ability, action and spell descriptions, Roll Table results,
 * journal pages, chat messages. They show as small buttons; clicking one opens the roll for a character.
 *
 *   @Sanity[1/1d2]            a sanity (sanity) check: lose 1 on a pass, 1d2 on a fail
 *   @Sanity[1/1d2]                 the same: the rulebook calls it Sanity, the sheets Sanity
 *   @Sanity[0/1d2]{Whispers}       the same, with its own label ("Whispers (0/1d2)"), also used as the check's cause
 *   @Sanity[1d8/2d8|+4]            a penalty on the d20 ("Sanity check +4 disadvantageous"); "penalty=4" works too
 *   @Sanity[1d3]                   one loss for both
 *
 *   @Check[wil|15]                 an attribute check against DC 15: str agi wil phy cha ins luc edu, or their names
 *                                  (Strength, Will, Willpower, Constitution, Physique, Dexterity, Luck, ...)
 *   @Check[Listening|30]           a skill check, by the skill's name in the Skills compendium (or a world skill)
 *   @Check[phy|dc=15]{Hold on}     "DC 15" and "dc=15" work too; {label} is the button's text and the check's reason
 *   @Check[Medicine]               no DC
 *
 *   @Effect[Compendium.lotm.effects.ActiveEffect.abc123]   an Apply button: puts a copy of that effect on the character
 *   @Effect[...]{Cursed}           the same, with its own text ("Cursed" instead of "Apply <effect's name>")
 *   @Effect[bound]                 a status, by its id or its name ("Bound", "Loss of Balance")
 *   Get an effect's UUID from its sheet's header (the ID button), or drag the effect into the text and change @UUID to
 *   @Effect. In a chat message, each character gets the effect once: a second click asks first.
 *   A Roll Table result that is an effect (a document result), or text that links one with @UUID, gets the same
 *   button next to its link when it's drawn (addTableEffectButtons, called from helpers/check-chat.mjs).
 *
 *   @Damage[2d6]                   rolls the damage and posts a damage card, with Damage / Heal buttons for the
 *                                  selected tokens (the same card an action's damage gets, helpers/action-roll.mjs)
 *   @Damage[2d6[fire] + 1d4]       types in the formula, like an action's Damage Roll Macro
 *   @Damage[1d8+3|fire]            a type for the parts that don't name one
 *   @Damage[1d6+@attributes.str.total]{Falling Rocks}   @values, and a title for the card
 *   Damage is rolled once, for one character, who the card is posted as and whose @values the formula uses:
 *   the character the text belongs to, otherwise the first selected token the user owns, otherwise the user's own
 *   character. With none of those it's posted as the user, which works as long as the formula has no @values.
 *   (Selected tokens are often who's being hit, so they don't come first here like they do for the others.)
 *
 * Who rolls (or gets the effect), in this order:
 *   1. the tokens the user has selected that they own (so the GM can select a goblin and click "the target loses...")
 *   2. the character the text belongs to: the actor whose ability or sheet it's on, or for an outcome table's result,
 *      the character who made the check (helpers/check-chat.mjs ties those)
 *   3. the user's own character (User Configuration)
 * Shift-click rolls straight away, without the roll window.
 *
 * The parsing at the top is plain data (no `game` / `CONFIG` access), unit tested under Node (tests/enrichers.test.mjs).
 * Registered once from the init hook in lotm.mjs.
 */

import { parseSanityLoss } from "./sanity.mjs";

/** Other words the translation uses for the attributes, all lower case. */
const ATTRIBUTE_ALIASES = {
  strength: "str", power: "str",
  agility: "agi", dexterity: "agi",
  will: "wil", willpower: "wil", consciousness: "wil",
  physique: "phy", constitution: "phy", body: "phy",
  charisma: "cha", charm: "cha", appearance: "cha",
  inspiration: "ins",
  luck: "luc", lucky: "luc",
  education: "edu",
};


/**
 * What's inside @Sanity[...].
 * @param {string} inner   e.g. "1/1d2", "1d8/2d8|+4", "1d3|penalty=2"
 * @returns {{success: string, failure: string, penalty: number}}
 */
export function parseSanityLink(inner) {
  const [lossText, ...options] = String(inner ?? "").split("|").map((part) => part.trim());
  const { success, failure } = parseSanityLoss(lossText);
  let penalty = 0;
  for (const option of options) {
    const match = option.match(/^(?:penalty\s*[:=]?\s*)?([+-]?\d+)$/i);
    if (match) penalty = Number(match[1]);
  }
  return { success, failure, penalty };
}


/**
 * What's inside @Damage[...]: a damage formula, and after a | the type for the parts that don't name one.
 * @param {string} inner   e.g. "2d6", "2d6[fire] + 1d4", "1d8+3|fire"
 * @returns {{formula: string, type: string}}
 */
export function parseDamageLink(inner) {
  const text = String(inner ?? "");
  const bar = text.lastIndexOf("|");
  // A | inside a [label] isn't the type separator.
  const isSeparator = bar >= 0 && !text.slice(bar).includes("]");
  return isSeparator
    ? { formula: text.slice(0, bar).trim(), type: text.slice(bar + 1).trim() }
    : { formula: text.trim(), type: "" };
}


/**
 * What's inside @Effect[...]: an effect's UUID (it has dots in it), or a status's id or name.
 * @param {string} inner   e.g. "Compendium.lotm.effects.ActiveEffect.abc123", "bound", "Loss of Balance"
 * @returns {{uuid: string|null, status: string|null}}
 */
export function parseEffectLink(inner) {
  const text = String(inner ?? "").trim();
  if (!text) return { uuid: null, status: null };
  if (text.includes(".")) return { uuid: text, status: null };
  return { uuid: null, status: text };
}


/**
 * The key a chat message remembers an applied effect under (flags.lotm.effectsApplied), one per character.
 * @param {string} actorUuid
 * @param {{uuid?: string|null, statusId?: string|null}} effect
 * @returns {string}
 */
export function appliedEffectKey(actorUuid, { uuid = null, statusId = null } = {}) {
  return `${actorUuid}|${statusId ? `status:${statusId}` : uuid}`;
}


/**
 * What's inside @Check[...].
 * @param {string} inner                           e.g. "wil|15", "Listening|DC 30", "Willpower"
 * @param {Record<string, string>} [attributeNames] The attributes' keys and names: { str: "Strength", ... }.
 * @returns {{attribute: string|null, skill: string|null, dc: number|null}}
 *   attribute  an attribute key, when the first part names one; otherwise skill is the name as written
 */
export function parseCheckLink(inner, attributeNames = {}) {
  const [target = "", ...options] = String(inner ?? "").split("|").map((part) => part.trim());
  let dc = null;
  for (const option of options) {
    const match = option.match(/^(?:dc\s*[:=]?\s*)?(\d+)$/i);
    if (match) dc = Number(match[1]);
  }
  const lower = target.toLowerCase();
  const keys = Object.keys(attributeNames);
  const attribute = keys.find((key) => key === lower || String(attributeNames[key]).toLowerCase() === lower)
    ?? (keys.includes(ATTRIBUTE_ALIASES[lower]) ? ATTRIBUTE_ALIASES[lower] : null);
  return { attribute, skill: attribute ? null : (target || null), dc };
}


/* -------------------------------------------- */
/*  Foundry from here on                         */
/* -------------------------------------------- */

const L = (key, data) => (data ? game.i18n.format(`LORD_OF_THE_MYSTERIES.Enrichers.${key}`, data) : game.i18n.localize(`LORD_OF_THE_MYSTERIES.Enrichers.${key}`));


/** @Sanity[...]{label} or @Sanity[...]{label}: match[1] is what's in the brackets, match[2] the label. */
export const SANITY_PATTERN = /@(?:Sanity|Sanity)\[([^\]]+)\](?:\{([^}]+)\})?/gi;

/** @Check[...]{label} */
export const CHECK_PATTERN = /@Check\[([^\]]+)\](?:\{([^}]+)\})?/gi;

/** @Effect[...]{label} */
export const EFFECT_PATTERN = /@Effect\[([^\]]+)\](?:\{([^}]+)\})?/gi;

/**
 * @Damage[...]{label}. The formula can have [labels] of its own ("2d6[fire]"), so one level of brackets is allowed
 * inside.
 */
export const DAMAGE_PATTERN = /@Damage\[((?:[^\[\]]|\[[^\[\]]*\])+)\](?:\{([^}]+)\})?/gi;

/** Each button kind's hover text (a LORD_OF_THE_MYSTERIES.Enrichers key). */
const HINTS = { sanity: "SanityHint", check: "CheckHint", effect: "EffectHint", damage: "DamageHint" };


/** Add the enrichers, and the one click listener that works their buttons wherever they are. */
export function registerEnrichers() {
  CONFIG.TextEditor.enrichers.push(
    { pattern: SANITY_PATTERN, enricher: enrichSanity },
    { pattern: CHECK_PATTERN, enricher: enrichCheck },
    { pattern: EFFECT_PATTERN, enricher: enrichEffect },
    { pattern: DAMAGE_PATTERN, enricher: enrichDamage },
  );
  // Capture: the click is seen before anything inside a sheet or the chat log can stop it.
  document.addEventListener("click", onEnricherClick, { capture: true });
}


/**
 * The actor a piece of text belongs to: an Actor itself, an Item's or effect's actor, a chat message's speaker.
 * @param {Document} [doc]   The enrichment's relativeTo.
 * @returns {Actor|null}
 */
function actorOf(doc) {
  switch (doc?.documentName) {
    case "Actor": return doc;
    case "Item": return doc.actor ?? null;
    case "ActiveEffect": return doc.parent?.documentName === "Actor" ? doc.parent : (doc.parent?.actor ?? null);
    case "ChatMessage": return ChatMessage.getSpeakerActor?.(doc.speaker) ?? null;
    default: return null;
  }
}


/**
 * A button element for an enricher.
 * @param {string} kind     "sanity", "check", "effect" or "damage"
 * @param {string} icon     Font Awesome class
 * @param {string} text     The button's text (plain).
 * @param {object} data     data-* values.
 * @param {object} options  The enrichment options (relativeTo).
 * @returns {HTMLElement}
 */
function button(kind, icon, text, data, options) {
  const link = document.createElement("a");
  link.classList.add("lotm-enricher-link", `lotm-${kind}-link`);
  link.setAttribute("role", "button");
  link.dataset.lotmEnricher = kind;
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined && value !== "") link.dataset[key] = String(value);
  }
  const actor = actorOf(options?.relativeTo);
  if (actor) link.dataset.actorUuid = actor.uuid;
  link.dataset.tooltip = L(HINTS[kind] ?? "CheckHint");
  const i = document.createElement("i");
  i.className = icon;
  link.append(i, ` ${text}`);
  return link;
}


/** @Sanity[1/1d2]{label} (or @Sanity) */
function enrichSanity(match, options) {
  const { success, failure, penalty } = parseSanityLink(match[1]);
  const label = match[2]?.trim() ?? "";
  const loss = `${success}/${failure}${penalty ? ` ${penalty > 0 ? "+" : ""}${penalty}` : ""}`;
  const text = label ? `${label} (${loss})` : L("Sanity", { loss });
  return button("sanity", "fa-solid fa-brain", text, { success, failure, penalty, reason: label }, options);
}


/** @Check[wil|15]{label} */
function enrichCheck(match, options) {
  const names = Object.fromEntries(Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.attributes ?? {})
    .map(([key, labelKey]) => [key, game.i18n.localize(labelKey)]));
  const { attribute, skill, dc } = parseCheckLink(match[1], names);
  const label = match[2]?.trim() ?? "";
  const name = attribute ? names[attribute] : (skill ?? "");
  const text = label || (dc !== null ? L("CheckDC", { name, dc }) : L("Check", { name }));
  return button("check", "fa-solid fa-dice-d20", text, { attribute, skill, dc, reason: label }, options);
}


/**
 * The effect an @Effect button stands for: an Active Effect found by UUID, or a status found by its id or name.
 * @param {{uuid?: string|null, status?: string|null}} link
 * @returns {Promise<{effect?: ActiveEffect, rule?: object, uuid: string|null, statusId: string|null, name: string, img: string}|null>}
 *   null when it can't be found.
 */
async function findLinkedEffect({ uuid = null, status = null } = {}) {
  if (uuid) {
    const doc = await fromUuid(uuid).catch(() => null);
    if (doc?.documentName !== "ActiveEffect") return null;
    return { effect: doc, uuid: doc.uuid, statusId: null, name: doc.name, img: doc.img };
  }
  if (status) {
    const { STATUS_RULES } = await import("../effects/status-effects.mjs");
    const lower = status.trim().toLowerCase();
    const rule = Object.values(STATUS_RULES).find((candidate) => candidate.id.toLowerCase() === lower
      || game.i18n.localize(candidate.name).toLowerCase() === lower);
    if (!rule) return null;
    return { rule, uuid: null, statusId: rule.id, name: game.i18n.localize(rule.name), img: rule.img };
  }
  return null;
}


/** @Damage[formula|type]{label} */
function enrichDamage(match, options) {
  const { formula, type } = parseDamageLink(match[1]);
  const label = match[2]?.trim() ?? "";
  const typeKey = CONFIG.LORD_OF_THE_MYSTERIES.damageTypes?.[type.toLowerCase()];
  const typeName = typeKey ? game.i18n.localize(typeKey) : type;
  const text = label || (typeName ? `${formula} ${typeName}` : formula);
  const link = button("damage", "fa-solid fa-burst", text, { formula, damageType: type, title: label }, options);
  if (!formula || !Roll.validate(formula)) link.classList.add("lotm-enricher-broken");
  return link;
}


/**
 * Who a @Damage button rolls for (see the top of this file): the text's character, the first selected token the user
 * owns, or the user's character. Only actors the user owns. null = nobody (posted as the user).
 * @param {HTMLElement} link
 * @returns {Actor|null}
 */
function damageRollerFor(link) {
  const own = link.dataset.actorUuid ? fromUuidSync(link.dataset.actorUuid) : null;
  if (own?.isOwner) return own;
  const selected = (canvas?.tokens?.controlled ?? []).map((token) => token.actor).find((actor) => actor?.isOwner);
  if (selected) return selected;
  const character = game.user.character;
  return character?.isOwner ? character : null;
}


/** @Effect[uuid or status]{label} */
async function enrichEffect(match, options) {
  const { uuid, status } = parseEffectLink(match[1]);
  const label = match[2]?.trim() ?? "";
  const found = await findLinkedEffect({ uuid, status });
  const name = found?.name ?? label ?? "";
  const text = label || (found ? L("Effect", { name }) : L("EffectMissing"));
  const link = button("effect", "fa-solid fa-person-rays", text, {
    uuid: found?.uuid ?? uuid, status: found?.statusId ?? status, effectName: name,
  }, options);
  if (!found) link.classList.add("lotm-enricher-broken");
  return link;
}


/**
 * Apply buttons for a drawn Roll Table result that is an effect, or links one: one next to each link to an Active
 * Effect in the draw's message. Called from the renderChatMessageHTML hook (helpers/check-chat.mjs), before the
 * outcome table's character is tied to the message's buttons.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function addTableEffectButtons(message, html) {
  const isDraw = !!message?.getFlag?.("core", "RollTable") || !!html.querySelector(".table-draw, .table-results");
  if (!isDraw) return;
  for (const anchor of html.querySelectorAll('a.content-link[data-type="ActiveEffect"][data-uuid]')) {
    if (anchor.nextElementSibling?.dataset?.lotmEnricher === "effect") continue;
    const name = anchor.textContent.trim();
    const link = button("effect", "fa-solid fa-person-rays", L("Effect", { name }), {
      uuid: anchor.dataset.uuid, effectName: name,
    }, { relativeTo: message });
    anchor.after(" ", link);
  }
}


/**
 * Who a click rolls for (see the top of this file). Only actors the user owns.
 * @param {HTMLElement} link
 * @returns {Actor[]}
 */
function actorsFor(link) {
  const selected = (canvas?.tokens?.controlled ?? []).map((token) => token.actor).filter((actor) => actor?.isOwner);
  if (selected.length) return [...new Set(selected)];
  const own = link.dataset.actorUuid ? fromUuidSync(link.dataset.actorUuid) : null;
  if (own?.isOwner) return [own];
  const character = game.user.character;
  return character?.isOwner ? [character] : [];
}


/**
 * A click anywhere: if it was on one of these buttons, open its roll for each actor it's for.
 * @param {MouseEvent} event
 */
async function onEnricherClick(event) {
  const link = event.target?.closest?.("[data-lotm-enricher]");
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();

  // Damage is rolled once, and works without a character (see the top of this file).
  if (link.dataset.lotmEnricher === "damage") {
    const { rollDamageFormula } = await import("./action-roll.mjs");
    await rollDamageFormula(link.dataset.formula ?? "", {
      actor: damageRollerFor(link),
      title: link.dataset.title ?? "",
      defaultType: link.dataset.damageType ?? "",
    });
    return;
  }

  const actors = actorsFor(link);
  if (!actors.length) {
    ui.notifications.warn(L("NoActor"));
    return;
  }
  const fast = event.shiftKey;
  const data = link.dataset;

  if (data.lotmEnricher === "sanity") {
    const { default: SanityCheckDialog } = await import("../apps/sanity-check-dialog.mjs");
    for (const actor of actors) {
      await SanityCheckDialog.prompt(actor, {
        success: data.success ?? "0", failure: data.failure ?? "1", penalty: Number(data.penalty) || 0, reason: data.reason ?? "", fast,
      });
    }
    return;
  }

  if (data.lotmEnricher === "check") {
    const dc = data.dc === undefined ? null : Number(data.dc);
    for (const actor of actors) await rollCheckLink(actor, { attribute: data.attribute, skill: data.skill, dc, reason: data.reason ?? "", fast });
    return;
  }

  if (data.lotmEnricher === "effect") await applyEffectLink(link, actors);
}


/**
 * An @Effect button was clicked: put the effect on each of these characters, then say so in chat.
 *   - an Active Effect: a fresh copy (its duration starts now), like the Apply buttons on attack cards
 *   - a status: turned on, unless the character already has it
 * In a chat message, each character gets it once (flags.lotm.effectsApplied on the message). Clicking again for a
 * character that already got it asks first. Only the message's author or a GM can record that, so a player clicking
 * a GM's message isn't asked.
 * @param {HTMLElement} link
 * @param {Actor[]} actors   Actors the user owns (actorsFor).
 */
async function applyEffectLink(link, actors) {
  const found = await findLinkedEffect({ uuid: link.dataset.uuid ?? null, status: link.dataset.status ?? null });
  if (!found) {
    ui.notifications.warn(L("EffectGone", { name: link.dataset.effectName ?? "" }));
    return;
  }

  const messageId = link.closest("[data-message-id]")?.dataset.messageId;
  const message = messageId ? game.messages.get(messageId) : null;
  const applied = new Set(message?.getFlag("lotm", "effectsApplied") ?? []);
  const repeats = actors.filter((actor) => applied.has(appliedEffectKey(actor.uuid, found)));
  if (repeats.length) {
    const escape = (text) => Handlebars.escapeExpression(text ?? "");
    const again = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("EffectAgainTitle") },
      content: `<p>${L("EffectAgain", { effect: escape(found.name), names: repeats.map((actor) => escape(actor.name)).join(", ") })}</p>`,
      rejectClose: false,
    });
    if (!again) return;
  }

  const { createEffectsOn, effectCopyData, postEffectGiven } = await import("../effects/effect-application.mjs");
  const given = [];
  for (const actor of actors) {
    let created = false;
    if (found.rule) {
      if (actor.statuses?.has?.(found.statusId)) {
        ui.notifications.info(L("EffectAlready", { name: actor.name, effect: found.name }));
        continue;
      }
      created = await createEffectsOn(actor, [found.rule.toEffectData()]);
    } else {
      created = await createEffectsOn(actor, [effectCopyData(found.effect, { source: null })]);
    }
    if (created) given.push(actor);
  }
  if (!given.length) return;

  if (message?.canUserModify?.(game.user, "update")) {
    for (const actor of given) applied.add(appliedEffectKey(actor.uuid, found));
    await message.setFlag("lotm", "effectsApplied", [...applied]);
  }
  await postEffectGiven({ name: found.name, img: found.img }, given.map((actor) => actor.name), given[0]);
}


/**
 * Roll a @Check button for one actor: an attribute check, or a skill check at the actor's level in that skill
 * (with related-skill raises and Sequence raises, the same as the sheet).
 * @param {Actor} actor
 * @param {{attribute?: string, skill?: string, dc: number|null, reason: string, fast: boolean}} check
 */
async function rollCheckLink(actor, { attribute, skill, dc, reason, fast }) {
  if (attribute) {
    const { default: AttributeCheckDialog } = await import("../apps/attribute-check-dialog.mjs");
    return AttributeCheckDialog.prompt(actor, attribute, { dc, reason, fast });
  }

  const skillItem = await skillByName(skill);
  if (!skillItem) {
    ui.notifications.warn(L("UnknownSkill", { name: skill ?? "" }));
    return null;
  }
  const [{ findSkillEntry }, { effectiveSkillLevel }, { default: SkillCheckDialog }] = await Promise.all([
    import("./action-roll.mjs"), import("./skill-levels.mjs"), import("../apps/skill-check-dialog.mjs"),
  ]);
  const { uuid, category } = findSkillEntry(actor, skillItem, skillItem.uuid);
  const level = await effectiveSkillLevel(actor, uuid);
  return SkillCheckDialog.prompt(actor, {
    uuid,
    name: skillItem.name,
    category,
    attribute: skillItem.system.skill_attribute || category,
    level,
    flatModifier: skillItem.system.modifier ?? 0,
  }, { fast, dc });
}


/**
 * A skill Item by name (any capitals): the Skills compendium's first, then a world skill.
 * @param {string} name
 * @returns {Promise<Item|null>}
 */
async function skillByName(name) {
  const lower = String(name ?? "").trim().toLowerCase();
  if (!lower) return null;
  const pack = game.packs.get(CONFIG.LORD_OF_THE_MYSTERIES.skillsCompendiumId);
  const index = await pack?.getIndex();
  const entry = index?.find((row) => row.name?.toLowerCase() === lower);
  if (entry?.uuid) return fromUuid(entry.uuid).catch(() => null);
  return game.items.find((item) => item.type === "skill" && item.name.toLowerCase() === lower) ?? null;
}
