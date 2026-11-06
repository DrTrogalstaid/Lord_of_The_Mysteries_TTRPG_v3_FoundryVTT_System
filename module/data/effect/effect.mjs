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
 *   upkeep               "Toggle" effects: Spirituality spent at the start of each of the owner's turns in combat while
 *                        it's on (effects/toggle-effects.mjs). 0 = free to keep up. Copies keep it.
 *   hasResisted          Fear: passed the Will test, so no more forced movement.
 *   isPenaltyHalved      Angry: Meditation (Half) halved the penalty.
 *   hasInternalBleeding  Bleeding: internal bleeding, which only extraordinary medicine or surgery stops.
 *   grantedFrom          On a copy made from an ability that a Sequence or gear grants: that ability's UUID
 *                        (effects/granted-effects.mjs).
 *   grantedEffectId      On such a copy: the id of the ability's effect it copies.
 *   grantedModifiedTime  On such a copy: when that effect was last edited, at the time it was copied. A copy whose
 *                        effect has been edited since is out of date, and is replaced the next time it's synced.
 *   impliedBy            On an effect another one brought with it (the Bound that comes with Helpless): the id of
 *                        that effect, on the same actor. It's removed, turned off and on together with that effect.
 *   turnChecks           The start-of-turn card buttons already used for this effect, as "<card id>:<check>", so each
 *                        button works once (effects/turn-start.mjs). Only the latest card's are kept.
 *   zone                 On a caster's "Zone: ..." marker effect: the UUID of the zone's Region on the scene. When the
 *                        marker runs out or is removed, the zone goes too (effects/effect-areas.mjs).
 *   roundsLeft           Semi-Out-of-Control: rounds left, counted down at the start of each of its turns
 *                        (effects/rules/semi-out-of-control.mjs).
 *   madness              Semi-Out-of-Control and Indeterminate Madness: the d8 madness tendency / symptom
 *                        (CONFIG.LORD_OF_THE_MYSTERIES.madnessTendencies). 0 = none.
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

    schema.upkeep = new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 });

    schema.hasResisted = new fields.BooleanField({ required: true, initial: false });
    schema.isPenaltyHalved = new fields.BooleanField({ required: true, initial: false });
    schema.hasInternalBleeding = new fields.BooleanField({ required: true, initial: false });

    schema.grantedFrom = new fields.DocumentUUIDField({ type: "Item", required: true, nullable: true, initial: null });
    schema.grantedEffectId = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.grantedModifiedTime = new fields.NumberField({ required: true, nullable: true, initial: null });
    schema.impliedBy = new fields.StringField({ required: true, blank: true, initial: "" });
    schema.turnChecks = new fields.ArrayField(new fields.StringField({ required: true, blank: false }));
    schema.zone = new fields.DocumentUUIDField({ type: "Region", required: true, nullable: true, initial: null });
    schema.roundsLeft = new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 });
    schema.madness = new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 8, initial: 0 });

    return schema;
  }
}
