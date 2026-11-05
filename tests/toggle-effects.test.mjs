import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/*
 * Toggled effects (effects/toggle-effects.mjs): an action like Activate Spirit Vision switches its effect on and off.
 * Foundry isn't loaded: actors, items, effects and chat are small stand-ins with only what the code reads.
 */

const STRINGS = {
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.On": "On",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.Off": "Off",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipOn": "{name} is on.",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipOff": "{name} is off.",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipOffCost": "{name} is off ({cost}).",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.ChatOn": "{name} switches on {effect}.",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.ChatOff": "{name} switches off {effect}.",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.Button": "Switch {name} on / off",
  "LORD_OF_THE_MYSTERIES.Effects.Apply.Button": "Apply {name}",
  "LORD_OF_THE_MYSTERIES.Spirituality.NotEnough": "{name} has only {value} ({cost} needed).",
  "LORD_OF_THE_MYSTERIES.Spirituality.RollNote": "-{amount} Spirituality",
  "LORD_OF_THE_MYSTERIES.Spirituality.Chat": "{name} spends {amount} Spirituality{reason}.",
  "LORD_OF_THE_MYSTERIES.Spirituality.ChatReason": " on {reason}",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.TooltipUpkeep": "Then {upkeep} per round.",
  "LORD_OF_THE_MYSTERIES.Effects.Toggle.RanOut": "{name} can't keep up {effect}.",
};
const fill = (text, data) => text.replace(/\{(\w+)\}/g, (match, key) => (key in data ? String(data[key]) : match));
const warnings = [];
const chat = [];

globalThis.Handlebars = { escapeExpression: (text) => String(text ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;") };
globalThis.CONFIG = {
  LORD_OF_THE_MYSTERIES: {
    effectApplicationModes: { targets: "Targets", self: "Self", area: "Area", zone: "Zone", toggle: "Toggle" },
    effectAreaShapes: {},
  },
  specialStatusEffects: {},
  queries: {},
};
globalThis.ui = { notifications: { warn: (m) => warnings.push(m), info: (m) => warnings.push(m) } };
globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ alias: actor?.name }), create: async (data) => chat.push(data.content) };
globalThis.game = {
  i18n: { localize: (key) => STRINGS[key] ?? key, format: (key, data = {}) => fill(STRINGS[key] ?? key, data) },
  user: { targets: new Set() },
  users: { activeGM: null },
};

const toggles = await import("../module/effects/toggle-effects.mjs");
const { applyItemEffect, effectButtonsHTML } = await import("../module/effects/effect-application.mjs");

/* -------------------------------------------- */
/*  Stand-ins                                    */
/* -------------------------------------------- */

/** A character: its effects, and its Spirituality. Owned by the user. */
function makeActor({ spirituality = 5 } = {}) {
  let nextId = 1;
  const actor = {
    name: "Klein", uuid: "Actor.klein", isOwner: true,
    system: { resources: { spp: { value: spirituality, max: 10 } } },
    effects: {
      contents: [],
      has(id) { return this.contents.some((effect) => effect.id === id); },
    },
    async createEmbeddedDocuments(type, data) {
      const made = data.map((entry) => ({ ...structuredClone(entry), id: `copy${nextId++}` }));
      this.effects.contents.push(...made);
      return made;
    },
    async deleteEmbeddedDocuments(type, ids) {
      this.effects.contents = this.effects.contents.filter((effect) => !ids.includes(effect.id));
      return ids;
    },
    async update(changes) {
      this.system.resources.spp.value = changes["system.resources.spp.value"];
    },
  };
  return actor;
}

/** An action (Activate Spirit Vision), with a Spirituality Cost and effects. */
function makeAction({ cost = 1, uses = ["toggle"], upkeep = 0 } = {}) {
  const action = {
    documentName: "Item", type: "action", name: "Activate Spirit Vision", img: "eye.webp",
    uuid: "Compendium.lotm.action_compendium.Item.activate",
    system: { spiritualityCost: cost },
    effects: { contents: [] },
  };
  action.effects.get = (id) => action.effects.contents.find((effect) => effect.id === id);
  uses.forEach((mode, i) => {
    const id = `e${i + 1}`;
    action.effects.contents.push({
      id, name: i === 0 ? "Spirit Vision" : `Effect ${id}`, img: "eye.webp", parent: action, transfer: false,
      uuid: `${action.uuid}.ActiveEffect.${id}`,
      system: { application: { mode }, upkeep },
      toObject() {
        return {
          _id: id, name: this.name, type: "effect", transfer: false, disabled: false,
          changes: [{ key: "token.sight.visionMode", value: "lotmSpiritVision" }],
          flags: { other: { keep: true } },
          system: { application: { mode }, upkeep },
        };
      },
    });
  });
  return action;
}

