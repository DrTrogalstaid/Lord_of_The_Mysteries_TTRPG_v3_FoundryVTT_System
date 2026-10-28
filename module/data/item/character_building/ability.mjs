import LordOfTheMysteriesItemBase from "../base-item.mjs";

export default class LordOfTheMysteriesAbility extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};
    
    schema.description = new fields.StringField({ required: true, initial: "Description" });
    schema.trigger = new fields.StringField({ required: false, initial: "na" });
    schema.special = new fields.StringField({ required: false, initial: "na" });
    schema.canBeStolen = new fields.BooleanField({ required: true, initial: true})

    //Action Type (e.i. Attack/Spell, quick action, free action)
    schema.actionType = new fields.StringField({ required: false, blank: true, initial:"", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.actionTypes) });


    //Roll modifiers

    //Vistion/Senses gained
    //TODO: Vistion object? How does foundry handle this??

    //Spirituatlity Cost
    schema.spiritualityCost = new fields.NumberField({required: false, integer: true, min: 0});

    //Higher sequence bonuses (array containing all sequences?)
    //TODO: What should this be besides a string?
    schema.higherSequenceUpgrades = new fields.ArrayField(
      new fields.StringField({ required: false, initial: "na" }),
    );

    //Range
    schema.range = new fields.NumberField({required: false, integer: true, min: 0});

    // Spell List
    schema.spellList = new fields.SchemaField({
      name: new fields.StringField({required: false, initial: "Spells"}),
      spells: new fields.ArrayField(
        new fields.DocumentUUIDField({ type: "Item", required: false })
      ) 
    });

    schema.actionList = new fields.ArrayField(
        new fields.DocumentUUIDField({ type: "Item", required: false })
    );

    // Granted Skills (see module/helpers/granted-skills.mjs)
    // When on, characters with this ability can add skills to their skill tabs:
    // picked from skillOptions (set by the GM) or custom-named.
    schema.grantsSkills = new fields.BooleanField({ required: true, initial: false });
    // When on, the character's regular non-Education skills get an Analyze button that adds
    // an Education copy of the skill to this ability's list (Extraordinary Knowledge).
    schema.analyzeSkills = new fields.BooleanField({ required: true, initial: false });
    schema.skillOptions = new fields.ArrayField(
        new fields.DocumentUUIDField({ type: "Item", required: false })
    );
    // What a character has added, stored on their own copy of the ability so the
    // progress goes with it if the ability is stolen.
    schema.grantedSkills = new fields.ArrayField(
        new fields.SchemaField({
            id: new fields.StringField({ required: true, blank: false }),
            uuid: new fields.StringField({ required: true, blank: true, initial: "" }), // blank for custom skills
            name: new fields.StringField({ required: true, blank: false }),
            attribute: new fields.StringField({ required: true, initial: "edu", choices: () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.attributes) }),
            level: new fields.StringField({ required: true, initial: "untrained", choices: () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels) }),
            analysis: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
        })
    );

    // Learning by Doing (helpers/skill-learning.mjs). For Sequence abilities that teach skills through use,
    // e.g. "each challenging theft of something valuable raises a detection or stealing skill".
    // Characters with the ability get a ✋ button on the skills it covers, to record each success.
    // The next level needs 1, 2, 3, 4... successes. The counts are saved on the character (system.learning).
    schema.fastLearning = new fields.SchemaField({
        enabled: new fields.BooleanField({ required: true, initial: false }),
        // What counts as a success, shown to the player when they record one.
        condition: new fields.StringField({ required: true, blank: true, initial: "" }),
        // Highest level this ability can raise a skill to.
        maxLevel: new fields.StringField({
            required: true, initial: "mastery", choices: () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels)
        }),
        // Which skills it covers: whole categories (config.mjs skillCategories), plus single skills dropped on it.
        categories: new fields.ArrayField(new fields.StringField({
            required: true, blank: false, choices: () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories)
        })),
        skills: new fields.ArrayField(new fields.DocumentUUIDField({ type: "Item", required: false }))
    });

    return schema;
  }

}