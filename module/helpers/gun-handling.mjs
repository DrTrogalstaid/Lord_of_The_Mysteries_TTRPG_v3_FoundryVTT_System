/**
 * Gun handling: what a character can do to a gun besides firing it (Reload, Chamber, Rotate, Unload). Each one is a
 * button on the row of every action that fires the gun (its Shoot rows), next to the attack and damage buttons, and
 * hovering over it says how long it takes ("Reload: Attack action").
 *
 * Which ones a gun has depends on its feed (handlingUses in helpers/gun-feed.mjs):
 *   magazine   Reload, Chamber (only with a chamber), Unload
 *   cylinder   Reload, Rotate, Unload
 *   barrels    Reload, Unload
 * How long each one takes (its Action Type), and how many rounds one Reload loads, are the gun's own Handling
 * settings (system.firearm.handling in data/item/character_building/gear.mjs, set on the gun's sheet). They start at
 * HANDLING_DEFAULTS: Reload Attack, Chamber Free, Rotate Quick, Unload Attack.
 *
 * A GunHandling is "one thing you can do to one gun", e.g. "Reload the Revolver". It has a name and
 * system.actionType / system.traits like an action Item, so the status checks read it the same way: a Reload that's
 * an Attack action warns while Dying (effects/status-restrictions.mjs).
 *
 * Usage:
 *   for (const handling of GunHandling.listFor(gun)) console.log(handling.label, handling.tooltip);
 *   await GunHandling.get(gun, "reload")?.perform(actor, { fast: true });
 */

import { HANDLING_DEFAULTS } from "./gun-feed.mjs";
import { chamberRound, feedOf, reloadGun, rotateCylinder, unloadGun } from "./firearms.mjs";
import { confirmStatusRestrictions, postUsedDespite } from "../effects/status-restrictions.mjs";

const L = "LORD_OF_THE_MYSTERIES.Firearm";


export class GunHandling {

  /**
   * @param {Item} gun
   * @param {"reload"|"chamber"|"rotate"|"unload"} use
   * @param {GunFeed} [feed]   The gun's feed, if it's already been read (listFor reads it once for every button).
   */
  constructor(gun, use, feed = feedOf(gun)) {
    /** The gun Item. */
    this.gun = gun;
    /** What it does: "reload", "chamber", "rotate" or "unload". */
    this.use = use;
    /** The gun's feed when this was made, to tell whether there's anything to do (isIdle). */
    this.feed = feed;

    const settings = gun.system.firearm?.handling?.[use] ?? {};
    const types = CONFIG.LORD_OF_THE_MYSTERIES.actionTypes;
    /** Its Action Type ("attack", "quick"...): the gun's setting, or the default. */
    this.actionType = settings.actionType in types ? settings.actionType : HANDLING_DEFAULTS[use];
    /** Reload: the most rounds one use loads (0 = as many as fit). 0 for the others. */
    this.rounds = use === "reload" ? Math.max(0, Math.trunc(Number(settings.rounds) || 0)) : 0;
  }


  /**
   * Everything that can be done to a gun besides firing it, in button order. Nothing for a missing gun or an Item
   * that isn't a firearm.
   * @param {Item|null} gun
   * @returns {GunHandling[]}
   */
  static listFor(gun) {
    if (!gun?.system?.isFirearm) return [];
    const feed = feedOf(gun);
    return feed.handlingUses.map((use) => new GunHandling(gun, use, feed));
  }


  /**
   * One handling of a gun, or null when the gun can't do it (Rotate on a rifle).
   * @param {Item|null} gun
   * @param {string} use
   * @returns {GunHandling|null}
   */
  static get(gun, use) {
    return GunHandling.listFor(gun).find((handling) => handling.use === use) ?? null;
  }


  /** The button's text: "Reload". */
  get label() {
    return game.i18n.localize(`${L}.Buttons.${this.use}`);
  }

  /** For warnings and chat: "Reload (Revolver)". */
  get name() {
    return `${this.label} (${this.gun.name})`;
  }

  /** The Action Type's name: "Attack". */
  get actionTypeLabel() {
    const key = CONFIG.LORD_OF_THE_MYSTERIES.actionTypes[this.actionType];
    return key ? game.i18n.localize(key) : this.actionType;
  }

  /** What hovering over the button says: "Reload: Attack action. Loads up to 2 rounds." */
  get tooltip() {
    const data = { name: this.label, type: this.actionTypeLabel, n: this.rounds };
    if (this.use !== "reload") return game.i18n.format(`${L}.Handling.Tooltip`, data);
    return game.i18n.format(`${L}.Handling.${this.rounds ? "TooltipRounds" : "TooltipAllRounds"}`, data);
  }

  /**
   * Looks like an action's data, for the status checks (effects/status-restrictions.mjs and the status rules read
   * item.system.actionType and item.system.traits). Handling has no Traits.
   */
  get system() {
    return { actionType: this.actionType, traits: [] };
  }

  /**
   * Nothing to do right now: a full gun (Reload), a round already chambered or none to chamber (Chamber), an empty
   * gun (Unload). The button is shown faded, but can still be clicked (it says why nothing happens).
   */
  get isIdle() {
    const feed = this.feed;
    switch (this.use) {
      case "reload": return feed.room <= 0 && !feed.canLoadChamber;
      case "chamber": return !!feed.chamber || !feed.magazine?.length;
      case "unload": return feed.loadedCount === 0;
      default: return false;
    }
  }

  /** What the character sheet's button needs (templates/actor/player-character/parts/entry-rolls.hbs). */
  toButton() {
    return { use: this.use, label: this.label, tooltip: this.tooltip, gunId: this.gun.id, idle: this.isIdle };
  }


  /**
   * Do it. A status that stops this Action Type (Dying...) warns first, with Use Anyway; used anyway, the chat says so.
   * @param {Actor} actor
   * @param {object} [options]
   * @param {boolean} [options.fast]   Shift-click Reload: no dialog, fill it from the first ammo that fits.
   * @returns {Promise<*>}  What the gun helper returned (rounds loaded...), or null when nothing happened.
   */
  async perform(actor, { fast = false } = {}) {
    const { proceed, note } = await confirmStatusRestrictions(actor, this);
    if (!proceed) return null;

    let result = null;
    switch (this.use) {
      case "reload": result = await reloadGun(actor, this.gun, { amount: this.rounds, fast }); break;
      case "chamber": result = await chamberRound(actor, this.gun); break;
      case "rotate": result = await rotateCylinder(actor, this.gun); break;
      case "unload": result = await unloadGun(actor, this.gun); break;
    }
    // null = it couldn't happen (no ammo, already empty...): nothing was done, so nothing to say.
    if (result !== null && result !== undefined) await postUsedDespite(actor, this, note);
    return result;
  }
}
