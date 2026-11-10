import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
// Real Handlebars and the system's templates: the chat lines these tests read are rendered from them.
import "./support/templates.mjs";

/*
 * Handing out effects stored on items (effects/effect-application.mjs).
 * Foundry isn't loaded: effects, actors and users are small stand-ins with only what the code reads.
 */

const STRINGS = {
  "LORD_OF_THE_MYSTERIES.Effects.Use.passive": "Passive",
  "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.targets": "Targets",
  "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.self": "Self",
  "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.area": "Area (once)",
  "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.zone": "Zone (while inside)",
  "LORD_OF_THE_MYSTERIES.Effects.Application.Shapes.circle": "Circle",
  "LORD_OF_THE_MYSTERIES.Effects.Apply.Button": "Apply {name}",
  "LORD_OF_THE_MYSTERIES.Effects.Apply.Chat": "{name} applies {effect} to {targets}.",
};
const fill = (text, data) => text.replace(/\{(\w+)\}/g, (match, key) => (key in data ? String(data[key]) : match));
const warnings = [];
const chat = [];
const queries = [];

globalThis.CONFIG = {
  LORD_OF_THE_MYSTERIES: {
    effectApplicationModes: {
      targets: "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.targets",
      self: "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.self",
      area: "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.area",
      zone: "LORD_OF_THE_MYSTERIES.Effects.Application.Modes.zone",
    },
    effectAreaShapes: { circle: "LORD_OF_THE_MYSTERIES.Effects.Application.Shapes.circle" },
  },
  queries: {},
};
globalThis.canvas = { scene: { grid: { units: "ft" } } };
globalThis.ui = { notifications: { warn: (m) => warnings.push(m), info: (m) => warnings.push(`info: ${m}`) } };
globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ alias: actor?.name }), create: async (data) => chat.push(data) };
globalThis.game = {
  i18n: { localize: (key) => STRINGS[key] ?? key, format: (key, data = {}) => fill(STRINGS[key] ?? key, data) },
  user: { targets: new Set() },
  users: { activeGM: null },
};

const {
  applyItemEffect, defaultUseFor, effectButtonsHTML, effectCopyData, effectUse, giveEffect, registerEffectQueries,
  useData, useLabel,
} = await import("../module/effects/effect-application.mjs");

/* -------------------------------------------- */
/*  Stand-ins                                    */
/* -------------------------------------------- */

/** An actor: owned or not, remembering the effects created on it. */
function makeActor(name, { isOwner = true } = {}) {
  return {
    name, uuid: `Actor.${name}`, isOwner, created: [],
    async createEmbeddedDocuments(type, data) { this.created.push(...data); return data; },
  };
}

/** An item, with effects. */
function makeItem(type, actor = null) {
  const item = { documentName: "Item", type, uuid: `Item.${type}`, actor, effects: null };
  item.effects = { contents: [] };
  return item;
}

/** An effect on `parent`. */
function makeEffect(parent, { id = "e1", name = "Terrified", transfer = false, mode = "targets", shape = "circle", size = 10, extra = {} } = {}) {
  const effect = {
    id, name, img: "icons/svg/terror.svg", parent, transfer, uuid: `${parent?.uuid ?? "Compendium.lotm.effects"}.ActiveEffect.${id}`,
    system: { application: { mode, shape, size } },
    toObject() {
      return structuredClone({
        _id: id, name, img: this.img, type: "effect", transfer, disabled: true, origin: null, statuses: ["fear"],
        start: { time: 5, combat: "c1" },
        duration: { value: 3, units: "rounds", startTime: 100, startRound: 2, startTurn: 1, combat: "c1" },
        system: { source: "Actor.old", application: { mode, shape, size }, hasResisted: true, isPenaltyHalved: true,
          hasInternalBleeding: true, impliedBy: "x", turnChecks: ["m:resist"], grantedFrom: "Item.ability" },
        _stats: { duplicateSource: null, exportSource: { uuid: "x" } },
        ...extra,
      });
    },
  };
  parent?.effects?.contents.push(effect);
  return effect;
}

const targetTokens = (...actors) => new Set(actors.map((actor) => ({ document: { name: `${actor.name} (token)` }, actor })));

