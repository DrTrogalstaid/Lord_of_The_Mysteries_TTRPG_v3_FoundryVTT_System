# LotM GM Cheat Sheet

What GMs need to know to build Sequences, Abilities, Actions, Spells, Items, Actors, and Roll Macros for the Lord of the Mysteries FoundryVTT system.

## How Items work&#32;

Almost everything a GM would want to create for a game of LotM are "Items". Below is a diagram of how different types of Items relate to one another.

&#91;embedded content: how items link · Sequence and Gear to Ability to Action or Spell\]

The easiest way to explain is by an example following the diagram. Let's create the "Lie" earring from the LotM novel.  First create Gear item. Next drag and drop the Abilities the earring gives the wielder (pre-made Abilities can be found in the system's Abilities compendium). Drag and drop the "Appearance Changing", "Flame Controlling", "Damage Transfer", and "Danger Intuition" onto the Abilities list.\
\
For most Sealed Artifacts/Mystical Items that's all you will need to do. To create new Abilities, follow the diagram the same way by dragging and dropping Actions and/or Spells. For Actions, drag and drop skills, effects, roll tables, etc. And so on down the diagram.&#32;

## Item types

| Type | Description | Data Fields |
| --- | --- | --- |
| **Sequence** | A potion's Sequence (Seer, Sequence 9). Adding one to a character or NPC opens the promotion dialog (there is an option to skip this). | Pathway, Sequence number (9 to 0), Attribute Gain, Skill Increase, Training Bonus, **Abilities Gained** (drag and drop Abilities), Digestion Amount |
| **Ability** | One ability or feature. It can have actions and/or a Spell List it gives, and any always-on bonuses. Spells are grouped into spell lists to make spells easier to keep track of. | Description, Special (for rolling 20s or 1s), Trigger, Spirituality Cost, Action Type, Range, **Spells** and **Actions** lists (drag and drop items), Grants Skills, Learning by Doing, Can Be Stolen/Recorded, Effects tab |
| **Action** | Anything that rolls: an attack, a check against a DC, a gun's Shoot, etc. | The next section, plus Target, Special and Sequence Upgrades |
| **Spell** | The same rolling fields as an action, for spells and rituals. | The next section, plus Target, Special and Sequence Upgrades |
| **Gear** | Equipment, armor, guns and mystical items. It can give abilities and actions like a Sequence does. | Size, Quantity, Value, Armor, Firearm, **Abilities Gained**, **Actions**, Effects (these don't effect the actor when the gear is stowed) |
| **Container** | Clothing and bags that hold gear. | The different slots that gear can be stored in |
| **Skill** | Located in Skills compendium (Melee, Pistol, Occultism, etc.). Most Actions and Spells use these to inform what modifiers to roll with. | Attribute, Modifier |

NOTE: Data fields to not have all be filled out. If they don't apply to the item, leave them blank.

### Item Editing Notes

- **Build abilities, actions and spells in the Items sidebar or a Compendium, not on a character.** Sequences, abilities and gear hold *links* to them, so one edit reaches every character that has them.
- **Don't delete or move an item that something links to.** The link breaks and shows as a missing row on the sheet (you can still remove it there).
- **After editing an ability's Effects tab**, the characters who get that ability from a Sequence or Gear keep their old copy until you press **Refresh** on their Effects tab, or run the *Sync Granted Effects* macro for everyone (see Macros).

## Actions and Spells

The Action's fields. Spells have the same rolling fields in a slightly different order.

| Field | Description |
| --- | --- |
| **Action Type** | Free, Attack, Quick, Move or Full. Some statuses block a type (Loss of Balance stops Move). |
| **Traits** | Speech, Reaction, Grapple, Parry, Aimed at someone. Silence stops Speech, Off Guard stops Reaction, Bound stops Grapple and Parry, Blind stops Aimed. The player gets a warning with *Use Anyway*. |
| **Category** | Combat or Downtime. |
| **Spirituality Cost** | How much spirituality the action/spell costs. |
| **Range** | A number, for reference. |
| **Modifiers** | A bonus or penalty on the roll. |
| **Skill** | Drag and Drop a Skill from the Skills compendium (Pistol, Melee, Listen, etc.). The roll adds the character's attribute, skill level, and skill modifier. Left empty: an action rolls its Attack Roll Macro alone; a spell rolls Occultism by default. |
| **Attack Roll Macro** | Empty defaults to 1d20. An action with no skill needs a full formula (see Roll formulas). |
| **Defense Targeted** | What defense value to roll against. |
| **DC** | A fixed DC, or empty for none. |
| **Outcome Tables** | Drop a Roll Table on *On Success* and/or *On Failure*. Needs a DC. The card gets a **Roll Outcome** button that rolls on the table, once. |
| **Damage Roll Macro** | The damage formula. Empty means there not be a damage button. |
| **Damage Type** | The default type for the damage formula (overwritten by the damage roll macro if it specifies damage type). |
| **Uses ammo / Rounds per shot** | Guns only. *Fire* spends rounds. |
| **DC Results, Special Results** | Notes only. |

On a spell, **Spell Macro** and **Active Effect Macro** are notes only too.

### Defense Targeted

| Choice | Used by | Defense Value |
| --- | --- | --- |
| None | Checks with no target | No hit check |
| Physical Defense | Most attacks | 10 + Agility + Armor + Dodge |
| Physical, too fast to dodge | Firearms | 10 + Armor, unless the target has **Quick Dodge** box has been checked |
| Physical, can't be dodged | Lightning, Light | 10 + Armor |
| Physical, ignores armor | Grapples | Physical Defense without armor |
| Will Defense | Mental attacks | 10 + Will |
| Physique Defense | Poisons, bodily effects | 10 + Physique |

The GM sees each target's defense number on the chat card and players only see Hit or Miss.

## Roll Formulas

Attack Roll Macro and Damage Roll Macro take Foundry dice formulas.

### @ Values

| Write | Gives |
| --- | --- |
| `@attributes.str.total` | Strength, with everything added. The others: `agi` `wil` `phy` `cha` `ins` `luc` `edu` |
| `@damageBonus` | The Strength damage bonus (a number or dice, like `1d4`). Used in melee damage formulas. |
| `@resources.hp.value` @resource`s.hp.``m``a``x` | HP current and HP max |
| `@resources.rp.value` | Current Rationality |
| `@resources.lp.value` | Current Luck |
| `@resources.spp.value` | Current Spirituality |
| `@defenses.physical` | Physical Defense. Also `will`, `physique`, `armor`, `dodge` |
| `@movement` | Movement |

### Attack Roll Macro

| Formula | When |
| --- | --- |
| *(empty)* | A skill is set: rolls 1d20 plus the skill's bonuses |
| `1d20 + @attributes.agi.total[AGI]` | No skill. An Agility roll. The `[AGI]` is a label in chat |
| `1d20 + @attributes.wil.total[WIL] + 2` | No skill. A Will roll with a fixed +2 |

### Damage Roll Macro and Damage Types

Damage defaults to the type set in the Damage Type field. A damage type in \[\] changes the damage to that type.

| Formula | Damage Type field | Result |
| --- | --- | --- |
| `1d6 + @damageBonus` | physical | All physical (a punch or club) |
| `2d6[fire] + 1d4[cold]` | *(any)* | Fire and cold. Each type is resisted on its own |
| `2d8[fire] + 1d4` | physical | 2d8 fire, 1d4 physical |
| `3d6[Explosion]` | fire | `Explosion` isn't a type, so it's just a label for the chat message. Damage will be fire. |

Damage types: `physical` `curse` `fire` `cold` `holy` `lightning` `mental` `poison`.

Setting damage types is important due to damage immunities and resistances.

## Creating Buttons using text: @Rationality and @Check

Use these with any description, Roll Table result, Journal Pages, or Chat Message. They show as small buttons.  Clicking one opens a roll. **Shift-click skips a roll window and** rolls immediately.

### @Rationality

`@Rationality[pass/fail]` is a rationality check (the rulebook calls this a sanity check): roll 1d20 at or under the current Rationality value as the DC, then lose the first amount on a pass or the second on a fail. Both sides can be numbers or dice.

| Write | Button | What happens |
| --- | --- | --- |
| `@Rationality[1/1d3]` | Rationality 1/1d3 | Lose 1 on a pass, 1d3 on a fail |
| `@Rationality[0/1d2]{Whispers}` | Whispers (0/1d2) | Same, with a custom label. The label is also the cause shown in chat. |
| `@Rationality[1d8/2d8\|+4]` | Rationality 1d8/2d8 +4 | The rule book's "Sanity check +4 disadvantageous": +4 on the d20, so failing is likelier |
| `@Rationality[1d3]` | Rationality 1d3/1d3 | One amount for both |

### @Check

`@Check[``c``he``ck``N``a``m``e``|DC]` is an attribute or skill check.

| Write | Button | What happens |
| --- | --- | --- |
| `@Check[wil\|15]` | Will (DC 15) | Will check against DC 15 |
| `@Check[Willpower\|DC 15]` | Will (DC 15) | Full names work, and `DC 15` or `dc=15` |
| `@Check[Listening\|30]` | Listening (DC 30) | Skill check using the character's Listening skill bonus |
| `@Check[phy\|15]{Hold on}` | Hold on | Your own label, also used as the reason in chat |
| `@Check[Medicine]` | Medicine check | No DC |

Attribute short names: `str` `agi` `wil` `phy` `cha` `ins` `luc` `edu`.

A skill is found by its exact name in the Skills compendium (any capitals). Check the spelling against the compendium: it's *Listening*, not *Listen*.

### WhichActor Rolls?

1. The tokens the clicker has selected and owns the roll message. A GM can select three Cultists and click once.
2. If no token is selected, the character the text belongs to rolls.
3. Otherwise, the clicker's own character (set in User Configuration).

In a Roll Table result, write who it's for ("*You* lose @Rationality\[0/1d2\]") and let the rules fill in the rest. For a button meant for someone else ("the target makes @Check\[phy|15\]"), so the players knows to select that token first.

## Active Effects

Add effects on an item's **Effects** tab. Each effect's **LotM** tab sets:

| Use | Description | Typical Items/Uses |
| --- | --- | --- |
| **Passive** | Always active while the character has the item | Abilities, Sequences, Gear (default to Passive) |
| **Targets** | The attack chat card gets an Apply button. The effect is applied to each targeted token. | Actions and Spells (default to Targets) |
| **Self** | Apply puts a copy on the user | Buffs |
| **Area (once)** | The user places a shape. Every token inside the shape gets the effect applied after a confirm the list | Explosions, Bursts, Cones, etc. |
| **Zone (while inside)** | A shape that stays on the scene. The effect is applied to tokens while inside the zone and removed when they leave. | Fog, Barriers, Corrupted Areas, etc. |
| **Toggle** | Using it turns it on and off for the user. **Upkeep** spends Spirituality at the start of each of their turns in combat if there is a Spirituality cost. | Spirit Vision |

A player can apply an effect to an enemy they don't own only while a GM is logged in. The GM's client makes the change.

### Change Keys

Set these on the effect's **Changes** tab, with **Add** unless noted.

| Key | Value | What it changes |
| --- | --- | --- |
| `system.attributes.ins.beyonder_bonus` | `2` | +2 Inspiration itself, so all Inspiration based rolls are effected. |
| `system.attributes.wil.checkBonus` | `2` | +2 on Will checks and on skills that use Will, without changing Will itself. Shows as its own row in the roll window. |
| `system.spiritualIntuitionBonus` | `2` | +2 on spiritual intuition checks only (Spirit Vision) |
| `system.isQuickDodgable` | `true` (**Override**) | The character can dodge firearms ("too fast to dodge" attacks use their full Physical Defense) |

### Statuses

Under **Status Conditions** on the effect's Details tab. The status's rules (roll modifiers, defenses, blocked actions, start-of-turn checks) come with it.

| Id | Status |
| --- | --- |
| `lossOfBalance` | Loss of Balance |
| `bound` | Bound |
| `offGuard` | Off Guard |
| `helpless` | Helpless (brings Bound) |
| `advantage` | Advantage |
| `disadvantage` | Disadvantage |
| `bloodbath` | Bloodbath |
| `bleeding` | Bleeding |
| `dying` | Dying |
| `dead` | Dead |
| `fear` | Fear |
| `angry` | Angry/Taunted |
| `silence` | Silence |
| `invisible` | Invisible |
| `ethereal` | Ethereal |
| `blind` | Blind |
| `deaf` | Deaf |
| `shock` | Shock |
| `semiOutOfControl` | Semi-Out-of-Control |
| `indeterminateMadness` | Indeterminate Madness |
| `outOfControl` | Out of Control |
| `spiritualOverflow` | Spiritual Overflow |

Fear, Angry, and Advantage need to know *who* caused them. The Apply button fills that in using the user's target for the effect, or a token the user has targeted for a Self effect (Advantage over that enemy).

## Macros

### game.lotm functions

| Function | What it does |
| --- | --- |
| `game.lotm.rationalityCheck(actor, { loss, reason, penalty })` | Opens a rationality check. Pass `null` for the actor to roll for every selected token |
| `game.lotm.spiritualIntuition(actor)` | An Inspiration check against DC 25 with the spiritual intuition bonus |
| `game.lotm.syncGrantedEffects(actor)` | Updates a character's copies of active effects |
| `game.lotm.GunHandling.get(gun, "reload")?.perform(actor)` | Reload, chamber, rotate, or unload a gun |
| `game.lotm.rollItemMacro(uuid)` | Rolls a character's own action or spell. For dragging from a character sheet onto the hotbar |

### Macro Examples

The Wraith appears: a rationality check for every selected token.

```js
game.lotm.rationalityCheck(null, { loss: "1/1d6", reason: "Saw the Wraith" });
```

A mythic rune with the book's "+4 disadvantageous":

```js
game.lotm.rationalityCheck(null, { loss: "1d8/2d8", penalty: 4, reason: "Mythic rune" });
```

Spiritual intuition for the first selected token:

```javascript
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) game.lotm.spiritualIntuition(actor);
else ui.notifications.warn("Select a token first.");
```

## Worked Example: Listen

Listen is a check against DC 30. On a success the character hears the Creator's whispers (a 1d8 list); on a failure something goes wrong (a 1d4 list). Several results cost Rationality. The numbers below are the ones from our test setup; use what your ability's text says.

### 1. Make the two Roll Tables

In the **Rollable Tables** sidebar, create:

- **Listen: Whispers**, formula `1d8`, eight results.
- **Listen: Mishearing**, formula `1d4`, four results.

Put the buttons straight into the result text, written to the listener:

> The voice fills your skull. You lose @Rationality\[0/1d2\]{Whispers}.

> The words twist as you hear them. Make @Check\[wil|15\]{Decipher}; on a failure, lose @Rationality\[1/1d2\].

When the result is drawn, these buttons roll for the character who listened, so nobody has to pick a token.

### 2. Make the action

In the **Items** sidebar, create an **Action** called Listen and fill in:

| Field | Value |
| --- | --- |
| Action Type | Quick |
| Spirituality Cost | From the ability's text |
| Skill | Drop the skill it rolls (Listening in our setup) |
| Attack Roll Macro | *(empty: 1d20 plus the skill)* |
| Defense Targeted | None |
| DC | `30` |
| Outcome Tables | Listen: Whispers on **On Success**, Listen: Mishearing on **On Failure** |
| Damage Roll Macro | *(empty)* |

Paste the ability's rules text into the description.

### 3. Hang it on an ability and a Sequence

1. Create an **Ability** called Listen. Drop the action onto its **Actions** list.
2. Open the Sequence that gives it and drop the ability onto **Abilities Gained**. (For a mystical item, drop it on the gear's Abilities Gained instead.)
3. Every character with that Sequence now has Listen on their Actions tab, and it changes everywhere when you edit the action.

### 4. At the table

1. The player clicks Listen's dice button on their Actions tab. The roll window opens at DC 30.
2. If something changes the DC for this one attempt (a better offering lowers it), the player types the new DC in the roll window. The action keeps 30 for next time.
3. They roll. The card says Success or Failure.
4. If they want to burn Luck, they do it now.
5. They press **Roll Outcome**. The right table is drawn, posted as their character, seen by the same people as the roll. It works once.
6. They click any @Rationality or @Check buttons in the result.

### Same pattern, other abilities

- **A ritual or sacrifice with its own odds** (Sacrifice a Lamb): its own action with its own DC and tables. If it makes a *later* roll easier, say so in the text and let the player lower the DC in that roll's window.
- **An attack**: set Defense Targeted and a Damage Roll Macro instead of a DC.
- **Something seen or read** (a rune, a corpse, a Beyonder's true form): no action needed. Put `@Rationality[...]` in the journal entry or item description, or run the rationality macro.

### Checklist before you hand it to players

- The skill name in every @Check matches the Skills compendium.
- Every action with outcome tables has a DC.
- Each formula rolls: try it once on a test character.
- Melee damage includes `@damageBonus` if Strength should count.
- After editing an ability's effects, press **Refresh** on characters' Effects tabs or run Sync Granted Effects.
