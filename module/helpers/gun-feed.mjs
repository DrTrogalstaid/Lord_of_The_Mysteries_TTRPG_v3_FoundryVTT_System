/**
 * Gun feeds: how a gun holds its rounds, and which one fires next. No Foundry code here, so it's unit-tested
 * (tests/gun-feed.test.mjs); helpers/firearms.mjs does the saving, dialogs and chat.
 *
 * Every gun has a feed (system.firearm.feed):
 *
 *   magazine   Rifles, pistols, pump shotguns. A box or tube magazine: the LAST round loaded is the first to come
 *              out (it sits on top). A gun with a chamber fires from the chamber; self-loading guns chamber the next
 *              round by themselves after a shot, the others need a "chamber" action (work the bolt, rack the slide).
 *              A round can also be loaded straight into an empty chamber, to fire next.
 *   cylinder   Revolvers. One chamber per round, in a ring; the one under the hammer fires next. Each shot turns
 *              the cylinder one chamber. An empty chamber under the hammer "clicks": nothing fires, and the
 *              cylinder still turns. A rotate action puts any chamber under the hammer.
 *   barrels    Break-action shotguns (single or double barrel). One round per barrel, each with its own trigger:
 *              a shot uses a loaded barrel (the first one, unless the shooter picks), and empty barrels are skipped.
 *
 * Older guns have no feed saved (system.firearm.feed is blank). feedType() works it out: a gun with a chamber has a
 * magazine; one without was a revolver (a cylinder) or, holding 1 or 2 rounds, a break-action shotgun (barrels).
 * Their rounds were kept in the magazine list; a cylinder or barrels takes them over, in the order they would have
 * fired, and saves its feed the first time it changes.
 *
 * A round is { name, img, ammoId, abilities }: what it's called, its picture, the id of the ammo Item it came out
 * of (on the same actor), and the UUIDs of that ammo's abilities, copied when it was loaded, so a special bullet
 * keeps its powers even if its box is gone.
 *
 * Besides firing, each feed lists what can be done to it (handlingUses): reload and unload, plus chamber for magazine
 * guns with a chamber, and rotate for revolvers. These are the gun's handling buttons (helpers/gun-handling.mjs).
 *
 * Usage:
 *   const feed = GunFeed.for(gun.toObject().system.firearm);   // a copy that can be changed freely
 *   const fired = feed.fire(1);
 *   await gun.update(feed.toUpdate());
 */

/** The feed types, as stored in system.firearm.feed (blank on guns saved before feeds existed). */
export const FEED_TYPES = ["magazine", "cylinder", "barrels"];


/**
 * What can be done to a gun besides firing it, in the order its buttons show, and the Action Type each one takes
 * unless the gun's own Handling settings say otherwise (system.firearm.handling, helpers/gun-handling.mjs):
 *   reload   load rounds from an ammo box
 *   chamber  magazine guns with a chamber: work the bolt, rack the slide
 *   rotate   revolvers: put the chamber you pick under the hammer
 *   unload   take every round out
 */
export const HANDLING_DEFAULTS = { reload: "attack", chamber: "free", rotate: "quick", unload: "attack" };

/** The handling uses, in button order: ["reload", "chamber", "rotate", "unload"]. */
export const HANDLING_USES = Object.keys(HANDLING_DEFAULTS);


/**
 * A gun's feed type: the one it has saved, or for an older gun with none, the one it works like.
 * @param {object} firearm   system.firearm
 * @returns {"magazine"|"cylinder"|"barrels"}
 */
export function feedType(firearm) {
  if (FEED_TYPES.includes(firearm?.feed)) return firearm.feed;
  if (firearm?.hasChamber) return "magazine";
  const capacity = Math.max(0, Number(firearm?.capacity) || 0);
  return capacity <= 2 ? "barrels" : "cylinder";
}


/* -------------------------------------------- */
/*  Rounds                                       */
/* -------------------------------------------- */

/**
 * A round loaded from an ammo Item: its name and picture, where it came from, and its abilities.
 * @param {{id: string, name: string, img: string, system: {abilities_gained?: string[]}}} box
 * @returns {{name: string, img: string, ammoId: string, abilities: string[]}}
 */
export function roundFromAmmo(box) {
  return {
    name: box.name ?? "",
    img: box.img ?? "",
    ammoId: box.id ?? "",
    abilities: [...(box.system?.abilities_gained ?? [])],
  };
}