beforeEach(() => {
  warnings.length = 0;
  chat.length = 0;
});

/* -------------------------------------------- */
/*  Tests                                        */
/* -------------------------------------------- */

test("an action's toggled effects are the ones whose Use is Toggle", () => {
  const action = makeAction({ uses: ["toggle", "targets", "toggle"] });
  assert.deepEqual(toggles.toggleEffectsOf(action).map((effect) => effect.id), ["e1", "e3"]);
  assert.deepEqual(toggles.toggleEffectsOf(makeAction({ uses: ["self"] })), []);
});

test("a toggled copy remembers its effect, and keeps the effect's other flags", () => {
  const effect = makeAction().effects.contents[0];
  const data = toggles.toggledCopyData(effect);
  assert.equal(data.flags.lotm.toggledFrom, effect.uuid);
  assert.deepEqual(data.flags.other, { keep: true });
  assert.equal(data._id, undefined, "a new effect");
});

test("switching on: one copy on the user, the Spirituality Cost spent, one chat line naming the effect", async () => {
  const actor = makeActor({ spirituality: 5 });
  const action = makeAction({ cost: 1 });
  assert.equal(await toggles.useToggleAction(actor, action), true);
  assert.equal(actor.effects.contents.length, 1);
  assert.equal(actor.effects.contents[0].flags.lotm.toggledFrom, action.effects.contents[0].uuid);
  assert.equal(actor.system.resources.spp.value, 4);
  assert.equal(toggles.isToggledOn(actor, action), true);
  assert.equal(chat.length, 1);
  assert.match(chat[0], /Klein switches on Spirit Vision\./);
  assert.match(chat[0], /-1 Spirituality/);
});

test("switching off: the copies go, nothing spent, chat says so", async () => {
  const actor = makeActor({ spirituality: 5 });
  const action = makeAction({ cost: 1 });
  await toggles.useToggleAction(actor, action);
  assert.equal(await toggles.useToggleAction(actor, action), false);
  assert.equal(actor.effects.contents.length, 0);
  assert.equal(actor.system.resources.spp.value, 4, "only switching on costs");
  assert.equal(toggles.isToggledOn(actor, action), false);
  assert.match(chat.at(-1), /Klein switches off Spirit Vision\./);
});