beforeEach(() => {
  warnings.length = 0;
  chat.length = 0;
  queries.length = 0;
  game.user.targets = new Set();
  game.users.activeGM = null;
});

/* -------------------------------------------- */
/*  Use                                          */
/* -------------------------------------------- */

test("an Item effect with transfer is passive; otherwise its application mode", () => {
  const spell = makeItem("spell");
  assert.equal(effectUse(makeEffect(spell, { transfer: true })), "passive");
  assert.equal(effectUse(makeEffect(spell, { mode: "self" })), "self");
  // On an actor (or in a compendium) transfer means nothing: it's how it would be handed out.
  assert.equal(effectUse(makeEffect({ documentName: "Actor", uuid: "Actor.a" }, { transfer: true, mode: "area" })), "area");
});

test("new effects: passive on abilities, Sequences and gear; targets on actions and spells", () => {
  for (const type of ["ability", "sequence", "gear"]) assert.equal(defaultUseFor(type), "passive", type);
  for (const type of ["action", "spell"]) assert.equal(defaultUseFor(type), "targets", type);
  assert.deepEqual(useData("passive"), { transfer: true });
  assert.deepEqual(useData("zone"), { transfer: false, "system.application.mode": "zone" });
});

test("use labels: area and zone name the shape and size in the scene's units", () => {
  const spell = makeItem("spell");
  assert.equal(useLabel(makeEffect(spell, { transfer: true })), "Passive");
  assert.equal(useLabel(makeEffect(spell)), "Targets");
  assert.equal(useLabel(makeEffect(spell, { mode: "area", size: 10 })), "Area (once): Circle, 10 ft");
});

/* -------------------------------------------- */
/*  Copies                                       */
/* -------------------------------------------- */

test("a copy is a fresh effect: no id, no start, on, not passive, marks cleared, origin = the item", () => {
  const caster = makeActor("Klein");
  const spell = makeItem("spell", caster);
  const data = effectCopyData(makeEffect(spell), { source: caster.uuid });

  assert.equal(data._id, undefined);
  assert.equal(data.start, undefined);
  assert.deepEqual(data.duration, { value: 3, units: "rounds" }, "the length stays, the start doesn't");
  assert.equal(data.transfer, false);
  assert.equal(data.disabled, false);
  assert.equal(data.origin, "Item.spell");
  assert.deepEqual(data.statuses, ["fear"]);
  assert.equal(data.system.source, "Actor.Klein");
  assert.equal(data.system.hasResisted, false);
  assert.equal(data.system.isPenaltyHalved, false);
  assert.equal(data.system.hasInternalBleeding, true, "internal bleeding is part of the spell, so it stays");
  assert.equal(data.system.impliedBy, "");
  assert.deepEqual(data.system.turnChecks, []);
  assert.equal(data.system.grantedFrom, null);
  assert.equal(data._stats.duplicateSource, "Item.spell.ActiveEffect.e1");
  assert.equal(data._stats.exportSource, null);
});

test("a copy of a compendium effect keeps its own origin; an explicit origin wins", () => {
  const loose = makeEffect(null, { extra: { origin: "Compendium.lotm.effects.ActiveEffect.e1" } });
  assert.equal(effectCopyData(loose).origin, "Compendium.lotm.effects.ActiveEffect.e1");
  assert.equal(effectCopyData(loose, { origin: "RegionBehavior.b" }).origin, "RegionBehavior.b");
});

/* -------------------------------------------- */
/*  Handing out                                  */
/* -------------------------------------------- */

test("targets: each targeted actor gets one copy, source = the caster, and chat says who", async () => {
  const caster = makeActor("Klein");
  const goblin = makeActor("Goblin");
  const spell = makeItem("spell", caster);
  game.user.targets = targetTokens(goblin, goblin);   // the same actor twice (two tokens of a linked actor)

  const given = await applyItemEffect(makeEffect(spell));
  assert.deepEqual(given, ["Goblin (token)"]);
  assert.equal(goblin.created.length, 1);
  assert.equal(goblin.created[0].system.source, "Actor.Klein");
  assert.equal(chat.length, 1);
  assert.match(chat[0].content, /Klein applies Terrified to Goblin \(token\)\./);
});

