import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAction extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    //Action Type (e.i. Attack/Spell, quick action, free action)
    schema.actionType = new fields.StringField({ required: true, initial: "free", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTypes) });

    schema.spiritualityCost = new fields.NumberField({required: false, integer: true, min: 0});
    schema.description = new fields.StringField({ required: true, initial: "Description" });

    //Active effects?
    //Range
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});

    //DC_Results
    //TODO: Make an array?? Mayebe, but it could also be a markdown table. Or the sheet would process the array into a markdown table??
    schema.dcResults = new fields.StringField({ required: false, initial: "Results" });

    //Great Success and Big Failure events
    schema.specialResults = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" })
    );

    schema.higherSequenceUpgrades = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" }),
    );

    schema.spellMacro = new fields.StringField({ required: false, initial: "na" });

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

}