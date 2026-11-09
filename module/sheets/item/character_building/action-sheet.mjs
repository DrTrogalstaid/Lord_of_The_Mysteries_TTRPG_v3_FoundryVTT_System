import { ITEM_HEADER_PART } from "../../base-item-sheet.mjs";
import { RollableItemSheet, ROLLABLE_PARTIALS } from "./rollable-item-sheet.mjs";
import { AMMO_USES, OLD_AMMO_USES } from "../../../helpers/firearms.mjs";


/**
 * The action sheet. What it shares with the spell sheet (the roll fields, Traits, Effects tab) is in
 * RollableItemSheet; this adds the action's own fields: Special Results and Uses Ammo.
 */
export class LordOfTheMysteriesActionSheet extends RollableItemSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["action"],
    window: {
      title: "LORD_OF_THE_MYSTERIES.SheetTitles.Skill"
    },
  };

  /** @override */
  static PARTS = {
    header: ITEM_HEADER_PART,
    form: { template: "systems/lotm/templates/item/character_building/action.hbs", templates: ROLLABLE_PARTIALS },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // "Uses ammo" dropdown: No / Fires rounds (helpers/firearms.mjs). An old Reload / Pull Bolt action keeps its old
    // choice in the list, marked as old, so it isn't changed by accident (the Retire Gun Actions macro looks for it).
    const ammoUse = context.system.ammoUse;
    context.isOldAmmoUse = ammoUse in OLD_AMMO_USES;
    context.ammoUseOptions = context.isOldAmmoUse
      ? {
        ...AMMO_USES,
        [ammoUse]: game.i18n.format("LORD_OF_THE_MYSTERIES.Firearm.AmmoUse.OldOption", { use: game.i18n.localize(OLD_AMMO_USES[ammoUse]) }),
      }
      : AMMO_USES;

    // Special Results (Great Success / Big Failure events), on the Description tab.
    context.specialResults = this._textRows("system.specialResults");
    return context;
  }
}
