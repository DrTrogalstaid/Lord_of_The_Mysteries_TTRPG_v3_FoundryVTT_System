import LordOfTheMysteriesItemBase from "../base-item.mjs";
import { rollActionAttack, rollActionDamage } from "../../../helpers/action-roll.mjs";

export default class LordOfTheMysteriesAction extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.title = new fields.StringField({ required: true, initial: "Action Title" });
    //Action Type (e.i. Attack/Spell, quick action, free action)
    schema.actionType = new fields.StringField({ required: true, initial: "free", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTypes) });
    schema.description = new fields.StringField({ required: true, initial: "Results" });
    schema.category = new fields.StringField({ required: true, initial: "combat", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionCategories) });

    // What kind of action it is, beyond its Action Type: speech, reaction, grapple, parry, aimed
    // (CONFIG.LORD_OF_THE_MYSTERIES.actionTraits). Statuses check these before it's used
    // (effects/status-restrictions.mjs): Silence stops speech, Off Guard stops reactions, Blind stops aimed...
    schema.traits = new fields.SetField(new fields.StringField({
      required: true, blank: false, choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTraits),
    }));

    //Spirituatlity cost
    schema.spiritualityCost = new fields.NumberField({required: false, integer: true, min: 0});

    //Active effects?
    //Range
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});

    // Flat bonus/penalty added to the attack roll. Shows up in the roll dialog's modifier list.
    schema.modifiers = new fields.NumberField({required: false, integer: true});

    // Dice rolled for the attack before the skill bonuses are added (blank = 1d20).
    schema.attackRollMacro = new fields.StringField({ required: false});
    // Damage formula rolled by the "Roll Damage" button on the attack's chat message (blank = no button).
    schema.damageRollMacro = new fields.StringField({ required: false});
    // Shown in the damage message's title, e.g. "Shoot: Damage (piercing)". Text only, doesn't change the roll.
    schema.damageType = new fields.StringField({ required: false, blank: true, initial: "" });

    // The skill this action rolls with (UUID of a skill Item, e.g. Pistol). Blank = none.
    // Set by dropping a skill on the action sheet's Skill slot (see helpers/skill-slot.mjs).
    // When set, the action gets a dice button on the character sheet that opens the skill check
    // dialog: the Attack Roll Macro is rolled, plus the character's bonuses in this skill.
    schema.skill = new fields.StringField({ required: true, blank: true, initial: "" });

    // Whether this action fires a gun (see helpers/firearms.mjs, AMMO_USES there):
    //   none     no
    //   fire     yes: the attack button uses up rounds. The row also gets the gun's Reload / Chamber / Rotate /
    //            Unload buttons (helpers/gun-handling.mjs; how long they take is set on the gun).
    // reload, chamber, rotate and unload are from before those became buttons on the gun (OLD_AMMO_USES): old actions
    // still have them, so they stay allowed here, but they do nothing now (module/macros/retire-gun-actions.js).
    schema.ammoUse = new fields.StringField({ required: true, initial: "none", choices: ["none", "fire", "reload", "chamber", "rotate", "unload"] });
    // Rounds per shot: 0 counts as 1 (2 for a double-barrel blast).
    schema.ammoAmount = new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 });

    //DC_Results
    schema.dcResults = new fields.StringField({ required: true, initial: "Results" });

    //Great Success and Big Failure events
    schema.specialResults = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" })
    );

    return schema;
  }

  /**
   * Runs every time an action's saved data is loaded, before the fields above check it.
   * Actions saved before the camelCase rename still have the old snake_case names,
   * so copy those values into the new names. ("??=" only sets it if the new name is empty.)
   * @override
   */
  static migrateData(source) {
    if ("action_type" in source) source.actionType ??= source.action_type;
    if ("spirituality_cost" in source) source.spiritualityCost ??= source.spirituality_cost;
    return super.migrateData(source);
  }

  /* -------------------------------------------- */
  /*  Rolls (see helpers/action-roll.mjs)          */
  /* -------------------------------------------- */

  /**
   * Roll this action's attack. "this.parent" is the action Item that owns this data.
   * @param {object} [options]
   * @param {Actor} [options.actor]  Who's rolling. Defaults to the character that owns the action.
   * @param {string} [options.gunId] For "Fires rounds" actions: the gun to fire. Default: the gun in hand.
   */
  async rollAttack({ actor = this.parent.actor, gunId } = {}) {
    return rollActionAttack(actor, this.parent, { gunId });
  }

  /**
   * Roll this action's damage.
   * @param {object} [options]
   * @param {Actor} [options.actor]  Who's rolling. Defaults to the character that owns the action.
   */
  async rollDamage({ actor = this.parent.actor } = {}) {
    return rollActionDamage(actor, this.parent);
  }

}
