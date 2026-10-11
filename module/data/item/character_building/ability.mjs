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

    return schema;
  }

}