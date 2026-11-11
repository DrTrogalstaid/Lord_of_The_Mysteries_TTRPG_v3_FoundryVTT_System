import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BarrelFeed, CylinderFeed, GunFeed, HANDLING_DEFAULTS, MagazineFeed, feedType, isSpecialRound, roundFromAmmo,
  sameKind,
} from "../module/helpers/gun-feed.mjs";

/*
 * Gun feeds (helpers/gun-feed.mjs): which round fires next, loading, rotating and unloading,
 * for magazines (rifles, pistols), cylinders (revolvers) and barrels (break-action shotguns).
 */

const lead = { name: "Lead", img: "lead.png", ammoId: "box1", abilities: [] };
const silver = { name: "Silver Bullet", img: "silver.png", ammoId: "box2", abilities: ["Compendium.lotm.ability_compendium.Item.purify"] };
const names = (rounds) => rounds.map((round) => round?.name ?? "-");

/* -------------------------------------------- */
/*  Rounds                                       */
/* -------------------------------------------- */

test("a round loaded from ammo keeps its name, picture, box and the ammo's abilities", () => {
  const box = { id: "box2", name: "Silver Bullet", img: "silver.png", system: { abilities_gained: ["A.1", "A.2"] } };
  const round = roundFromAmmo(box);
  assert.deepEqual(round, { name: "Silver Bullet", img: "silver.png", ammoId: "box2", abilities: ["A.1", "A.2"] });
  box.system.abilities_gained.push("A.3");
  assert.equal(round.abilities.length, 2, "a copy, not the ammo's own list");
  assert.equal(isSpecialRound(round), true);
  assert.equal(isSpecialRound(lead), false);
  assert.equal(isSpecialRound(null), false);
});

test("same kind: same name and the same abilities", () => {
  assert.equal(sameKind(lead, { ...lead, ammoId: "other" }), true);
  assert.equal(sameKind(lead, silver), false);
  assert.equal(sameKind(silver, { ...silver, abilities: [] }), false);
  assert.equal(sameKind(lead, null), false);
});

test("GunFeed.for picks the feed by system.firearm.feed", () => {
  assert.ok(GunFeed.for({ feed: "cylinder", capacity: 6 }) instanceof CylinderFeed);
  assert.ok(GunFeed.for({ feed: "barrels", capacity: 2 }) instanceof BarrelFeed);
  assert.ok(GunFeed.for({ feed: "magazine", capacity: 5 }) instanceof MagazineFeed);
  assert.equal(GunFeed.for({ feed: "cylinder", capacity: 6 }).type, "cylinder");
  assert.deepEqual(Object.keys(GunFeed.for({ feed: "barrels", capacity: 2 }).toUpdate()).sort(),
    ["system.firearm.barrels", "system.firearm.feed", "system.firearm.magazine"], "saving a feed saves its type too");
});

test("handling: every gun reloads and unloads; magazines with a chamber also chamber, revolvers also rotate", () => {
  assert.deepEqual(HANDLING_DEFAULTS, { reload: "attack", chamber: "free", rotate: "quick", unload: "attack" });
  assert.deepEqual(GunFeed.for({ feed: "magazine", capacity: 5, hasChamber: true }).handlingUses, ["reload", "chamber", "unload"]);
  assert.deepEqual(GunFeed.for({ feed: "magazine", capacity: 5, hasChamber: false }).handlingUses, ["reload", "unload"]);
  assert.deepEqual(GunFeed.for({ feed: "cylinder", capacity: 6 }).handlingUses, ["reload", "rotate", "unload"]);
  assert.deepEqual(GunFeed.for({ feed: "barrels", capacity: 2 }).handlingUses, ["reload", "unload"]);
  const buttonOrder = ["reload", "chamber", "rotate", "unload"];
  for (const feed of ["magazine", "cylinder", "barrels"]) {
    const uses = GunFeed.for({ feed, capacity: 2, hasChamber: true }).handlingUses;
    assert.deepEqual(uses, buttonOrder.filter((use) => uses.includes(use)), `${feed}: in button order`);
  }
});

/* -------------------------------------------- */
/*  Magazine                                     */
/* -------------------------------------------- */

test("magazine: the last round loaded fires first", () => {
  const feed = GunFeed.for({ feed: "magazine", capacity: 5, magazine: [] });
  assert.equal(feed.load([silver]), 1);
  assert.equal(feed.load([lead, lead, lead, lead, lead]), 4, "only as many as fit");
  assert.equal(feed.room, 0);
  assert.deepEqual(names(feed.fire(2).fired), ["Lead", "Lead"]);
  assert.deepEqual(names(feed.fire(5).fired), ["Lead", "Lead", "Silver Bullet"], "the first loaded comes out last");
  assert.equal(feed.next, null);
});

