import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { linkExistingCharacters, prototypeTokenDefaults } from "../module/helpers/token-settings.mjs";

/*
 * Player character tokens are linked to the character (helpers/token-settings.mjs). Foundry isn't loaded: the
 * world, its settings and actors are small stand-ins with only what the code reads.
 */

let settings, updates, actors, isGM;
const actor = (id, type, actorLink) => ({ id, type, prototypeToken: { actorLink } });

beforeEach(() => {
  settings = { charactersTokensLinked: false, tokenDisplayName: 30, tokenDisplayBars: 30 };
  updates = [];
  isGM = true;
  actors = [actor("pc1", "character", false), actor("pc2", "character", true), actor("npc1", "npc", false)];
  globalThis.game = {
    user: { get isActiveGM() { return isGM; } },
    actors: { filter: (fn) => actors.filter(fn) },
    settings: {
      get: (scope, key) => settings[key],
      set: async (scope, key, value) => { settings[key] = value; },
    },
  };
  globalThis.Actor = { implementation: { updateDocuments: async (data) => { updates.push(...data); } } };
});

test("new player characters get a linked token, NPCs don't", () => {
  assert.equal(prototypeTokenDefaults("character").actorLink, true);
  assert.equal("actorLink" in prototypeTokenDefaults("npc"), false);
});

test("existing unlinked player characters are linked, once; NPCs and linked characters are left alone", async () => {
  assert.equal(await linkExistingCharacters(), 1);
  assert.deepEqual(updates, [{ _id: "pc1", "prototypeToken.actorLink": true }]);
  assert.equal(settings.charactersTokensLinked, true);

  // The GM unlinks one on purpose; the next load doesn't link it again.
  updates.length = 0;
  actors[0].prototypeToken.actorLink = false;
  assert.equal(await linkExistingCharacters(), 0);
  assert.deepEqual(updates, []);
});

test("only the active GM does it", async () => {
  isGM = false;
  assert.equal(await linkExistingCharacters(), 0);
  assert.deepEqual(updates, []);
  assert.equal(settings.charactersTokensLinked, false);
});
