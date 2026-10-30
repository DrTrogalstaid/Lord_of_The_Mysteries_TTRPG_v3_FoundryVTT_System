import LordOfTheMysteriesItemBase from "../base-item.mjs";
import { rollActionAttack, rollActionDamage } from "../../../helpers/action-roll.mjs";

/**
 * A spell. It rolls the same way an action does (helpers/action-roll.mjs), with the same roll fields and names:
 * skill, attackRollMacro, modifiers, damageRollMacro, damageType. The one difference: a spell with no skill set
 * rolls with Occultism (CONFIG.LORD_OF_THE_MYSTERIES.spellSkillUuid).
 */
export default class LordOfTheMysteriesSpell extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    //Action Type (e.i. Attack/Spell, quick action, free action)
    schema.actionType = new fields.StringField({ required: false, blank: true, initial:"", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTypes) });

    schema.description = new fields.StringField({ required: true, initial: "Description" });
    schema.special = new fields.StringField({ required: true, initial: "na" });
    
    //Range
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});
    schema.target = new fields.StringField({required: false, blank: true});
    schema.spiritualityCost = new fields.NumberField({required: false, integer: true, min: 0});
    
    // ---- Rolls: the same fields as an action (action.mjs) ----
    // The skill it rolls with (UUID of a skill Item). Blank = Occultism. Set by dropping a skill on the spell
    // sheet's Skill slot (helpers/skill-slot.mjs).
    schema.skill = new fields.StringField({ required: true, blank: true, initial: "" });
    // Dice rolled for the attack before the skill bonuses are added (blank = 1d20). This used to be "attack".
    schema.attackRollMacro = new fields.StringField({ required: false, blank: true });
    // Flat bonus/penalty added to the attack roll. Shows up in the roll dialog's modifier list.
    schema.modifiers = new fields.NumberField({ required: false, integer: true });
    // Damage formula rolled by the damage buttons. Parts can have their own type: "2d6[fire] + 1d4[cold]".
    schema.damageRollMacro = new fields.StringField({ required: false, blank: true });
    // The damage type of every part of the damage formula that doesn't name its own.
    schema.damageType = new fields.StringField({ required: false, blank: true, initial: "" });
    //DC_Results
    //TODO: Make an array?? Mayebe, but it could also be a markdown table. Or the sheet would process the array into a markdown table??
    schema.dcResults = new fields.StringField({ required: false, initial: "Results" });

    schema.higherSequenceUpgrades = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" }),
    );

    schema.spellMacro = new fields.StringField({ required: false, initial: "na" });
    //Active effects?
    //TODO: How do I do this? Is this another object that needs created? Is this the same as a spell macro??
    //TODO: When a spell active effect is on a player, can I add actions to their actions tab? If so, that might be really nice.
    schema.activeEffectMacro = new fields.StringField({ required: false, initial: "na" });

    /**
     * Exampled of spells for reference
     * 
     * ① Condensed fireball: 1 casting action, consumes 2 spirituality points,  condenses a crimson condensed fireball in the palm, throws itagainst physical defense, the fireball will disintegrate and explode, ignore 2 armor, overflow ignores the identification bonus, causing 2d8 of fire damage.
     * Sequence 5: The fireball expands to the size of a half-human, and two creatures standing together are considered the same target
     * 
     * ② Blazing Lance: 1 attack action, consumes 4 points of spirituality.
     * Condensed a scarlet spear made of pure flames, the spear was surrounded by sparks, filled with intense heat.
     * Roll fire damage against physical defense, 2d8 + Strength damage die, ignores 2 points of fire resistance or damage reduction, overflow ignores instead damage bonus
     * 
     * ③ Flame whip: 1 attack action, consumes 2 points of spirituality.
     * A wave of heat rolled over the torso and palms, shaking and shaking into a long flame whip, which can choose a target within 2 meters, causing fire damage of 1d4 + half strength damage dice, and can attack 3 times in 1 attack action, the second/third time respectively -4, -6 unfavorable
     * 
     * ④ Fire Raven: 1 casting action, consuming 2 spirituality points, you can summon countless fire ravens, the upper limit of fire ravens that can be summoned and maintained is equal to your inspiration/2, rounded up, mysticism against physical defense , 1d3 fire damage per fire raven
     * Every 6 fire crows is 1 identification, the number of triggering substitutes/reductions = the number of identifications, each fire crow can choose different targets, 1 identification is against the physical defense of all targets, ignoring agility and dodge due to automatic enemy hunting ( Doesn't work for quick dodge)
     *
     */
    
    return schema;
  }

  /**
   * Spells saved before they had the action roll fields kept their attack formula in "attack".
   * Copy it into attackRollMacro. (Only when attackRollMacro is still empty.)
   * @override
   */
  static migrateData(source) {
    if (typeof source.attack === "string" && source.attack.trim() && !source.attackRollMacro) {
      source.attackRollMacro = source.attack;
    }
    return super.migrateData(source);
  }

  /* -------------------------------------------- */
  /*  Rolls (see helpers/action-roll.mjs)          */
  /* -------------------------------------------- */

  /**
   * Roll this spell's attack. Used by hotbar macros.
   * @param {object} [options]
   * @param {Actor} [options.actor]  Who's casting. Defaults to the character that owns the spell.
   */
  async rollAttack({ actor = this.parent.actor } = {}) {
    return rollActionAttack(actor, this.parent);
  }

  /**
   * Roll this spell's damage.
   * @param {object} [options]
   * @param {Actor} [options.actor]  Who's casting. Defaults to the character that owns the spell.
   */
  async rollDamage({ actor = this.parent.actor } = {}) {
    return rollActionDamage(actor, this.parent);
  }

}