test("magazine with a chamber: fires the chamber; a bolt action needs chambering, a self-loader doesn't", () => {
  const bolt = GunFeed.for({ feed: "magazine", capacity: 5, hasChamber: true, magazine: [lead, silver], chamber: null });
  assert.equal(bolt.next, null, "nothing chambered: won't fire");
  assert.deepEqual(bolt.fire(1).fired, []);
  assert.equal(bolt.chamberNext().name, "Silver Bullet", "the top round goes in");
  assert.deepEqual(names(bolt.fire(2).fired), ["Silver Bullet"], "then it needs chambering again");
  assert.equal(bolt.chamber, null);

  const auto = GunFeed.for({ feed: "magazine", capacity: 5, hasChamber: true, selfLoading: true, magazine: [lead, silver], chamber: lead });
  assert.deepEqual(names(auto.fire(3).fired), ["Lead", "Silver Bullet", "Lead"]);
});

test("magazine: a round straight into the empty chamber fires next", () => {
  const feed = GunFeed.for({ feed: "magazine", capacity: 5, hasChamber: true, magazine: [lead, lead], chamber: null });
  assert.equal(feed.canLoadChamber, true);
  assert.equal(feed.load([silver, silver], { intoChamber: true }), 1, "one round, by hand");
  assert.equal(feed.next.name, "Silver Bullet");
  assert.equal(feed.magazine.length, 2, "the magazine is untouched");
  assert.equal(feed.canLoadChamber, false);
});

test("magazine: firing order lists the chamber, then the magazine from the top", () => {
  const feed = GunFeed.for({ feed: "magazine", capacity: 5, hasChamber: true, magazine: [silver, lead], chamber: lead });
  const order = feed.firingOrder();
  assert.deepEqual(order.map((slot) => [slot.isChamber ?? false, slot.round?.name]), [[true, "Lead"], [false, "Lead"], [false, "Silver Bullet"]]);
  assert.equal(order[0].isNext, true);
});

test("magazine: unload takes everything; the update saves the feed, magazine and chamber", () => {
  const feed = GunFeed.for({ feed: "magazine", capacity: 5, hasChamber: true, magazine: [lead, silver], chamber: lead });
  assert.equal(feed.unload().length, 3);
  assert.deepEqual(feed.toUpdate(), { "system.firearm.feed": "magazine", "system.firearm.magazine": [], "system.firearm.chamber": null });
});

test("feeds copy the rounds: changing a feed never changes the gun's data", () => {
  const firearm = { feed: "magazine", capacity: 5, magazine: [lead] };
  const feed = GunFeed.for(firearm);
  feed.fire(1);
  assert.equal(firearm.magazine.length, 1);
});

/* -------------------------------------------- */
/*  Cylinder                                     */
/* -------------------------------------------- */

test("cylinder: loading fills empty chambers from the hammer round, so the first loaded fires first", () => {
  const feed = GunFeed.for({ feed: "cylinder", capacity: 6, cylinder: [], cylinderIndex: 4 });
  assert.equal(feed.size, 6);
  assert.equal(feed.load([silver]), 1);
  assert.equal(feed.load([lead, lead, lead, lead, lead, lead]), 5);
  assert.equal(feed.room, 0);
  assert.equal(feed.cylinder[4].name, "Silver Bullet", "chamber 5 was under the hammer");
  assert.equal(feed.next.name, "Silver Bullet");
});

test("cylinder: each shot turns it one chamber; it wraps round", () => {
  const feed = GunFeed.for({ feed: "cylinder", capacity: 3, cylinder: [lead, silver, lead], cylinderIndex: 2 });
  assert.deepEqual(names(feed.fire(1).fired), ["Lead"]);
  assert.equal(feed.index, 0, "from chamber 3 back to chamber 1");
  assert.deepEqual(names(feed.fire(2).fired), ["Lead", "Silver Bullet"]);
  assert.equal(feed.room, 3);
});

test("cylinder: an empty chamber under the hammer clicks, and the cylinder still turns", () => {
  const feed = GunFeed.for({ feed: "cylinder", capacity: 6, cylinder: [null, silver, null, null, null, null], cylinderIndex: 0 });
  const result = feed.fire(1);
  assert.deepEqual(result.fired, []);
  assert.equal(result.clicked, true);
  assert.equal(feed.index, 1);
  assert.equal(feed.fire(1).fired[0].name, "Silver Bullet", "the next pull fires the silver bullet");
});

test("cylinder: two shots stop at an empty chamber (no click when one fired)", () => {
  const feed = GunFeed.for({ feed: "cylinder", capacity: 6, cylinder: [lead, null, lead], cylinderIndex: 0 });
  const result = feed.fire(2);
  assert.deepEqual(names(result.fired), ["Lead"]);
  assert.equal(result.clicked, false);
});

test("cylinder: rotate puts any chamber under the hammer; firing order starts there", () => {
  const feed = GunFeed.for({ feed: "cylinder", capacity: 6, cylinder: [lead, lead, silver, lead, null, lead], cylinderIndex: 0 });
  feed.rotateTo(2);
  assert.equal(feed.next.name, "Silver Bullet");
  const order = feed.firingOrder();
  assert.deepEqual(order.map((slot) => slot.position), [3, 4, 5, 6, 1, 2]);
  assert.equal(order[0].isNext, true);
  assert.equal(order[2].round, null, "chamber 5 is empty");
  feed.rotateTo(8);
  assert.equal(feed.index, 2, "wraps round");
  assert.deepEqual(feed.toUpdate()["system.firearm.cylinderIndex"], 2);
});