/** A special round: its ammo has abilities (their spells go off when it's fired). */
export const isSpecialRound = (round) => (round?.abilities?.length ?? 0) > 0;


/** Two rounds of the same kind: same name and the same abilities. */
export function sameKind(a, b) {
  if (!a || !b) return false;
  const abilities = (round) => [...(round.abilities ?? [])].sort().join("|");
  return a.name === b.name && abilities(a) === abilities(b);
}


/** A copy of a round, so feeds never share objects with what they were made from. */
const copyRound = (round) => (round ? { ...round, abilities: [...(round.abilities ?? [])] } : null);

/** A list of `length` positions from `rounds`: extra positions are empty; rounds past the end are kept. */
function fixedPositions(rounds, length) {
  const positions = (rounds ?? []).map(copyRound);
  while (positions.length < length) positions.push(null);
  return positions;
}


/* -------------------------------------------- */
/*  The feeds                                    */
/* -------------------------------------------- */

/**
 * What every feed can do. Use GunFeed.for(firearm) to get the right kind.
 * @abstract
 */
export class GunFeed {

  /**
   * @param {object} firearm   A gun's system.firearm data (a plain copy; the feed copies the rounds again).
   */
  constructor(firearm) {
    /** Rounds it holds (magazine size, chambers in the cylinder, barrels). */
    this.capacity = Math.max(0, Number(firearm.capacity) || 0);
  }

  /** The feed type, as saved in system.firearm.feed. @abstract */
  get type() {
    return "magazine";
  }

  /** What can be done to it besides firing (keys of HANDLING_DEFAULTS, in button order). Every gun loads and unloads. */
  get handlingUses() {
    return ["reload", "unload"];
  }


  /**
   * The right feed for a gun's data.
   * @param {object} firearm   system.firearm
   * @returns {MagazineFeed|CylinderFeed|BarrelFeed}
   */
  static for(firearm) {
    switch (feedType(firearm)) {
      case "cylinder": return new CylinderFeed(firearm);
      case "barrels": return new BarrelFeed(firearm);
      default: return new MagazineFeed(firearm);
    }
  }


  /** Rounds in the gun. */
  get loadedCount() {
    return this.firingOrder().filter((slot) => slot.round).length;
  }

  /** How many more rounds can be loaded (not counting loading straight into a chamber). @abstract */
  get room() {
    return 0;
  }

  /** The round that fires next, or null (empty, or a chamber that needs loading). */
  get next() {
    return this.firingOrder()[0]?.round ?? null;
  }

  /**
   * The rounds in firing order, as rows for the sheets: { round (or null), position, isChamber, isNext }.
   * @abstract
   * @returns {{round: object|null, position: number, isChamber?: boolean, isNext?: boolean}[]}
   */
  firingOrder() {
    return [];
  }

  /**
   * Load rounds (as many as there's room for). They go in after what's already there.
   * @abstract
   * @param {object[]} rounds
   * @param {object} [options]
   * @param {boolean} [options.intoChamber]   Magazine guns: put the first round straight into the empty chamber.
   * @returns {number}  How many were loaded.
   */
  load(rounds, options = {}) {
    return 0;
  }

  /**
   * Fire up to `amount` rounds.
   * @abstract
   * @param {number} amount
   * @param {object} [options]
   * @param {number[]} [options.positions]   Barrels: which ones (0-based). Default: the first loaded.
   * @returns {{fired: object[], clicked: boolean}}
   *   fired    The rounds that came out (fewer than `amount` when it ran out).
   *   clicked  A cylinder's empty chamber came up first: nothing fired, but the cylinder turned.
   */
  fire(amount, options = {}) {
    return { fired: [], clicked: false };
  }

  /**
   * Take every round out.
   * @abstract
   * @returns {object[]}
   */
  unload() {
    return [];
  }

  /**
   * The fields to save on the gun Item.
   * @abstract
   * @returns {object}
   */
  toUpdate() {
    return {};
  }
}


/**
 * A box or tube magazine, with or without a chamber. The magazine list is in loading order; the last round in it is
 * on top, so it's the next one out.
 */
export class MagazineFeed extends GunFeed {

  constructor(firearm) {
    super(firearm);
    this.hasChamber = !!firearm.hasChamber;
    this.selfLoading = !!firearm.selfLoading;
    this.magazine = (firearm.magazine ?? []).map(copyRound);
    this.chamber = this.hasChamber ? copyRound(firearm.chamber ?? null) : null;
  }