test("targets with nothing targeted: a warning, nothing created", async () => {
  const caster = makeActor("Klein");
  const result = await applyItemEffect(makeEffect(makeItem("spell", caster)));
  assert.equal(result, null);
  assert.equal(caster.created.length, 0);
  assert.equal(warnings.length, 1);
});

test("self: the caster gets it; source = the one targeted enemy, none with zero or several targets", async () => {
  const caster = makeActor("Klein");
  const enemy = makeActor("Enemy");
  const other = makeActor("Other");
  const raid = makeItem("action", caster);
  const advantage = makeEffect(raid, { name: "Advantage", mode: "self" });

  game.user.targets = targetTokens(enemy);
  await applyItemEffect(advantage);
  assert.equal(caster.created.at(-1).system.source, "Actor.Enemy");

  game.user.targets = targetTokens(enemy, other);
  await applyItemEffect(advantage);
  assert.equal(caster.created.at(-1).system.source, null);

  game.user.targets = new Set();
  await applyItemEffect(advantage);
  assert.equal(caster.created.at(-1).system.source, null);
  assert.equal(caster.created.length, 3);
});

test("passive effects aren't handed out; an effect with no caster warns", async () => {
  const caster = makeActor("Klein");
  assert.equal(await applyItemEffect(makeEffect(makeItem("ability", caster), { transfer: true })), null);
  assert.equal(caster.created.length, 0);

  game.user.targets = targetTokens(makeActor("Goblin"));
  assert.equal(await applyItemEffect(makeEffect(makeItem("spell", null))), null, "a compendium spell nobody owns");
  assert.ok(warnings.some((w) => w.includes("Apply.NoCaster")));
});

test("someone else's actor: the GM is asked; with no GM it warns and skips them", async () => {
  const caster = makeActor("Klein");
  const enemy = makeActor("Enemy", { isOwner: false });
  const mine = makeActor("Ally");
  const spell = makeItem("spell", caster);

  // No GM logged in.
  const given = await giveEffect(makeEffect(spell), [{ name: "Enemy", actor: enemy }, { name: "Ally", actor: mine }], { caster, source: caster.uuid });
  assert.deepEqual(given, ["Ally"]);
  assert.equal(enemy.created.length, 0);
  assert.ok(warnings.some((w) => w.includes("Apply.NoGM")));

  // A GM: the query carries the actor and the effect data.
  game.users.activeGM = { query: async (name, data, options) => { queries.push({ name, data, options }); return true; } };
  const again = await giveEffect(makeEffect(spell), [{ name: "Enemy", actor: enemy }], { caster, source: caster.uuid });
  assert.deepEqual(again, ["Enemy"]);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].name, "lotm.createEffects");
  assert.equal(queries[0].data.actorUuid, "Actor.Enemy");
  assert.equal(queries[0].data.effects[0].system.source, "Actor.Klein");
});

test("the GM's side of the query creates the effects on that actor", async () => {
  const enemy = makeActor("Enemy");
  globalThis.fromUuid = async (uuid) => (uuid === enemy.uuid ? enemy : null);
  registerEffectQueries();
  const handler = CONFIG.queries["lotm.createEffects"];
  assert.equal(await handler({ actorUuid: enemy.uuid, effects: [{ name: "Terrified", type: "base" }] }), true);
  assert.equal(enemy.created[0].type, "effect", "always the system's effect type");
  assert.equal(await handler({ actorUuid: "Actor.nobody", effects: [{}] }), false);
  assert.equal(await handler({ actorUuid: enemy.uuid, effects: [] }), false);
});

/* -------------------------------------------- */
/*  Chat card buttons                            */
/* -------------------------------------------- */

test("attack cards get an Apply button per handed-out effect, none for passive ones", () => {
  const spell = makeItem("spell");
  makeEffect(spell, { id: "a", name: "Terrified <b>" });
  makeEffect(spell, { id: "b", name: "Aura", transfer: true });
  const html = effectButtonsHTML(spell);
  assert.match(html, /data-lotm-apply-effect="a"/);
  assert.doesNotMatch(html, /data-lotm-apply-effect="b"/);
  assert.match(html, /Apply Terrified &lt;b&gt;/);
  assert.equal(effectButtonsHTML(makeItem("action")), "", "no effects: nothing");
});
