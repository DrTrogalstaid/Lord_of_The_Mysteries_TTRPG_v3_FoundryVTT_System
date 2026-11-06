/**
 * Buttons inside text: @Rationality[...] (or @Sanity[...], the same) and @Check[...].
 *
 * Write them in any text Foundry turns into HTML: ability, action and spell descriptions, Roll Table results,
 * journal pages, chat messages. They show as small buttons; clicking one opens the roll for a character.
 *
 *   @Rationality[1/1d2]            a rationality (sanity) check: lose 1 on a pass, 1d2 on a fail
 *   @Sanity[1/1d2]                 the same: the rulebook calls it Sanity, the sheets Rationality
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
 * Who rolls, in this order:
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


/** @Rationality[...]{label} or @Sanity[...]{label}: match[1] is what's in the brackets, match[2] the label. */
export const SANITY_PATTERN = /@(?:Rationality|Sanity)\[([^\]]+)\](?:\{([^}]+)\})?/gi;

/** @Check[...]{label} */
export const CHECK_PATTERN = /@Check\[([^\]]+)\](?:\{([^}]+)\})?/gi;


/** Add the two enrichers, and the one click listener that works their buttons wherever they are. */
export function registerEnrichers() {
  CONFIG.TextEditor.enrichers.push(
    { pattern: SANITY_PATTERN, enricher: enrichSanity },
    { pattern: CHECK_PATTERN, enricher: enrichCheck },
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
 * @param {string} kind     "sanity" or "check"
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
  link.dataset.tooltip = L(`${kind === "sanity" ? "Sanity" : "Check"}Hint`);
  const i = document.createElement("i");
  i.className = icon;
  link.append(i, ` ${text}`);
  return link;
}


/** @Rationality[1/1d2]{label} (or @Sanity) */
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
  }
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
