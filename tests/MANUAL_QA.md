# Manual QA — Skill Check Dialog

The dialog itself (`module/apps/skill-check-dialog.mjs`) is an `ApplicationV2` that
needs the live Foundry API and DOM — it isn't unit-testable the way
`skill-modifiers.mjs`/`skill-check-formula.mjs` are (see `tests/*.test.mjs`,
run via `npm test`). This checklist covers everything the automated tests
can't: the click wiring, the rendered dialog, and the chat output.

## Setup

- [ ] Apply the change (patch or file copy) to a local copy of the system
- [ ] Launch/restart Foundry so the system reloads
- [ ] Load a world using this system with at least one Player Character actor
- [ ] The actor has at least one skill with a level other than "untrained" recorded
      (so the level bonus and any override are visible as something other than the
      default -4)
- [ ] Ideally, one skill in the compendium has a nonzero `system.modifier` set, to
      exercise the "Item Modifier" line — if none do, this one case can be skipped
      but note it as untested rather than assumed passing

## Basic roll — no override, no ad-hoc modifiers

- [ ] Open the Player Character sheet, go to the Character tab
- [ ] Click a skill's modifier number (the `+N` link next to a skill name)
- [ ] A window titled "Skill Check" opens, showing the skill's name and level
- [ ] The "Linked Attribute" dropdown is pre-selected to the skill's actual linked
      attribute (check this against the skill's own item sheet, not the tab it's
      filed under — they can differ, see the rundown's open question)
- [ ] The number on the Roll button matches: attribute total + level bonus (+ item
      modifier, if any)
- [ ] Click Roll
- [ ] Dialog closes; a chat message appears with the correct total and a flavor
      line reading "`<Skill>` Check (`<Attribute>`)"
- [ ] The dice tooltip/breakdown in the chat card shows labeled terms (attribute
      name, level name), not raw unlabeled numbers

## Attribute override

- [ ] Reopen the dialog for the same skill
- [ ] Change the "Linked Attribute" dropdown to a different attribute
- [ ] The Roll button's total updates immediately to reflect the new attribute's
      total
- [ ] A hint line appears noting this is an override for this roll
- [ ] Click Roll
- [ ] Chat flavor reads "`<Skill>` Check (`<NewAttribute>` instead of `<DefaultAttribute>`)"
- [ ] Reopen the dialog again (same skill) — it defaults back to the skill's normal
      attribute, confirming the override didn't persist anywhere

## Ad-hoc modifiers

- [ ] Open the dialog, type a label and a positive value into the "add modifier"
      row, click Add (or press Enter in the value field)
- [ ] The modifier appears in the list with a remove (×) control; total updates
- [ ] Add a second modifier with a negative value; total updates again
- [ ] Click the × on one modifier; it disappears and the total updates back
- [ ] Try adding a modifier with the value field blank or 0 — a warning appears
      and nothing is added to the list
- [ ] Roll with at least one modifier present; confirm the chat card's formula
      breakdown includes each modifier's label

## Item modifier (skip if no compendium skill has one set)

- [ ] Open the dialog for a skill whose item has a nonzero `system.modifier`
- [ ] An "Item Modifier" line appears in the dialog header showing that value
- [ ] The Roll button's total and the final chat total both include it

## Cancel / close without rolling

- [ ] Open the dialog, then close it via the window's close button (not Roll)
- [ ] No chat message is posted
- [ ] Reopening the dialog for the same skill starts fresh (no leftover ad-hoc
      modifiers from the cancelled attempt)

## Untrained skill checks and the GM setting

- [ ] Open a skill the actor has no recorded level for (shows as "Untrained" with
      a -4-inclusive modifier) — with the default setting, the dialog opens and
      rolls normally, same as any other skill
- [ ] As GM, open Configure Settings → System Settings, find "Allow Untrained
      Skill Checks", and turn it off
- [ ] Click that same untrained skill's modifier again — the dialog should NOT
      open; a warning notification appears instead naming the skill
- [ ] A trained/proficient/etc. skill on the same actor still opens and rolls
      normally with the setting off (the block is untrained-only)
- [ ] Turn the setting back on — the previously-blocked untrained skill opens
      and rolls again

## Regression checks (things this change should NOT have affected)

- [ ] Non-skill sheet interactions still work: editing attribute base/beyonder
      bonus/corruption fields, changing a skill's proficiency-level dropdown,
      short/long rest and spend-luck/spirituality buttons, editing the portrait
- [ ] The NPC sheet's existing `.rollable` clicks (if any NPC has rollable items)
      still work unchanged
- [ ] Any other system roll that goes through `new Roll(...)` or an inline
      `[[/r ...]]` in biography/description text still evaluates and posts to
      chat correctly (this confirms registering `LOTM_VTTRoll` as the default
      `CONFIG.Dice.rolls[0]` didn't break anything else that rolls)

## Skills granted by abilities (Extraordinary Knowledge)

- [ ] Open "Extraordinary Knowledge" in the Abilities compendium, Details tab: "Grants Skills"
      and the analyze checkbox are ticked, and Skill Options lists the 21 Knowledges.
      Dropping a non-skill item onto Skill Options is refused with a warning
- [ ] On a character without the ability: no extra skill tab, no Analyze buttons
- [ ] Drag the ability onto the sheet: it appears on the Abilities tab, and a new
      "Extraordinary Knowledge" skill tab appears after Education
- [ ] In that tab, add a Knowledge from the dropdown: it appears with an Education-based
      modifier and leaves the dropdown
- [ ] Add a custom skill (e.g. "Reading Knowledge", attribute Education) with Enter or +:
      it appears; adding the same name again warns
- [ ] Granted skills: + next to Analyses adds 1; typing a number saves; changing the level
      updates the modifier and keeps the count; the trash icon (after confirming) removes it
- [ ] Agility tab: click Stealth's magnifying glass. Stealth appears in the Extraordinary
      Knowledge tab as an EDU skill with 1 analysis; clicking again makes it 2 (no duplicate)
- [ ] Education tab: each skill shows an analysis box. Clicking History's magnifying glass
      raises History's own count and does NOT add it to the Extraordinary Knowledge tab
- [ ] Change an Education skill's level or an attribute: the analysis counts are unchanged
- [ ] Click a granted skill's modifier: the Skill Check dialog opens with its attribute/level
- [ ] Remove the ability while its tab is open: the tab disappears, the sheet falls back to
      Strength, and the Analyze buttons and Education analysis boxes are hidden
- [ ] Drag the character's copy of the ability onto another character: the granted skills
      (with levels and counts) come along

## NPC sheet

Setup: create an NPC actor. Have a Sequence with abilities (one with actions and a Spell List), a gun with a
Shoot action, and a few skills from the Skills compendium ready to drag.

- [ ] The NPC sheet opens with tabs Main, Abilities, Spells, Inventory, Sequences, Notes
- [ ] Header: change the name and Organization; both save. With no Sequence the header says "No Sequence"
- [ ] Drop a Sequence: the header shows "Sequence N · Name (Pathway)", Health / Spirituality maximums and the
      defenses go up the same as they would on a player character with the same attributes and Sequence
- [ ] Change an attribute's base on the Main tab: the total, defenses and maximums update. Hover a box for the breakdown.
      Click a total: an attribute check posts to chat
- [ ] Skills: the list starts empty (or with only skills the Sequence raises, tinted, "Raised by ..."). Drag Pistol
      onto the Skills box: it appears at Trained. Dropping it again warns it's already there
- [ ] Change a skill's level: the modifier updates and other skills keep their levels. Edit another field (an attribute):
      the skill levels are still there
- [ ] Click a skill's modifier: the Skill Check dialog opens at the right level. Trash a dropped skill: it's removed
- [ ] An action that uses a skill the NPC has (e.g. Shoot with Pistol) shows the same bonus as the skill row
- [ ] Actions on Main: collapsible sections by type, no Favorites section, no stars
- [ ] Granted rows (from the Sequence, an ability or gear) have an eye-slash button; owned rows have the trash can
- [ ] Hide a granted ability: it leaves the Abilities tab, its actions leave Main and its spells leave Spells.
      "Hidden (1)" appears at the bottom of the Abilities box; Restore brings all of it back
- [ ] Give the NPC two copies of the same gun. Hide Shoot on one: the other gun's Shoot stays
- [ ] Hide a skill only a Sequence gives: it leaves the list and its raise no longer counts (actions using it roll lower);
      Restore puts it back. Changing that skill's level first gives the NPC its own level and a trash can instead
- [ ] Open the Sequence item itself after hiding things: nothing in it changed. A player with the same Sequence still has everything
- [ ] Inventory: drop gear; set it Held / Worn / Stowed and change the quantity. "+" makes blank gear.
      Worn armor adds to Physical defense and damage resistance. No slots, pockets or money panel show
- [ ] Give the NPC far more gear than its Strength allows: its Agility doesn't drop
- [ ] Notes: type in the editor, close and reopen the sheet: the text is still there
- [ ] Drag the NPC onto a scene (unlinked token): things hidden on the NPC are hidden on the token too; hiding more on
      the token doesn't change the NPC in the sidebar

## Player sheet after the shared base sheet (regression)

- [ ] Every tab still works as before: drops, move arrows, Favorites, collapsing action sections, Spell List groups,
      inventory containers and money, study / success buttons, granted-skill tabs, rests, languages, damage resistance
- [ ] Granted rows on the player sheet still have no remove or hide button, and no "Hidden" lists appear anywhere

## Granted Skills box (Character tab)

Setup: a Sequence whose skill increases include a compendium skill (e.g. Pistol) and a skill from the world.

- [ ] Each row in the Granted Skills box has a roll modifier, a level dropdown and the study (book) button, plus
      the ✋ button when a Sequence ability teaches that skill
- [ ] The row's modifier and link badge match the same skill's row on its attribute tab
- [ ] Change the level in the box: it saves, and the attribute tab's dropdown shows the new level. Change it on the
      attribute tab: the box shows it too. Neither change undoes the other
- [ ] Click the modifier: the Skill Check dialog opens at the raised level. The book and ✋ buttons open their dialogs
- [ ] The world skill: it has controls in the box but isn't on a tab until you change its level; then it's also
      listed on its attribute's tab

## Spending Spirituality (player and NPC sheets)

- [ ] Sidebar Spend button (player and NPC): a dialog shows current / max Spirituality and asks for an amount and
      an optional reason. Spending lowers Spirituality and posts "X spends 3 Spirituality on Y: 10 → 7" to chat
- [ ] Spending more than the actor has: a warning, nothing changes. Closing the dialog spends nothing
- [ ] An action with a skill and a Spirituality Cost: the roll dialog has a "Spend N Spirituality" box, ticked.
      Rolling spends it and the chat card says "-N Spirituality (X left)". Untick it: nothing is spent.
      Closing the dialog without rolling spends nothing. Changing the attribute keeps the box as you set it
- [ ] Not enough Spirituality: the box is greyed out with a warning, and the roll happens without spending
- [ ] An action with no skill but an Attack Roll Macro and a cost: rolling spends the cost (note on the chat card)
- [ ] An action with a cost but nothing to roll: its row has a blue "Spend N" button that spends it and posts to chat
- [ ] A spell with a cost: its row has the roll button AND "Spend N". Spend spends without rolling. (Rolling with the
      dialog's Spirituality box ticked spends it too, so cast one way or the other, not both.)
- [ ] An action with a cost and a roll: no "Spend N" button; the cost is paid through the roll dialog
- [ ] The same from a hotbar macro of the action

## Roll dialogs and damage buttons

Setup: set the chat sidebar's roll mode to Private GM Roll.

- [ ] Skill rolls, attribute checks (click an attribute total) and actions without a skill all open a roll dialog
      with the modifiers list, four who-sees-it buttons (Public, Private GM, Blind GM, Self) and a Roll button
- [ ] The buttons start on Private GM Roll (the sidebar's choice). Pick Blind GM and roll: only the GM sees it.
      The sidebar is still on Private GM Roll, and the next dialog starts there again
- [ ] Public: the roll is posted as the character, for everyone
- [ ] Pick a mode, then add a modifier: the mode stays. Change a skill roll's attribute: the mode and the
      Spirituality box stay as you set them
- [ ] Shift-click a skill, an attribute total and an action's roll button: each rolls right away, no window,
      using the sidebar's mode
- [ ] An action without a skill: the dialog shows its formula with the character's numbers filled in; its
      Modifiers field is in the list (removable); its Spirituality Cost has the checkbox
- [ ] Attack card: "Roll Damage" with "Big Success" to its right. Older attack cards still have a working Roll Damage
- [ ] Roll Damage: the damage card has "Damage (N)" and "Heal (N)". Select a token and click Damage: its Health
      drops by N (not below 0). Heal raises it (not above max). With nothing selected: a warning
- [ ] Big Success: when the roll is below the formula's average, the card says "rolled X, raised to the average (Y)"
      and the buttons use Y; otherwise it says the roll and the average, and the buttons use the roll
- [ ] As a player, clicking Damage with an enemy token selected warns that only the GM can change its Health
- [ ] The sheet's own Damage button still rolls normal damage, and its card has the Damage / Heal buttons too

## Spells roll like actions

- [ ] Open a spell's sheet, Details tab: Skill slot (empty says it rolls with Occultism), Attack Roll Macro, Modifiers,
      Damage Roll Macro (with the damage-types hint) and Damage Type. A spell that had something in the old Attack
      field shows it in Attack Roll Macro
- [ ] Spells tab (player and NPC): every spell row has "[d20 Occultism +N]" and, with a damage formula, a Damage button.
      Rolling opens the skill check dialog with the spell's Spirituality checkbox; the attack card has Roll Damage /
      Big Success. Drop another skill on the spell: the button and roll use that skill instead
- [ ] Spell Lists fold open and closed by clicking their title, and start open. Close one, close and reopen the sheet:
      still closed for you, open for another player
- [ ] Player sheet: each spell row has a star. Star one: it shows in Favorites on the Actions tab (with its roll buttons),
      but not in the Attack / Move / ... sections. Unstar it from either place: it leaves Favorites.
      NPC spell rows have no star
- [ ] A hotbar macro of a spell rolls it

## Damage types in the formula

- [ ] Action set to Physical with damage "2d6[fire] + 1d4 + 2": the damage card's title says (Fire, Physical) and a line
      shows e.g. "7 Fire · 5 Physical"
- [ ] "2d6" on a Fire action: the title says (Fire), no breakdown line
- [ ] The Damage button's hover on the sheet shows the formula with the types in it (no extra type added at the end)

## Damage reduction when applying damage

Setup: a target with Damage Resistance rows Physical 3 and Fire 2 in its sidebar (or worn armor that reduces them).

- [ ] Roll "5[physical] + 6[fire]" (or any roll that comes out 5 physical, 6 fire), select the target, click Damage:
      it loses 6 Health, and the notice says "takes 6 damage (11 - 5 reduction: Physical 3, Fire 2)"
- [ ] A type it has no reduction against (cold), and untyped damage, go through in full
- [ ] A type's damage never goes below 0 (2 physical against Physical 3 is 0, not -1)
- [ ] Shift-click Damage: the full 11 is taken, no reduction
- [ ] Heal is never reduced
- [ ] A Physical row on the sidebar and worn armor that reduces physical add together (both count)
- [ ] Big Success that's raised to the average: the card's per-type line shows each type at its own average,
      and reduction is taken off those
- [ ] Damage cards from before this change still apply their full amount (they have no types saved)