  /** @override */
  get room() {
    return Math.max(0, this.capacity - this.magazine.length);
  }

  /** A gun with a chamber can also be chambered (work the bolt, rack the slide). @override */
  get handlingUses() {
    return this.hasChamber ? ["reload", "chamber", "unload"] : ["reload", "unload"];
  }

  /** Whether a round can be loaded straight into the chamber. */
  get canLoadChamber() {
    return this.hasChamber && !this.chamber;
  }

  /**
   * With a chamber: the chamber, then the magazine from the top. A gun whose chamber is empty fires nothing until
   * a round is chambered, so `next` is null then.
   * @override
   */
  firingOrder() {
    const fromTop = [...this.magazine].reverse().map((round, i) => ({ round, position: this.magazine.length - i }));
    if (!this.hasChamber) {
      return fromTop.map((slot, i) => ({ ...slot, isNext: i === 0 }));
    }
    return [{ round: this.chamber, position: 0, isChamber: true, isNext: true }, ...fromTop];
  }

  /** @override */
  load(rounds, { intoChamber = false } = {}) {
    const queue = rounds.map(copyRound);
    let loaded = 0;
    if (intoChamber && this.canLoadChamber && queue.length) {
      this.chamber = queue.shift();
      return 1;   // a single round, by hand
    }
    while (queue.length && this.magazine.length < this.capacity) {
      this.magazine.push(queue.shift());
      loaded += 1;
    }
    return loaded;
  }

  /** Move the top round of the magazine into the empty chamber. @returns {object|null} The round, or null. */
  chamberNext() {
    if (!this.hasChamber || this.chamber || !this.magazine.length) return null;
    this.chamber = this.magazine.pop();
    return this.chamber;
  }

  /** @override */
  fire(amount) {
    const fired = [];
    while (fired.length < amount) {
      if (!this.hasChamber) {
        if (!this.magazine.length) break;
        fired.push(this.magazine.pop());
        continue;
      }
      // Fire the chambered round. A self-loading gun chambers the next by itself; others wait for a chamber action.
      if (!this.chamber) break;
      fired.push(this.chamber);
      this.chamber = this.selfLoading ? (this.magazine.pop() ?? null) : null;
    }
    return { fired, clicked: false };
  }

  /** @override */
  unload() {
    const rounds = [...this.magazine];
    if (this.chamber) rounds.push(this.chamber);
    this.magazine = [];
    this.chamber = null;
    return rounds;
  }

  /** @override */
  get type() {
    return "magazine";
  }

  /** @override */
  toUpdate() {
    return {
      "system.firearm.feed": this.type,
      "system.firearm.magazine": this.magazine,
      "system.firearm.chamber": this.chamber,
    };
  }
}


/**
 * A revolver's cylinder: a ring of chambers, and the one under the hammer (cylinderIndex, 0-based) fires next.
 */
export class CylinderFeed extends GunFeed {

  constructor(firearm) {
    super(firearm);
    this.cylinder = fixedPositions(adoptedRounds(firearm, firearm.cylinder), this.capacity);
    const size = this.cylinder.length;
    const index = Math.trunc(Number(firearm.cylinderIndex) || 0);
    this.index = size ? ((index % size) + size) % size : 0;
  }

  /** A revolver can also be rotated (pick the chamber under the hammer). @override */
  get handlingUses() {
    return ["reload", "rotate", "unload"];
  }

  /** The number of chambers. */
  get size() {
    return this.cylinder.length;
  }

  /** @override */
  get room() {
    return this.cylinder.filter((round) => !round).length;
  }

  /** Every chamber, starting with the one under the hammer and going round in firing order. @override */
  firingOrder() {
    const order = [];
    for (let step = 0; step < this.size; step++) {
      const position = (this.index + step) % this.size;
      order.push({ round: this.cylinder[position], position: position + 1, isNext: step === 0 });
    }
    return order;
  }

  /** Empty chambers are filled in firing order, starting under the hammer: the first round loaded fires first. @override */
  load(rounds) {
    const queue = rounds.map(copyRound);
    let loaded = 0;
    for (let step = 0; step < this.size && queue.length; step++) {
      const position = (this.index + step) % this.size;
      if (this.cylinder[position]) continue;
      this.cylinder[position] = queue.shift();
      loaded += 1;
    }
    return loaded;
  }

  /** Turn the cylinder one chamber. */
  turn() {
    if (this.size) this.index = (this.index + 1) % this.size;
  }

