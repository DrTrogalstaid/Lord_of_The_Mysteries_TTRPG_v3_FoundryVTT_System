/**
 * The data of the system's Active Effects (effect type "effect"). Every effect the system or a user makes is this
 * type: statuses toggled from the Token HUD or the Effects tab, spell effects, effects on gear and abilities.
 *
 * Foundry's own part, system.changes (the number changes, e.g. +2 Strength), comes from ActiveEffectTypeDataModel;
 * the fields below are the system's.
 *
 *   source               The actor the effect is about: the source of Fear or Anger, the enemy you have Advantage
 *                        over. Empty when there's none (toggled from the Token HUD, a Scene Region's effect).
 *   application          For an effect stored on a spell or action: how it's handed out when that's used.
 *     mode               "targets" every targeted token, "self" the user, "area" every token inside a placed shape
 *                        (once), "zone" a shape that stays on the scene: tokens have the effect while inside it.
 *     shape, size        "area" and "zone" only. Size is in the scene's units.
 *   hasResisted          Fear: passed the Will test, so no more forced movement.
 *   isPenaltyHalved      Angry: Meditation (Half) halved the penalty.
 *   hasInternalBleeding  Bleeding: internal bleeding, which only extraordinary medicine or surgery stops.
 *   grantedFrom          On a copy made from an ability that a Sequence or gear grants: that ability's UUID.
 *   impliedBy            On an effect another one brought with it (the Bound that comes with Helpless): the id of
 *                        that effect, on the same actor. It's removed, turned off and on together with that effect.
 *
 * The lists of modes and shapes are in CONFIG.LORD_OF_THE_MYSTERIES (helpers/config.mjs).
 */
export default class LordOfTheMysteriesEffect extends foundry.data.ActiveEffectTypeDataModel {

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.source = new fields.DocumentUUIDField({ type: "Actor", required: true, nullable: true, initial: null });

    schema.application = new fields.SchemaField({
      mode: new fields.StringField({
        required: true, initial: "targets", choices: () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.effectApplicationModes)
      }),
      shape: new fields.StringField({
        required: true, initial: "circle", choices: () => Object.keys(CONFIG.LORD_OF_THE_MYSTERIES.effectAreaShapes)
      }),
      size: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
    });

    schema.hasResisted = new fields.BooleanField({ required: true, initial: false });
    schema.isPenaltyHalved = new fields.BooleanField({ required: true, initial: false });
    schema.hasInternalBleeding = new fields.BooleanField({ required: true, initial: false });

    schema.grantedFrom = new fields.DocumentUUIDField({ type: "Item", required: true, nullable: true, initial: null });
    schema.impliedBy = new fields.StringField({ required: true, blank: true, initial: "" });

    return schema;
  }
}