test("not enough Spirituality: a warning, and it stays off", async () => {
  const actor = makeActor({ spirituality: 0 });
  const action = makeAction({ cost: 1 });
  assert.equal(await toggles.useToggleAction(actor, action), null);
  assert.equal(actor.effects.contents.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(chat.length, 0);
});

test("no cost: switches on without spending; several toggled effects all go on and off together", async () => {
  const actor = makeActor({ spirituality: 0 });
  const action = makeAction({ cost: 0, uses: ["toggle", "toggle"] });
  assert.equal(await toggles.useToggleAction(actor, action), true);
  assert.equal(actor.effects.contents.length, 2);
  assert.match(chat[0], /switches on Activate Spirit Vision/, "several effects: the action is named");
  await toggles.useToggleAction(actor, action);
  assert.equal(actor.effects.contents.length, 0);
});

test("deleting the copy by hand counts as switched off; other actions' copies don't count", async () => {
  const actor = makeActor();
  const action = makeAction({ cost: 0 });
  await toggles.useToggleAction(actor, action);
  actor.effects.contents = [];
  assert.equal(toggles.isToggledOn(actor, action), false);

  actor.effects.contents.push({ id: "x", flags: { lotm: { toggledFrom: "Item.other.ActiveEffect.e1" } } });
  assert.equal(toggles.isToggledOn(actor, action), false);
});

test("an action with nothing to toggle: no button, and using it does nothing", async () => {
  const actor = makeActor();
  const action = makeAction({ uses: ["self"] });
  assert.equal(toggles.toggleButton(actor, action), null);
  assert.equal(await toggles.useToggleAction(actor, action), null);
});

test("the sheet's button: Off with the cost while off, On while on", async () => {
  const actor = makeActor();
  const action = makeAction({ cost: 2 });
  assert.deepEqual(toggles.toggleButton(actor, action), { isOn: false, label: "Off", tooltip: "Activate Spirit Vision is off (2)." });
  await toggles.useToggleAction(actor, action);
  assert.deepEqual(toggles.toggleButton(actor, action), { isOn: true, label: "On", tooltip: "Activate Spirit Vision is on." });
});

test("the attack card's button switches the one effect on and off, without spending", async () => {
  const actor = makeActor({ spirituality: 5 });
  const action = makeAction({ cost: 1 });
  const effect = action.effects.contents[0];
  assert.match(effectButtonsHTML(action), /Switch Spirit Vision on \/ off/);
  assert.deepEqual(await applyItemEffect(effect, { caster: actor }), ["Klein"]);
  assert.equal(actor.effects.contents.length, 1);
  assert.deepEqual(await applyItemEffect(effect, { caster: actor }), ["Klein"]);
  assert.equal(actor.effects.contents.length, 0);
  assert.equal(actor.system.resources.spp.value, 5);
});


/* -------------------------------------------- */
/*  Keeping it up: Spirituality per round        */
/* -------------------------------------------- */

test("each turn in combat: 1 Spirituality to keep Spirit Vision up, said in chat", async () => {
  const actor = makeActor({ spirituality: 3 });
  const action = makeAction({ cost: 1, upkeep: 1 });
  await toggles.useToggleAction(actor, action);              // 3 -> 2 to switch on
  chat.length = 0;
  assert.deepEqual(await toggles.payUpkeep(actor), { kept: ["Spirit Vision"], ended: [] });
  assert.equal(actor.system.resources.spp.value, 1);
  assert.equal(actor.effects.contents.length, 1, "still on");
  assert.match(chat[0], /Klein spends 1 Spirituality on Spirit Vision\./);
});

test("can't pay: it switches off, nothing is spent, chat says so", async () => {
  const actor = makeActor({ spirituality: 1 });
  const action = makeAction({ cost: 1, upkeep: 1 });
  await toggles.useToggleAction(actor, action);              // 1 -> 0
  chat.length = 0;
  assert.deepEqual(await toggles.payUpkeep(actor), { kept: [], ended: ["Spirit Vision"] });
  assert.equal(actor.effects.contents.length, 0);
  assert.equal(toggles.isToggledOn(actor, action), false);
  assert.equal(actor.system.resources.spp.value, 0);
  assert.match(chat[0], /Klein can't keep up Spirit Vision\./);
  assert.equal(warnings.length, 0, "no warning pop-up on the GM's screen");
});

test("free to keep up, switched off, turned off, or not a toggle: nothing is charged", async () => {
  const actor = makeActor({ spirituality: 5 });
  await toggles.useToggleAction(actor, makeAction({ cost: 0, upkeep: 0 }));
  actor.effects.contents.push(
    { id: "manual", name: "Bless", flags: {}, system: { upkeep: 2 }, disabled: false },          // not a toggle copy
    { id: "paused", name: "Paused", flags: { lotm: { toggledFrom: "x" } }, system: { upkeep: 2 }, disabled: true },
  );
  assert.deepEqual(await toggles.payUpkeep(actor), { kept: [], ended: [] });
  assert.equal(actor.system.resources.spp.value, 5);
  assert.deepEqual(await toggles.payUpkeep(null), { kept: [], ended: [] });
});

test("two effects kept up: each paid in turn; the one that can't be paid ends", async () => {
  const actor = makeActor({ spirituality: 4 });
  await toggles.useToggleAction(actor, makeAction({ cost: 0, upkeep: 3 }));
  const other = makeAction({ cost: 0, upkeep: 2 });
  other.uuid = "Item.other";
  other.effects.contents[0].uuid = "Item.other.ActiveEffect.e1";
  other.effects.contents[0].name = "Danger Sense";
  await toggles.useToggleAction(actor, other);
  assert.deepEqual(await toggles.payUpkeep(actor), { kept: ["Spirit Vision"], ended: ["Danger Sense"] });
  assert.equal(actor.system.resources.spp.value, 1);
});

test("the sheet's button mentions the per-round cost", () => {
  const button = toggles.toggleButton(makeActor(), makeAction({ cost: 1, upkeep: 1 }));
  assert.equal(button.tooltip, "Activate Spirit Vision is off (1). Then 1 per round.");
  assert.equal(toggles.upkeepOf({ system: { upkeep: "2" } }), 2);
  assert.equal(toggles.upkeepOf({ system: {} }), 0);
});