test("cylinder: a bigger capacity adds empty chambers; unload empties every chamber", () => {
  const feed = GunFeed.for({ feed: "cylinder", capacity: 6, cylinder: [lead, silver], cylinderIndex: 0 });
  assert.deepEqual(names(feed.cylinder), ["Lead", "Silver Bullet", "-", "-", "-", "-"]);
  assert.equal(feed.unload().length, 2);
  assert.deepEqual(feed.toUpdate()["system.firearm.cylinder"], [null, null, null, null, null, null]);
});

/* -------------------------------------------- */
/*  Barrels                                      */
/* -------------------------------------------- */

test("barrels: loading fills empty barrels in order; a shot uses the first loaded barrel", () => {
  const feed = GunFeed.for({ feed: "barrels", capacity: 2, barrels: [] });
  assert.equal(feed.load([silver, lead, lead]), 2);
  assert.deepEqual(names(feed.fire(1).fired), ["Silver Bullet"]);
  assert.deepEqual(names(feed.barrels), ["-", "Lead"]);
  assert.deepEqual(names(feed.fire(1).fired), ["Lead"], "an empty barrel is skipped (its own trigger)");
  assert.deepEqual(feed.fire(1).fired, []);
});

test("barrels: both at once, or the barrel the shooter picks", () => {
  const both = GunFeed.for({ feed: "barrels", capacity: 2, barrels: [lead, silver] });
  assert.deepEqual(names(both.fire(2).fired), ["Lead", "Silver Bullet"]);

  const pick = GunFeed.for({ feed: "barrels", capacity: 2, barrels: [lead, silver] });
  assert.deepEqual(names(pick.fire(1, { positions: [1] }).fired), ["Silver Bullet"]);
  assert.deepEqual(names(pick.barrels), ["Lead", "-"]);
});

test("barrels: the shooter only picks when loaded barrels hold different rounds and not all fire", () => {
  assert.equal(GunFeed.for({ feed: "barrels", capacity: 2, barrels: [lead, silver] }).needsChoice(1), true);
  assert.equal(GunFeed.for({ feed: "barrels", capacity: 2, barrels: [lead, silver] }).needsChoice(2), false);
  assert.equal(GunFeed.for({ feed: "barrels", capacity: 2, barrels: [lead, lead] }).needsChoice(1), false);
  assert.equal(GunFeed.for({ feed: "barrels", capacity: 1, barrels: [silver] }).needsChoice(1), false);
  assert.equal(GunFeed.for({ feed: "barrels", capacity: 2, barrels: [null, silver] }).needsChoice(1), false);
});

/* -------------------------------------------- */
/*  Older guns                                   */
/* -------------------------------------------- */

test("older guns (no feed saved): a chambered gun is a magazine; otherwise a cylinder, or barrels if it holds 1-2", () => {
  assert.equal(feedType({ feed: "", capacity: 5, hasChamber: true }), "magazine");
  assert.equal(feedType({ feed: "", capacity: 6, hasChamber: false }), "cylinder");
  assert.equal(feedType({ feed: "", capacity: 2, hasChamber: false }), "barrels");
  assert.equal(feedType({ feed: "", capacity: 1 }), "barrels");
  assert.equal(feedType({ feed: "cylinder", capacity: 2, hasChamber: true }), "cylinder", "a saved feed wins");
  assert.ok(GunFeed.for({ capacity: 6, hasChamber: false }) instanceof CylinderFeed);
});

test("older guns: a revolver or shotgun takes over the rounds kept in its magazine list, in firing order", () => {
  const revolver = GunFeed.for({ feed: "", capacity: 6, hasChamber: false, magazine: [silver, lead, lead] });
  assert.deepEqual(names(revolver.cylinder), ["Silver Bullet", "Lead", "Lead", "-", "-", "-"]);
  assert.equal(revolver.next.name, "Silver Bullet", "the same round fires next as before");
  const saved = revolver.toUpdate();
  assert.equal(saved["system.firearm.feed"], "cylinder");
  assert.deepEqual(saved["system.firearm.magazine"], [], "the old list is emptied when it's saved");

  const shotgun = GunFeed.for({ feed: "", capacity: 2, hasChamber: false, magazine: [lead] });
  assert.deepEqual(names(shotgun.barrels), ["Lead", "-"]);

  const rifle = GunFeed.for({ feed: "", capacity: 5, hasChamber: true, magazine: [lead], chamber: silver });
  assert.equal(rifle.next.name, "Silver Bullet");
  assert.equal(rifle.magazine.length, 1);
});

test("older guns: a cylinder that already has rounds ignores the magazine list", () => {
  const feed = GunFeed.for({ feed: "cylinder", capacity: 6, cylinder: [lead, null], cylinderIndex: 0, magazine: [silver] });
  assert.deepEqual(names(feed.cylinder), ["Lead", "-", "-", "-", "-", "-"]);
});