  /**
   * Put a chamber under the hammer.
   * @param {number} position   0-based.
   */
  rotateTo(position) {
    if (!this.size) return;
    const index = Math.trunc(Number(position) || 0);
    this.index = ((index % this.size) + this.size) % this.size;
  }

  /**
   * Each shot fires the chamber under the hammer, then the cylinder turns. An empty chamber under the hammer clicks:
   * the shots stop there (and the cylinder has still turned).
   * @override
   */
  fire(amount) {
    const fired = [];
    let clicked = false;
    while (fired.length < amount && this.size) {
      const round = this.cylinder[this.index];
      this.cylinder[this.index] = null;
      this.turn();
      if (!round) {
        clicked = fired.length === 0;
        break;
      }
      fired.push(round);
    }
    return { fired, clicked };
  }

  /** @override */
  unload() {
    const rounds = this.cylinder.filter(Boolean);
    this.cylinder = this.cylinder.map(() => null);
    return rounds;
  }

  /** @override */
  get type() {
    return "cylinder";
  }

  /** The magazine list is cleared too: an older gun's rounds were there, and are in the cylinder now. @override */
  toUpdate() {
    return {
      "system.firearm.feed": this.type,
      "system.firearm.cylinder": this.cylinder,
      "system.firearm.cylinderIndex": this.index,
      "system.firearm.magazine": [],
    };
  }
}


/**
 * Break-action barrels: one round per barrel, each with its own trigger.
 */
export class BarrelFeed extends GunFeed {

  constructor(firearm) {
    super(firearm);
    this.barrels = fixedPositions(adoptedRounds(firearm, firearm.barrels), this.capacity);
  }

  /** @override */
  get room() {
    return this.barrels.filter((round) => !round).length;
  }

  /** Every barrel in order; the first loaded one is next. @override */
  firingOrder() {
    const firstLoaded = this.barrels.findIndex(Boolean);
    return this.barrels.map((round, i) => ({ round, position: i + 1, isNext: i === firstLoaded }));
  }

  /** The 0-based positions of the loaded barrels. */
  get loadedPositions() {
    return this.barrels.map((round, i) => (round ? i : -1)).filter((i) => i >= 0);
  }

  /**
   * Whether the shooter should pick which barrel to fire: more barrels are loaded than the shot uses, and they
   * don't all hold the same kind of round.
   * @param {number} amount
   * @returns {boolean}
   */
  needsChoice(amount) {
    const loaded = this.loadedPositions.map((i) => this.barrels[i]);
    if (loaded.length <= amount) return false;
    return loaded.some((round) => !sameKind(round, loaded[0]));
  }

  /** Empty barrels are filled in order. @override */
  load(rounds) {
    const queue = rounds.map(copyRound);
    let loaded = 0;
    for (let i = 0; i < this.barrels.length && queue.length; i++) {
      if (this.barrels[i]) continue;
      this.barrels[i] = queue.shift();
      loaded += 1;
    }
    return loaded;
  }

  /** @override */
  fire(amount, { positions } = {}) {
    const chosen = (positions?.length ? positions : this.loadedPositions)
      .filter((i) => this.barrels[i])
      .slice(0, amount);
    const fired = chosen.map((i) => this.barrels[i]);
    for (const i of chosen) this.barrels[i] = null;
    return { fired, clicked: false };
  }

  /** @override */
  unload() {
    const rounds = this.barrels.filter(Boolean);
    this.barrels = this.barrels.map(() => null);
    return rounds;
  }

  /** @override */
  get type() {
    return "barrels";
  }

  /** The magazine list is cleared too: an older gun's rounds were there, and are in the barrels now. @override */
  toUpdate() {
    return {
      "system.firearm.feed": this.type,
      "system.firearm.barrels": this.barrels,
      "system.firearm.magazine": [],
    };
  }
}


/* -------------------------------------------- */
/*  Older guns                                   */
/* -------------------------------------------- */

/**
 * The rounds a cylinder or barrels start with: their own, or, when they're all empty and the magazine list has
 * rounds (an older revolver or shotgun kept them there), those, in the order they would have fired.
 * @param {object} firearm
 * @param {(object|null)[]} [positions]
 * @returns {(object|null)[]}
 */
function adoptedRounds(firearm, positions) {
  const own = positions ?? [];
  if (own.some(Boolean)) return own;
  const legacy = firearm.magazine ?? [];
  return legacy.length ? legacy : own;
}
