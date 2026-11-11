import LordOfTheMysteriesItemBase from "../base-item.mjs";
import { skillKeyFromName, skillKeyOf } from "../../../helpers/skill-keys.mjs";

/**
 * A skill (Pistol, Dodge, Knowledge of the Dead).
 *
 * Skills are never owned by actors. An actor saves a record per skill under the skill's key
 * (system.skills.pistol = { level, analysis, ... }, see data/actor/base-actor.mjs), and everything else about the skill
 * is read from this Item through the skill registry (helpers/skill-registry.mjs).
 *
 *   identifier          The skill's key: what actors and Active Effects call it ("pistol", "knowledgeOfTheDead").
 *                       Letters and digits only. Filled in from the name when the skill is made, so renaming the skill
 *                       doesn't change it. Blank on skills saved before it existed: those go by their name (the same
 *                       key) until module/macros/set-skill-identifiers.js fills it in.
 *   isStandard          Every player character has this skill (it's on their skill tabs from the start). Off for skills
 *                       only some characters get, like Knowledge of the Dead or the Extraordinary Knowledges.
 *                       null (never saved): the Skills compendium's attribute folders decide, as before.
 *   skill_attribute     The attribute it's rolled with, and the tab it's listed on.
 *   modifier            A flat bonus to every roll of this skill.
 *   categories          Related-skill categories (helpers/skill-associations.mjs).
 */
export default class LordOfTheMysteriesSkill extends LordOfTheMysteriesItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, initial: "Description" });
    schema.identifier = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.isStandard = new fields.BooleanField({ required: true, nullable: true, initial: null });
    schema.skill_attribute = new fields.StringField({ required: true, initial: "str", choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.attributes) });
    schema.modifier = new fields.NumberField({required: true, integer: true, min: 0, initial: 0})

    // Related-skill categories (helpers/skill-associations.mjs). A skill can be in several
    // (Psychology: Social, Psychological, Reconnaissance), and each membership has a mode:
    //   both     = raises the others and is raised by them
    //   gives    = only raises the others (Singing -> Music Theory)
    //   receives = only raised by the others (Biology in Medical)
    // This replaces the old single `category` field; migrateData below moves old data over.
    schema.categories = new fields.ArrayField(new fields.SchemaField({
      category: new fields.StringField({
        required: true, blank: false, initial: "fighting",
        choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategories)
      }),
      mode: new fields.StringField({
        required: true, blank: false, initial: "both",
        choices: Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.skillCategoryModes)
      })
    }));

    return schema;
  }

  /**
   * Skills saved before `categories` existed had one `category` string. Turn it into a one-entry list.
   * @override
   */
  static migrateData(source) {
    if (!Array.isArray(source.categories) && typeof source.category === "string") {
      source.categories = source.category ? [{ category: source.category, mode: "both" }] : [];
    }
    return super.migrateData(source);
  }

  /**
   * The skill's key: its Identifier, or one made from its name while that's blank (helpers/skill-keys.mjs).
   * @type {string}
   */
  get key() {
    return skillKeyOf({ identifier: this.identifier, name: this.parent?.name });
  }

  /**
   * A new skill (made in the sidebar, imported from a compendium, duplicated) gets its Identifier from its name, if it
   * doesn't have one yet, so renaming it later doesn't change its key.
   * @override
   */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (!String(this.identifier ?? "").trim()) {
      const key = skillKeyFromName(data.name ?? this.parent?.name);
      if (key) this.parent.updateSource({ "system.identifier": key });
    }
  }

  /**
   * Renaming a skill that has no Identifier yet: keep the key it had (from its old name), so actors' records and
   * effects that use the key still find it.
   * @override
   */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    const renamed = ("name" in changes) && changes.name !== this.parent?.name;
    const identifierChanged = foundry.utils.hasProperty(changes, "system.identifier");
    if (renamed && !identifierChanged && !String(this.identifier ?? "").trim()) {
      const key = skillKeyFromName(this.parent?.name);
      if (key) foundry.utils.setProperty(changes, "system.identifier", key);
    }
  }

}
