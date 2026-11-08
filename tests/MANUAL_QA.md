# Manual QA

`npm test` covers the rules that can be checked without Foundry: skill formulas, status math, Health thresholds, roll
modifiers, restrictions, effect copies, area shapes. This checklist covers what needs Foundry running: the sheets,
dialogs, chat cards, tokens and scenes.

## How to use it

- **Every update:** do **Setup** and the **Smoke test**.
- **Then the sections for what the update touched.** Each section starts with the files it covers, to help you pick.
- Watch the console (F12) the whole time: any red error is a failure, even if everything looks right.
- In the steps, "Klein" is a player character and "the goblins" are NPC tokens on the same scene.

## Setup

- [ ] Copy the changed files into the system folder. If `system.json` changed (a new compendium, document type or
      region behavior), restart Foundry; otherwise reloading the world is enough
- [ ] Run `npm test` in the system folder: every test passes
- [ ] A test world with:
  - Klein: a player character with skills at a few levels (not only Untrained), a Sequence that grants abilities and
    skills, a gun with a Shoot action, a spell, an action with a Spirituality Cost, and a coat or bag
  - an NPC, with a token on a scene that has a grid, plus three goblin tokens and Klein's token on the same scene
  - a second user (a player who owns Klein but not the goblins), for the permission checks. Log in with them in a
    second browser where a step says "as a player"

## Smoke test (every update)

- [ ] The world loads with no errors in the console
- [ ] Run the item sheet smoke test macro (see **Maintenance macros**): no new problems compared with before the update
- [ ] Open Klein's sheet and the NPC's sheet, and click through every tab
- [ ] Roll a skill check, an attribute check, Shoot's attack, and its damage; apply the damage to a goblin
- [ ] Toggle a status on a token from the Token HUD, then off again
- [ ] Start a combat and advance a turn; a creature with Bleeding gets a start-of-turn card
- [ ] An inline roll (`[[/r 1d6]]`) in a journal or description still rolls and posts to chat

## Maintenance macros

Each is in `module/macros/`. Make a Script macro with the file's code and run it as the GM. The ones that change
things start in report-only mode (`APPLY = false`): check the report, then set `APPLY = true` and run it again.

| Macro | What it does | When to run it |
|---|---|---|
| `smoke-test-item-sheets.js` | Opens every kind of item sheet (new, compendium and owned Items), reports any errors, closes them, and deletes the blank Items it made | Before and after an update that touches item sheets; compare the two reports |
| `check-leftover-effects.js` | Lists effects with statuses the system doesn't know (Foundry's old Prone, Poisoned, ...), and old-type effects. `APPLY` deletes the old Token HUD ones | After importing old actors or removing a module that added statuses |
| `tag-action-traits.js` | Adds Traits (speech, reaction, grapple, parry, aimed) to actions and spells by name, in the compendiums, world Items and owned Items | After adding actions or spells that should have Traits; edit its list first |
| `sync-granted-effects.js` | Brings every actor's copies of granted abilities' passive effects up to date (world actors and unlinked tokens) | After editing abilities in a compendium or the sidebar |
| `retire-gun-actions.js` | Copies old Reload / Pull Bolt / Rotate / Unload actions' Action Type onto their gun's Handling and takes them off the gun's action list (compendium, world, actors, unlinked tokens). Lists the old actions to delete by hand | Once, after the gun handling update, or after importing old guns |
| `assign-skill-categories.js` | Gives the Skills compendium's skills the rulebook's related-skill categories | After adding skills to the compendium |
| `move-spirit-vision-bonus.js` | Moves Spirit Vision effects' +2 from every Inspiration check (`system.attributes.ins.checkBonus`) to spiritual intuition checks only (`system.spiritualIntuitionBonus`), in the compendiums, world Items, actors and unlinked tokens | Once, after the hit / sanity / luck update |

---

# Character sheets

## Player sheet

Files: `module/sheets/player-character-sheet.mjs`, `module/sheets/base-actor-sheet.mjs`, `templates/actor/player-character/`

- [ ] Every tab works: drops, move arrows, Favorites, collapsing action sections, Spell List groups, inventory containers
      and money, study / success buttons, granted-skill tabs, rests, languages, damage resistance
- [ ] Editing attribute base / Beyonder Bonus / corruption, a skill's level, the portrait, and the Spend Luck and
      Spirituality buttons all work
- [ ] Granted rows (from a Sequence, ability or gear) have no remove or hide button, and no "Hidden" lists appear

## NPC sheet

Files: `module/sheets/npc-sheet.mjs`, `module/data/actor/actor-npc.mjs`, `templates/actor/npc/`

Setup: an NPC, a Sequence with abilities (one with actions and a Spell List), a gun with a Shoot action, and a few
skills from the Skills compendium ready to drag.

- [ ] Tabs: Main, Abilities, Spells, Inventory, Sequences, Effects, Notes
- [ ] Header: change the name and Organization; both save. With no Sequence the header says "No Sequence"
- [ ] Header, second row: pick a Spirit Aura colour and tick Undead; both save. Clear the colour: it stays empty
      (what they do: **Spirit Vision and Death Vision**)
- [ ] Drop a Sequence: the header shows "Sequence N · Name (Pathway)", and Health / Spirituality maximums and the
      defenses go up the same as a player character's with the same attributes and Sequence
- [ ] Change an attribute's base on Main: the total, defenses and maximums update. Hover a box for the breakdown.
      Click a total: an attribute check posts to chat
- [ ] Skills: the list starts empty (or with only skills the Sequence raises, tinted, "Raised by ..."). Drag Pistol
      onto the Skills box: it appears at Trained. Dropping it again warns it's already there
- [ ] Change a skill's level: the modifier updates and other skills keep theirs. Edit another field: the levels stay
- [ ] Click a skill's modifier: the Skill Check dialog opens at the right level. Trash a dropped skill: it's removed
- [ ] An action using a skill the NPC has (Shoot with Pistol) shows the same bonus as the skill row
- [ ] Actions on Main: collapsible sections by type, no Favorites section, no stars
- [ ] Granted rows have an eye-slash button; owned rows have the trash can
- [ ] Hide a granted ability: it leaves the Abilities tab, its actions leave Main and its spells leave Spells.
      "Hidden (1)" appears at the bottom of the Abilities box; Restore brings it all back
- [ ] Two copies of the same gun: hiding Shoot on one leaves the other's
- [ ] Hide a skill only a Sequence gives: it leaves the list and its raise stops counting; Restore puts it back.
      Changing that skill's level first gives the NPC its own level and a trash can instead
- [ ] The Sequence item itself is unchanged by hiding. A player with the same Sequence still has everything
- [ ] Inventory: drop gear; Held / Worn / Stowed and quantity work; "+" makes blank gear. Worn armor adds to Physical
      Defense and damage resistance. No slots, pockets or money panel
- [ ] Far more gear than its Strength allows: its Agility doesn't drop
- [ ] Notes: type, close and reopen: the text is still there
- [ ] An unlinked token: things hidden on the NPC are hidden on the token; hiding more on the token doesn't change the NPC

## Granted Skills box (Character tab)

Files: `module/sheets/player-character-sheet.mjs`, `templates/actor/player-character/parts/`

Setup: a Sequence whose skill increases include a compendium skill (Pistol) and a world skill.

- [ ] Each row has a roll modifier, a level dropdown and the study (book) button, plus ✋ when a Sequence ability teaches it
- [ ] The modifier and link badge match the same skill's row on its attribute tab
- [ ] Change the level in the box: the attribute tab shows it too, and the other way round. Neither undoes the other
- [ ] Click the modifier: the Skill Check dialog opens at the raised level. The book and ✋ buttons open their dialogs
- [ ] The world skill has controls in the box but isn't on a tab until its level changes; then it's on its attribute tab too

## Skills granted by abilities (Extraordinary Knowledge)

Files: `module/data/item/character_building/ability.mjs`, `module/sheets/player-character-sheet.mjs`; design notes in
`docs/extraordinary-knowledge.md`

- [ ] "Extraordinary Knowledge" in the Abilities compendium, Details tab: "Grants Skills" and the analyze checkbox are
      ticked, and Skill Options lists the 21 Knowledges. Dropping a non-skill onto Skill Options is refused
- [ ] A character without the ability: no extra skill tab, no Analyze buttons
- [ ] Drag the ability onto the sheet: it's on the Abilities tab, and an "Extraordinary Knowledge" tab appears after Education
- [ ] Add a Knowledge from the dropdown: it appears with an Education-based modifier and leaves the dropdown
- [ ] Add a custom skill (e.g. "Reading Knowledge", Education) with Enter or +; the same name again warns
- [ ] Granted skills: + adds an analysis; typing a number saves; changing the level keeps the count; trash (after
      confirming) removes it
- [ ] Agility tab, Stealth's magnifying glass: Stealth appears in the tab as an EDU skill with 1 analysis; again makes 2
- [ ] Education tab: each skill has an analysis box. History's magnifying glass raises History's own count, not a new row
- [ ] Changing an Education skill's level or an attribute leaves the analysis counts alone
- [ ] A granted skill's modifier opens the Skill Check dialog with its attribute and level
- [ ] Remove the ability while its tab is open: the tab goes, the sheet falls back to Strength, and the Analyze buttons
      and Education analysis boxes hide
- [ ] Drag the character's copy of the ability onto another character: the granted skills (levels and counts) come along

---

# Item sheets

Files: `module/sheets/base-item-sheet.mjs`, `module/sheets/item/`, `templates/item/`

Test with an Item in the Items sidebar (editable), one in a locked compendium (read-only), and one owned by Klein.

Every sheet:

- [ ] Opens at its usual size (520 × 480; gear 520 × 720; clothing / bags as tall as their contents) and can be resized
- [ ] Changing a field saves straight away (close and reopen: still there)
- [ ] A description box: Edit, type, Save. The text is kept, and @UUID links in it can be clicked
- [ ] A locked compendium Item is read-only: no editing, no add / remove buttons that work
- [ ] No console errors while opening, switching tabs and editing

Ability:

- [ ] Description, Details and Effects tabs switch
- [ ] Sequence Upgrades: add a row, type in it, remove it
- [ ] Drop a spell on the Spell List and an action on the Action List: listed with their image. The same one again:
      "… is already in the Spell List." / "… Action List." Remove each
- [ ] Skill Options: drop a skill (added), again (already there), an action ("Only Skills can be added to Skill Options.")
- [ ] Learning by Doing: add, change and remove a category. Drop a skill (added), a non-skill (warning), the same skill
      again (already taught). Remove a skill
- [ ] An entry whose Item was deleted shows "Unknown Item" with the hazard icon, and can still be removed
- [ ] Dropping an Item on the sheet outside the lists does nothing

Action:

- [ ] Description, Details and Effects tabs switch; Action Type, Uses Ammo and the other fields save
- [ ] Uses Ammo offers No / Fires rounds; Rounds per shot only shows for Fires rounds. An old Reload or Pull Bolt
      action shows its old choice marked "(old)" and a warning that it does nothing now
- [ ] Skill slot: drop a skill, open it, remove it
- [ ] Special Results (Description tab): saved ones show one row each; "Add Special Result" adds a blank row whose text
      sticks; the trash button removes only that row. On a locked compendium action the buttons do nothing
- [ ] Traits box under Action Type: Speech, Reaction, Grapple, Parry, Aimed at someone. Ticking saves straight away; on
      a locked compendium action the boxes are greyed out

Spell:

- [ ] Description, Details and Effects tabs; Special text box; Sequence Upgrades add / remove
- [ ] The same Traits box as actions
- [ ] Skill slot: drop a skill, open it, remove it. Dropping any other Item on the sheet does nothing

Sequence:

- [ ] Description and Acting Principles boxes save
- [ ] Attribute Gain: add a row, change attribute and value, remove it
- [ ] Skill Increase: drop a skill (value 1), again ("… is already in Skill Increase."), change the value, remove it
- [ ] Abilities Gained: drop an ability, again (already there), remove it
- [ ] Knowledge and Training: drop a skill, a non-skill ("… is not a skill."), the same skill again. A sidebar skill that
      came from the compendium saves the compendium skill (the study speed-up still applies)
- [ ] Dropping an Item outside the lists does nothing

Skill:

- [ ] Related-skill categories: add, change category and mode, remove. With every category used: "all used"

Gear and clothing / bags:

- [ ] No tabs. Click the image: the file picker opens and the new image saves
- [ ] Value "£3 10s" saves and shows as £3 10s; "nonsense" warns and keeps the old value. A purse's money boxes the same
- [ ] On a character: carry / container dropdowns, the granted Abilities / Actions lists (drop, duplicate warning,
      remove, open), and a gun's Reload / Chamber / Rotate / Unload buttons work (more under **Firearms**)
- [ ] A coat or bag on a character lists what's inside and how full it is
- [ ] Gear has an Effects list above its description; containers don't

---

# Rolls

## Skill check dialog

Files: `module/apps/skill-check-dialog.mjs`, `module/apps/roll-dialog.mjs`, `module/helpers/skill-check-formula.mjs`

- [ ] Click a skill's `+N` on the Character tab: "Skill Check" opens with the skill's name and level
- [ ] "Linked Attribute" starts on the skill's own linked attribute (check it against the skill's item sheet)
- [ ] The Roll button's number is attribute total + level bonus (+ the skill item's modifier, if it has one)
- [ ] Roll: the dialog closes; the chat card has the right total and "`<Skill>` Check (`<Attribute>`)"
- [ ] The card's breakdown shows labelled rows (attribute, level), and penalties show with a minus sign
- [ ] Change "Linked Attribute": the total updates and a hint says it's for this roll only. The card says
      "`<Skill>` Check (`<New>` instead of `<Default>`)". Reopen: back to the normal attribute
- [ ] Add a modifier (label and value, Add or Enter): it's listed with ×, the total updates. A negative one too.
      × removes one. A blank or 0 value warns and adds nothing. The card's breakdown lists each modifier's label
- [ ] A skill item with a nonzero `system.modifier`: an "Item Modifier" line shows, and both totals include it
- [ ] Close without rolling: nothing posted; reopening starts fresh
- [ ] Untrained skills: with the default setting they roll. Turn off "Allow Untrained Skill Checks" (System Settings):
      the dialog doesn't open and a warning names the skill; trained skills still roll. Turn it back on: rolls again

## Roll dialogs, who sees it, and Shift-click

Files: `module/apps/roll-dialog.mjs`, `module/helpers/message-modes.mjs`

Setup: set the chat sidebar's roll mode to Private GM Roll.

- [ ] Skill rolls, attribute checks and actions without a skill all open a roll dialog with the modifiers list, four
      who-sees-it buttons (Public, Private GM, Blind GM, Self) and a Roll button
- [ ] The buttons start on Private GM (the sidebar's choice). Pick Blind GM and roll: only the GM sees it. The sidebar
      is unchanged, and the next dialog starts on Private GM again
- [ ] Public: posted as the character, for everyone
- [ ] Pick a mode, then add a modifier: the mode stays. Change a skill roll's attribute: the mode and the Spirituality
      box stay
- [ ] Shift-click a skill, an attribute total and an action's roll button: each rolls straight away with the sidebar's mode
- [ ] A roll with a DC (a status check from a start-of-turn card) shows "DC 15" in the dialog, and the card says
      "DC 15: Success" or "Failure" (a total equal to the DC succeeds)

## Actions, spells and damage

Files: `module/helpers/action-roll.mjs`, `module/apps/action-roll-dialog.mjs`, `module/data/item/character_building/`

- [ ] An action without a skill: the dialog shows its formula with the character's numbers filled in; its Modifiers
      field is in the list (removable); its Spirituality Cost has the checkbox
- [ ] Attack card: "Roll Damage" with "Big Success" to its right
- [ ] Roll Damage: the damage card has "Damage (N)" and "Heal (N)". Select a token and click Damage: Health drops by N
      (it can go below 0). Heal raises it (not above max). With nothing selected: a warning
- [ ] Big Success: below the formula's average, the card says "rolled X, raised to the average (Y)" and the buttons use
      Y; otherwise it shows the roll and the average, and the buttons use the roll
- [ ] As a player, Damage with a goblin selected warns that only the GM can change its Health
- [ ] The sheet's own Damage button rolls normal damage, with the same Damage / Heal buttons
- [ ] A hotbar macro of an action or a spell rolls its attack

Spells:

- [ ] Spell sheet, Details tab: Skill slot (empty says it rolls with Occultism), Attack Roll Macro, Modifiers, Damage
      Roll Macro (with the damage-types hint) and Damage Type
- [ ] Spells tab (player and NPC): each row has "[d20 Occultism +N]" and, with a damage formula, a Damage button.
      Rolling opens the skill check dialog with the Spirituality checkbox; the card has Roll Damage / Big Success.
      Another skill on the spell: the button and roll use it
- [ ] Spell Lists fold by clicking their title and start open. Closed stays closed for you, open for another player
- [ ] Player sheet: star a spell: it's in Favorites on the Actions tab (with its roll buttons), not in the type
      sections. Unstar from either place. NPC spell rows have no star

Damage types and reduction:

- [ ] A Physical action with "2d6[fire] + 1d4 + 2": the card's title says (Fire, Physical) and a line shows e.g.
      "7 Fire · 5 Physical". "2d6" on a Fire action: (Fire), no breakdown line
- [ ] The sheet's Damage hover shows the formula with its types
- [ ] A target with Physical 3 and Fire 2 resistance: "5[physical] + 6[fire]" takes 6 ("11 - 5 reduction: Physical 3,
      Fire 2"). Untyped damage and types it doesn't resist go through in full. A type never goes below 0
- [ ] Shift-click Damage: the full amount, no reduction. Heal is never reduced
- [ ] A Physical resistance row and worn armor that reduces physical add together
- [ ] Big Success raised to the average: each type at its own average, reduction taken off those

## Spending Spirituality

Files: `module/helpers/spirituality.mjs`, `module/apps/roll-dialog.mjs`

- [ ] Sidebar Spend button (player and NPC): a dialog with current / max Spirituality, an amount and an optional reason.
      Spending lowers it and posts "X spends 3 Spirituality on Y." (how much is left isn't shown)
- [ ] More than the actor has: a warning, nothing changes. Closing the dialog spends nothing
- [ ] An action with a skill and a cost: the roll dialog has a ticked "Spend N Spirituality" box. Rolling spends it and
      the card says "-N Spirituality". Unticked, or closing without rolling: nothing spent
- [ ] Not enough Spirituality: the box is greyed out with a warning; the roll happens without spending
- [ ] An action with no skill but an Attack Roll Macro and a cost: rolling spends it (note on the card)
- [ ] An action with a cost and nothing to roll: a blue "Spend N" button that spends and posts to chat
- [ ] A spell with a cost: the roll button AND "Spend N" (cast one way or the other, not both)
- [ ] An action with a cost and a roll: no "Spend N"; the cost goes through the roll dialog
- [ ] The same from a hotbar macro

## Firearms and special bullets

Files: `module/helpers/gun-feed.mjs` (unit-tested), `module/helpers/firearms.mjs`, `module/helpers/gun-handling.mjs`,
`module/helpers/action-roll.mjs`, `module/data/item/character_building/gear.mjs`, `module/sheets/base-actor-sheet.mjs`,
`module/sheets/item/inventory/inventory-sheets.mjs`, `templates/item/inventory/gear-sheet.hbs`,
`templates/actor/player-character/parts/entry-rolls.hbs`, `module/macros/retire-gun-actions.js`

Setup: run the Retire Gun Actions macro first (report, then `APPLY = true`). Klein holds the Revolver and the Bolt
Action Rifle from the compendium, plus a double-barrel shotgun (gear, Firearm ticked, Feed: Barrels, capacity 2, with
a Shoot action) and ammo for each. A special bullet: Pistol ammo with an ability whose Spell List has a spell costing
3 Spirituality and one costing more than Klein has.

Retiring the old gun actions:

- [ ] The macro's report lists each gun with its old actions and the Action Type each becomes (Reload (Revolver) →
      Reload: Attack, Pull Bolt → Chamber: Free), and the old actions to delete by hand. Nothing changes yet
- [ ] With `APPLY = true`: the guns' action lists keep only Shoot; their Handling shows the copied Action Types. Run it
      again: no guns to update
- [ ] Klein's Actions tab: no Reload or Pull Bolt rows; each Shoot row has the gun's buttons

Gun buttons on the Shoot row:

- [ ] Revolver's Shoot row: attack, Damage, Reload, Rotate, Unload and the "5/6" count. Rifle: Reload, Chamber, Unload.
      Shotgun: Reload, Unload
- [ ] Hover over each: "Reload: Attack action. Loads as many as fit.", "Rotate: Quick action", "Chamber: Free action",
      "Unload: Attack action"
- [ ] Change the Revolver's Reload to Full and Rounds per Reload to 2 on its sheet: the tooltip says "Reload: Full
      action. Loads up to 2."; the Load dialog can't go over 2, and Shift-click loads 2
- [ ] A full gun's Reload and an empty gun's Unload are faded but still show their tooltip; clicking says why nothing
      happens ("already full", "already empty")
- [ ] A gun with two Shoot actions: both rows have the buttons. Starring only one in Favorites: its buttons are there too
- [ ] A Shoot action Klein owns directly (not on a gun): its buttons work the gun in his hand. Holding no gun or two
      guns: no gun buttons
- [ ] The same buttons on an NPC's sheet
- [ ] Macro: `game.lotm.GunHandling.get(gun, "reload")?.perform(actor)` reloads, with the dialog

The gun sheet:

- [ ] The compendium Revolver (no feed saved yet) shows Feed: Cylinder; the Bolt Action Rifle shows Magazine. A new
      gun starts as Cylinder (capacity 6); with a capacity of 1 or 2 it shows Barrels. Pick Magazine for rifles and
      pistols
- [ ] Magazine shows Has Chamber (and Self-Loading once it's ticked); Cylinder and Barrels don't
- [ ] Handling: one Action Type dropdown per button the feed has (Reload, Chamber only with a chamber, Rotate only for
      a cylinder, Unload) and Rounds per Reload. Changes save. The buttons at the bottom match, with the same tooltips
- [ ] A loaded gun: change its Feed: "Unload Revolver before changing its feed." and the dropdown goes back. Empty:
      the feed changes. Changing anything else on a loaded older gun gives no warning
- [ ] The firing order list: every round (and empty chamber or barrel) in the order they fire; the next one has an
      arrow; special rounds have a star (hover: the tooltip). Loaded and Next match the list

Loading:

- [ ] Reload: the dialog lists only ammo that fits, special ammo with ✦. The amount starts at what fits (or what's in
      the box) and can't go over the room left. The hint says which round fires first
- [ ] Revolver: load 1 special bullet, then reload with ordinary ammo: only the 5 that fit load; the boxes drop by 1
      and 5; the special bullet is under the hammer
- [ ] Shift-click Reload (gun sheet or Shoot row): fills it from the first ammo that fits, no dialog
- [ ] Rifle: fill the magazine; the last round loaded is listed first (it fires first). With the chamber empty, "Straight
      into the chamber" loads just one round there: "... straight into Rifle's chamber"
- [ ] Shotgun: load a slug, then a special shell: Barrel 1 slug, Barrel 2 special
- [ ] Unload: every round goes back to its box. Delete the special bullets' box first: they come back as a loose stack
      that keeps the ability

Firing:

- [ ] Revolver: Shoot fires the chamber under the hammer and the cylinder turns one chamber
- [ ] Rotate (gun sheet or Shoot row): pick a chamber; it's under the hammer, chat says which. Rotate to an
      empty chamber and Shoot: "Click. Chamber N of Revolver is empty ...", no roll, and the cylinder turns
- [ ] An empty gun: "Click. Revolver is empty." and the cylinder doesn't move
- [ ] Rifle: Shoot fires the chambered round; then "no round in the chamber" until Chamber
- [ ] Shotgun with different rounds in its barrels: Shoot asks which barrel (cancel: no roll). With one loaded
      barrel, or the same round in both: no question

Special bullets:

- [ ] Fire the special bullet: Spirituality drops by the cheap spell's cost straight away. A card lists the spells:
      the one paid for has a "Cast" button; the expensive one says it didn't go off (not enough Spirituality)
- [ ] Cast: the spell's roll dialog has no Spirituality box, and rolling doesn't spend any more. The button is greyed
      out after, also after reloading the world. Closing the dialog without rolling leaves it usable
- [ ] As a player who doesn't own Klein: Cast does nothing
- [ ] Ordinary rounds post no card

---

# Statuses

## Status list, Token HUD and the Effects tab

Files: `module/effects/status-effects.mjs`, `module/effects/status-rule.mjs`, `module/documents/active-effect.mjs`,
`templates/actor/player-character/parts/effects.hbs`

- [ ] The Token HUD's status icons are the 18 system statuses (Loss of Balance ... Shock, with Ethereal after
      Invisible); hovering shows the name; turning one on puts its icon on the token and a row on the Effects tab
- [ ] Effects tab (player and NPC): a grid of the 18 statuses, off ones faded, on ones in colour with a gold ring.
      Clicking toggles, and the Token HUD agrees
- [ ] Each effect row has its icon, name, Rules (book), Turn off / on, Edit and Delete
- [ ] Rules opens that status's page in LOTM Rules > Status Effects (Advantage and Disadvantage share a page, as do Dying
      and Dead)
- [ ] Turn off: the row fades and the status stops counting; Turn on brings it back
- [ ] Edit opens the effect sheet. A duration of 2 rounds in combat: the row shows the time left, and the effect is
      deleted when it runs out
- [ ] Delete asks first (Shift-click skips it)
- [ ] Drop an effect from another actor or an item onto the sheet: it's added
- [ ] A player who only observes the actor sees the tab but can't toggle, turn off or delete
- [ ] Helpless: a linked Bound comes with it. The token shows both icons, the HUD lights both, and the tab has a
      "Bound · From Helpless" row with no Turn off or Delete. Clicking Bound while Helpless is on: "Bound comes from
      Helpless. Remove Helpless instead." Turning Helpless off or on, or removing it, does the same to its Bound.
      A creature already Bound keeps that Bound when a Helpless comes and goes
- [ ] Blind: the token loses its sight. Dead: the combat tracker marks the combatant Defeated
- [ ] "Invisible Hides Tokens" (Game Settings) is off by default: Invisible is just an icon. On (the world reloads):
      invisible tokens are hidden from players who can't see invisible creatures
- [ ] Initiative: 1d20 + the Agility total

## Physical Defense and Movement

Files: `module/effects/status-math.mjs`, `module/data/actor/base-actor.mjs`, the sidebar templates

Setup: note Klein's Physical Defense and Movement (e.g. Agility 5, Armor 3, Dodge Trained +2: Physical 20).

- [ ] Bound or Off Guard: Physical Defense loses Agility and Dodge (20 → 13). The box turns gold, and hovering it says
      "Bound: no Agility, no Dodge". Helpless: the same as Bound
- [ ] Loss of Balance: Agility halved, rounded up, for Physical Defense and Movement only (5 counts as 3: Physical 18,
      Movement drops). The Agility total and Agility checks don't change. Both boxes have hover text
- [ ] Loss of Balance's row has Stand Up: it removes the status and posts "<name> stands up (1 movement action)."
- [ ] Disadvantage: Physical −2 (20 → 18). With Bound too: just Bound's 13
- [ ] The NPC works the same way

## Health statuses

Files: `module/effects/health-statuses.mjs`, `module/data/actor/base-actor.mjs`

Setup: Klein with 12 max Health and Physique 4, no Sequence (an ordinary person).

- [ ] Health can go below 0 (Damage button, typing on either sheet, the token bar). Healing stops at the maximum
- [ ] Health 6: nothing. Health 5: Bloodbath, and Bleeding starts with it (two icons)
- [ ] Health 0: Dying (Bloodbath stays). −4: still Dying. −5: Dead (big skull, Defeated in the tracker), Dying comes off
- [ ] With a Sequence (a Beyonder): death only below −8
- [ ] Heal back to 12: Bloodbath and Dying come off; Bleeding stays until treated; Dead stays (remove it by hand)
- [ ] Bloodbath turned on by hand also starts Bleeding; already bleeding: no second Bleeding
- [ ] An unlinked NPC token: its own Health and statuses change, not the NPC in the sidebar

## Start-of-turn cards and status buttons

Files: `module/effects/turn-start.mjs`, `module/effects/rules/`, `module/documents/combat.mjs`

Setup: a combat with Klein and a goblin. Cards are whispered to the creature's owners and the GM (an NPC's only to the GM).

- [ ] A creature with none of these statuses gets no card. A Dead or Defeated combatant gets none either
- [ ] Bleeding: "Roll 1d2" rolls 1d2 (shown as "Bleeding") and takes it off Health. With Internal bleeding ticked on the
      effect's LotM tab, the card says only extraordinary medicine or surgery stops it
- [ ] Fear / Angry with no source say "its source". Set the source on the LotM tab (My Target): the card and the
      Effects tab row name that creature
- [ ] Bloodbath: "Roll Physique (DC 15)". Failure: Helpless (and Bound), and a public "faints and is Helpless". While
      Helpless, later cards have no Bloodbath check
- [ ] Dying: "Roll Physique (DC 15)": failure kills it, with a public "dies". "Roll Will (DC 15) to act": chat says
      whether it can take an attack, casting or move action this round (owners and GM). While Helpless, only the Physique roll
- [ ] Fear: "Roll Will (DC 15)": success marks it resisted; later cards only say checks against the source are −4
- [ ] Angry/Taunted: "Roll Will (DC 20)": success removes it, and chat says it calms down
- [ ] Shock: a reminder line, no button
- [ ] Each button works once (again: "already rolled"; reopening chat shows it greyed out). Closing the dialog without
      rolling leaves it usable. Someone who doesn't own the creature can't use its buttons. Shift-click skips the dialog
- [ ] Physical improvement (a Physique gain on the Sequence, Beyonder Bonus or Corruption): no Bloodbath check, Bleeding
      loses no Health, and Dying says it acts normally
- [ ] Effects tab buttons: Bleeding's Treated removes it; Fear's Resist (Will 15) rolls the card's check and goes once
      resisted; Angry's Calm Down (Will 20), Meditation (Full) removes it, Meditation (Half) halves its penalty and
      disappears
- [ ] Status chat lines are whispered to the owners and the GM; only "faints and is Helpless" and "dies" are public

## Statuses in rolls

Files: `module/effects/status-rolls.mjs`, `module/apps/roll-dialog.mjs`, `module/dice/lotm-roll.mjs`

Each status modifier is a row with the status icon, and can be removed for that roll.

- [ ] Angry/Taunted: every skill check, attribute check and action roll starts with "Angry/Taunted −4"; −2 after
      Meditation (Half)
- [ ] Fear with a source: "Fear vs. <source> −4". Targeting the source: still there. Only someone else targeted: gone.
      Nothing targeted: there
- [ ] Advantage with a source: "Advantage vs. <source> +2", the same way
- [ ] Target a Helpless creature and roll an action: "Advantage: target is Helpless +2" (not on a plain skill check).
      With Advantage against it as well: only one +2
- [ ] The card's breakdown shows each modifier, penalties with a minus sign, and the Roll button's total matches
- [ ] Notes above the Roll button and on the card: Deaf on Listen checks only; Blind on action rolls (Inspiration check,
      no critical strikes); an Invisible target on actions and skill checks (find it first); a Bound or Helpless
      target on actions (Vital Strike isn't at a disadvantage). No statuses: no notes box

## Use Anyway warnings and Traits

Files: `module/effects/status-restrictions.mjs`, `module/helpers/action-roll.mjs`, `module/helpers/spirituality.mjs`,
`module/helpers/firearms.mjs`

Setup: actions with Traits (Grapple: grapple + aimed, Limb parry: parry + reaction, Intimidate: speech + aimed,
Shoot: aimed; see `tag-action-traits.js`). The warning lists every status that stops the action; Cancel does
nothing, Use Anyway goes ahead.

- [ ] Bound: Grapple, Limb parry and move actions warn; Shoot doesn't. Helpless warns as Bound
- [ ] Loss of Balance: move actions. Off Guard: reactions. Silence: speech. Blind: aimed
- [ ] Dying: attack, move and full actions warn, free and quick don't; with physical improvement, no warning
- [ ] Dead: everything warns
- [ ] Use Anyway on a roll: the card says "Used despite: Bound" above the damage button
- [ ] Use Anyway on "Spend N": it spends, then a chat line says it was used despite the status. Cancel spends nothing
- [ ] A gun's Reload button while Dying (Reload is an Attack action): the warning names "Reload (Revolver)"; Use
      Anyway reloads, then the "Used despite" line; Cancel leaves the gun alone; a reload that can't happen (no ammo)
      posts no "Used despite" line. Chamber (a Free action) and Rotate (Quick) don't warn
- [ ] Shift-click and hotbar macros show the warning too
- [ ] Blind with an empty gun: "Click. Revolver is empty." with no warning. Loaded: the warning; Use Anyway rolls and
      uses the round; Cancel keeps it

---

# Effects on items

## Effects compendium

Files: `packs/effects/`, `system.json`

- [ ] The Effects compendium has 17 entries, one per status (Ethereal isn't in it yet), each with its icon and a link
      to its rules page
- [ ] As the GM, drag Fear onto a goblin: the token shows Fear and its Effects tab lists it (no source)
- [ ] Drag Helpless onto a token: Helpless and its linked Bound both appear

## Item Effects tab and the effect sheet

Files: `module/sheets/base-item-sheet.mjs`, `templates/item/parts/item-effects.hbs`, `module/apps/effect-config.mjs`,
`templates/effects/effect-lotm.hbs`

- [ ] Ability, Action, Spell and Sequence sheets have an Effects tab; gear has the list above its description
- [ ] New Effect on a spell or action: "New Effect" opens with Use: Targets. On an ability, Sequence or gear: Passive
- [ ] Rows show the use ("Targets", "Passive (lent to the owner)", "Area (once): Circle, 10 ft") and statuses
- [ ] On / Off, Edit and Delete work (Delete asks first; Shift-click skips it)
- [ ] Drag Fear from the compendium onto a spell's Effects tab: copied in as Targets; onto an ability: as Passive.
      From one spell to another: it keeps its Use
- [ ] A locked compendium item shows its effects without New / On / Off / Delete
- [ ] Every effect sheet has a LotM tab after Foundry's own (Details, Duration, Changes)
- [ ] Source: "None" at first. Target one token, My Target: its name shows; Clear: None again. Save and reopen: it
      stuck. With no target, or two, My Target warns
- [ ] Use (effects on items only): Area or Zone shows Shape and Size; Targets / Self / Passive hide them. Changing it
      changes the row's label on the item sheet. An effect on an actor has no Use
- [ ] Fear effects show "Resisted", Angry ones "Penalty halved", Bleeding ones "Internal bleeding"; others don't

## Passive effects

Files: `module/documents/active-effect.mjs`, `module/effects/granted-effects.mjs`, `module/documents/item.mjs`

Setup: an ability with a passive effect (Changes: `system.attributes.ins.beyonder_bonus`, Add, 2).

- [ ] Klein owns the ability: his Effects tab lists it as "From <ability>", and Inspiration's total goes up by 2
- [ ] Gear with a passive effect: held or worn, it counts; stowed, the row says "Not active while stowed" and it doesn't.
      It has no Delete button on the actor (it belongs to the gear)

Granted abilities (the ability is in a Sequence's or gear's granted abilities, not owned):

- [ ] Add the Sequence to Klein: his Effects tab lists "From <ability> (<Sequence>)" and Inspiration goes up by 2. The
      Sequence's own Effects tab shows the copy as "Copied from the ability <ability>: edit the ability instead"
- [ ] Effects the ability hands out (Targets / Self / Area / Zone) aren't copied
- [ ] Gear granting the same ability too: still one copy (on the Sequence), +2 not +4
- [ ] Take the ability off the Sequence: the copy moves to the gear. Stow the gear: it stops counting; hold it: back on
- [ ] Drop the ability itself on Klein: the copies go (his own ability counts instead). Delete it: the copy comes back
- [ ] Delete the Sequence and the gear: the copies go with them
- [ ] NPC: hide the granted ability: its copy goes and the number drops; Restore: back
- [ ] Edit the ability's effect (+2 to +3): Klein's tab marks the copy "Out of date" and shows "Some effects from granted
      abilities are out of date or missing" with Refresh. Refresh: +3 and the notice goes. A copy turned off stays off
- [ ] A second passive effect on the ability: the notice appears; Refresh adds it
- [ ] `sync-granted-effects.js` lists the actors it changed; running it again says everything is up to date
- [ ] Refresh shows for owners only

## Applying effects: Targets and Self

Files: `module/effects/effect-application.mjs`, `module/helpers/action-roll.mjs`

Setup: a spell of Klein's with an effect "Terrified" (Fear, 3 rounds, Use: Targets).

- [ ] Roll the spell's attack: the card has "Apply Terrified" under the damage buttons. Passive effects get no button
- [ ] Target two goblins, click it: both get Terrified, chat says "Klein applies Terrified to Goblin, Goblin 2.", and
      their dialogs show "Fear vs. Klein −4"
- [ ] Nothing targeted: a warning, nothing applied. Two tokens of one linked actor: one copy
- [ ] Apply from the spell's Effects tab does the same (the caster is the spell's owner; for a compendium spell, your
      selected token or your character)
- [ ] Use: Self (e.g. Advantage on Raid). One enemy targeted: Klein gets Advantage with that enemy as source. None
      targeted: no source
- [ ] A copy starts fresh: its duration counts from now, and it isn't "resisted" even if the spell's effect was
- [ ] Deleting a goblin's copy leaves the spell's effect alone

As a player who owns Klein, with the GM logged in:

- [ ] Apply on goblins the player doesn't own: the GM's client adds them, chat says so. No GM logged in: a warning, nothing
- [ ] Someone who doesn't own Klein clicks his Apply button: a warning, nothing
- [ ] Dragging an effect onto a token the player doesn't own is refused by Foundry (the Apply button is the way)

Source from dragging (as the GM):

- [ ] Drag Terrified from the spell on Klein's sheet onto a goblin: the goblin's copy names Klein as the source
- [ ] From a spell in the sidebar (no owner): no source
- [ ] Drag a spell with effects from the sidebar onto Klein, then drag the effect from Klein's copy: the source is Klein

## Area and zone effects

Files: `module/effects/effect-areas.mjs`, `module/data/region-behavior/apply-effect.mjs`

Change Terrified's Use, Shape and Size on its LotM tab for each test.

Area (Circle, 10):

- [ ] Apply: a notice says how to place it; a 10 ft circle follows the cursor with its measurements; the mouse wheel
      turns shapes that turn; right-click cancels with nothing applied
- [ ] Left-click: a list of everyone inside, all ticked except Klein ("the caster"). Apply: the ticked goblins get
      Terrified (source Klein); chat says who; nothing is left on the scene
- [ ] Unticked goblins get nothing. Untick everyone, or Cancel: nobody does. Placed where nobody is: "Nobody is inside"
- [ ] Cone, Ray and Rectangle have the right shape and size (a ray is one grid space wide)
- [ ] Emanation: no placing; the list has everyone within the size of Klein's token edge. Klein not on the scene: a warning
- [ ] Tokens on another level of the scene aren't in the list
- [ ] As a player who owns Klein: placing works, and the goblins get it through the GM

Zone (Circle, 10):

- [ ] Apply and place: a Region named "Terrified (Klein)" in your user colour stays, with an "Apply LotM Effect" behavior
- [ ] Goblins already inside get Terrified at once; Klein doesn't (the caster isn't affected by their own zone)
- [ ] Klein's tab has "Zone: Terrified" with 3 rounds, "Zone on the scene: remove this to end it". Chat: "Klein creates
      Terrified."
- [ ] A goblin walking out loses it; walking back in gets it once, with Klein as source
- [ ] Delete Klein's marker: the Region goes, and the goblins inside lose Terrified
- [ ] Delete the Region instead: Klein's marker goes, and so do the goblins' copies
- [ ] In combat, after 3 rounds the marker runs out and the zone goes with it
- [ ] Emanation zone: centered on Klein's token, no placing; it moves with him, giving and taking Terrified as it passes
- [ ] As a player who owns Klein: the GM's client makes the zone, Klein gets the marker, and the player can remove the
      marker to end it. No GM logged in: a warning, no zone

Zones made by hand (GM):

- [ ] Draw a Region, add "Apply LotM Effect", drop Fear from the Effects compendium into its Effects box, Source empty:
      tokens walking in get Fear (no source) and lose it walking out
- [ ] With a Source: copies name that actor, and it isn't affected unless "Affects its source too" is ticked
- [ ] Changing the behavior's effects while tokens are inside swaps their copies
- [ ] Foundry's own "Apply Active Effect" behavior still works (its copies have no source)

---

# Vision

## Spirit Vision and Death Vision

Files: `module/canvas/` (spirit-vision.mjs, spirit-vision-shader.mjs, spirit-vision-glsl.mjs, spirit-aura.mjs,
token.mjs), `module/effects/status-effects.mjs` (Ethereal), `module/data/actor/base-actor.mjs` (`system.spirit`),
`templates/actor/npc/header.hbs`

Setup: a dark scene (Darkness 1) with walls, a light source in one room, and token vision on. Klein (no darkvision:
Basic Sight range 0) in the lit room, a goblin next to him, and a "Ghost" NPC token with the Ethereal status in the
same room. In a dark room nearby, within 30 ft and in line of sight: another goblin and a second Ethereal ghost.
Klein has a Spirit Vision ability, which grants the "Activate Spirit Vision" action (Spirituality Cost 1). On that
action (in the compendium), add an effect "Spirit Vision", Use: Toggle, Spirituality per round 1, with three
changes, all Override:
`token.sight.visionMode` = `lotmSpiritVision`, `token.detectionModes.lotmSpiritSight.enabled` = `true`,
`token.detectionModes.lotmSpiritSight.range` = `30`; and a fourth, Add: `system.attributes.ins.checkBonus` = `2`.
Klein has at least 2 Spirituality.
Test as a player who owns Klein (the GM sees everything). "Spirit Vision on" below means: its button is On.

- [ ] On Klein's Actions tab, Activate Spirit Vision has a grey "Off" button (no "Spend 1" button). Hover: it says
      it's off, switching on costs 1 Spirituality, and keeping it on costs 1 per round in combat
- [ ] The effect's LotM tab shows "Spirituality per round (while on)" only while Use is Toggle
- [ ] Spirit Vision off: the room looks normal; the Ghost can't be seen, even in the light
- [ ] Click Off: it turns gold, "On". Klein's Spirituality goes down by 1; chat: "Klein switches on Spirit Vision."
      with "-1 Spirituality". The Effects tab lists Spirit Vision
- [ ] Spirit Vision on: Klein's Inspiration and maximum Spirituality are the same as before. Click Inspiration on the
      sheet: the roll window lists "Spirit Vision +2", and the roll adds it. A skill check that uses Inspiration lists
      it too; switch that check's attribute to another one in the window: the row goes; switch back: it returns.
      A Strength check doesn't list it. Spirit Vision off: no row
- [ ] Spirit Vision on: everything Klein can see is repainted in strong colours, with cyan outlines - the whole lit room,
      even though he has no darkvision. Details (rug pattern, furniture, tokens) can still be made out. The colour
      edges ripple slowly. The dark room stays dark
- [ ] Walk Klein out of the light and back, so part of the map is explored but out of sight: those parts show their
      normal colours under the fog; only what he can see right now is recoloured. The border follows the edge of
      the light and walls as he moves
- [ ] No "LotM | Foundry's sprite shader is different" warning in the console (F12) once the effect is on. With that
      warning the room looks normal: the effect switched itself off rather than break the canvas
- [ ] Move Klein around the room: the ripples stay where they are on the map; they don't slide along with him
- [ ] Token art (faces, armour, frames) is recoloured but stays crisp: it doesn't ripple and has only faint outlines.
      Move a goblin: the calm area moves with it, and the floor it left ripples again
- [ ] Pan and zoom: the ripples stay attached to the map and keep their size on the map
- [ ] The nearby goblin has an aura, easy to see over the bright colours: a wide gold glow, almost white at its edge,
      tinting the token's rim, with a soft dark ring around it. It breathes slowly. Zoom in and out: it stays the same
      size compared with the token, and stays visible
- [ ] Damage the goblin to half Health: the aura turns orange-red; near 0: deep red
- [ ] Klein's own token has an aura too, in his own colour (his Health, or his Spirit Aura if set)
- [ ] The Ghost is visible, with a pale blue glow
- [ ] Spirit Vision isn't darkvision: the goblin and the ghost in the dark room can't be seen. Give Klein a light that
      reaches them, or Basic Sight range 30 (darkvision): both show up, the ghost with its pale blue glow
- [ ] With the room lit, move the Ghost more than 30 ft from Klein: it disappears (Spirit Sight's range)
- [ ] On the Ghost's NPC sheet header, pick a red Spirit Aura: its glow turns red. Clear it: pale blue again
- [ ] Remove Ethereal from the Ghost: it's an ordinary creature again (seen in the light, gold glow)
- [ ] Give Klein Blind: the effect and the glows stop
- [ ] Configure Settings > Core > "Photosensitive Mode" on: the colours stay but stop moving, and auras stop breathing
- [ ] Click On: it goes back to Off, no Spirituality spent; chat: "Klein switches off Spirit Vision." The room looks
      normal again and the Ghost disappears. Switch it on again, then delete Spirit Vision from the Effects tab: the
      button shows Off
- [ ] With 0 Spirituality, click Off: a warning, and it stays off
- [ ] Combat, with Klein and a goblin, Klein on 3 Spirituality: switch Spirit Vision on (3 -> 2). Next Turn until
      Klein's turn starts: chat "Klein spends 1 Spirituality on Spirit Vision." (2 -> 1). The goblin's turns cost
      Klein nothing. Next round, Klein's turn: 1 -> 0. The round after: chat "Klein doesn't have the Spirituality
      to keep up Spirit Vision, so it ends."; the button shows Off and the room looks normal. No pop-up for the GM
- [ ] Out of combat, Spirit Vision stays on without costing anything per round
- [ ] Give Activate Spirit Vision the Speech trait for a moment, and Klein Silence: switching on shows the usual
      "Use Anyway" warning; switching off never asks. Undo both
- [ ] Death pathway: switch Spirit Vision off and give Klein a second, always-on effect "Death Vision" with
      two changes, both Override: `token.detectionModes.lotmDeathSight.enabled` = `true`,
      `token.detectionModes.lotmDeathSight.range` = `30`. The room looks normal, and the Ghost is visible all the
      time (in the light), with a bright green aura. The goblins look normal, with no aura. The dark room's ghost
      still can't be seen
- [ ] Switch Spirit Vision back on (the same action and effect): the room drains to pale green with
      drifting mist instead of the Spirit Vision colours. The Ghost's aura is bright green; goblins' auras are faint,
      stronger when hurt. Tick Undead on a goblin's header: its aura is bright green. Switch Spirit Vision off: the
      normal look again; the Ghost keeps its green aura, the goblins lose theirs
- [ ] Turn the "Death Vision" effect off while Spirit Vision is on: the Spirit Vision colours come back
- [ ] Token Config > Vision lists "Spirit Vision" and "Death Vision"; Detection Modes lists "Spirit Sight" and
      "Death Sight"
- [ ] Configure Settings > "Reduce Spirit Vision Effects" on (the world reloads): the room looks normal and nothing
      glows, but the Ghost is still revealed. Turn it off again
- [ ] An unlinked goblin token: damaging it changes its glow, not the goblin in the sidebar

---

# Hits, damage, sanity, promotion, luck, rest

## Hit or miss and Big Success

Files: `module/helpers/check-results.mjs`, `module/helpers/check-chat.mjs`, `module/apps/roll-dialog.mjs`,
`module/data/item/character_building/action.mjs`, `spell.mjs`, `templates/item/character_building/action.hbs`, `spell.hbs`

Setup: Shoot's Defense Targeted set to "Physical, too fast to dodge (firearms)"; a melee action set to Physical Defense.

- [ ] Action and spell sheets have a Defense Targeted dropdown; blank (None) means no hit check
- [ ] Target two goblins and roll the melee attack: under the roll, "vs. Physical Defense" and each goblin with Hit or
      Miss. The GM sees each goblin's defense in brackets; the player doesn't
- [ ] A total equal to a goblin's defense is a Hit
- [ ] Shoot against a goblin: its defense is 10 + armor. Tick the goblin's Quick Dodge box: full Physical Defense again
- [ ] No targets: "No targets" under the roll
- [ ] A natural 20 says Big Success, hits every target, and the damage buttons are just Big Success. A natural 1 says
      Big Failure and misses. Any other roll has no Big Success button
- [ ] Big Success on 1d8+5 never deals less than 7 (the card says "raised to half the maximum")
- [ ] A status check (Dying's Physique) with a natural 20 passes, with a natural 1 fails, whatever the total

## Damage reduction and resistance

Files: `module/helpers/damage-math.mjs`, `module/helpers/action-roll.mjs`, `module/data/actor/base-actor.mjs`,
`templates/actor/parts/damage-defenses.hbs`

- [ ] An actor saved before this update still shows its old rows under Damage Reduction, with the right types
- [ ] Add reduction "All 2" and "Physical 3"; add resistance "Fire 5" and "Poison" ticked Immune (both sidebars)
- [ ] A 4-damage physical hit: takes 1 (reduction never below 1). 3 fire: takes 0 (resistance). Any poison: 0
- [ ] "2d6[fire] + 1d4[cold]" is reduced once, not once per type (the chat table shows where it came off)
- [ ] Worn armor's reduction still shows read-only and counts

## Sanity checks and madness

Files: `module/helpers/sanity.mjs`, `module/apps/sanity-check-dialog.mjs`, `module/effects/rules/semi-out-of-control.mjs`,
`indeterminate-madness.mjs`, `out-of-control.mjs`

Setup: Klein with Will 6 (Sanity 16 / 16).

- [ ] The Check button under Sanity opens the sanity check (both sheets). Shift-click rolls 0/1 straight away
- [ ] Loss 1/1d3: rolling at or under 16 passes and loses 1; over 16 fails and loses 1d3. A natural 20 loses 3
- [ ] Angry or Fear on Klein don't add anything to the sanity check
- [ ] Losing 3+ at once: Semi-Out-of-Control, named with its madness tendency. Move actions warn (Use Anyway)
- [ ] In combat, its start-of-turn card has Roll Will (DC 10); failing opens a 0/1 sanity check. It ends after its
      1d2 rounds ("Recovered" message), or with the Recovered button
- [ ] Sanity 7: Indeterminate Madness with a symptom; back to 8: it comes off. Roll Symptom and Daily Sanity Check
      buttons on the Effects tab work
- [ ] Sanity 0: Out of Control (everyone sees it). Raising Sanity doesn't remove it
- [ ] A new NPC whose Sanity was never filled in (0) doesn't get Out of Control when edited
- [ ] Macro: `game.lotm.sanityCheck(null, { loss: "1/1d3", reason: "Test" })` opens a check for each selected token

## Promotion

Files: `module/helpers/promotion.mjs`, `module/apps/promotion-dialog.mjs`, `templates/apps/promotion-dialog.hbs`

- [ ] Drop a Sequence on Klein: the promotion dialog opens. Skip closes it; the Sequence stays
- [ ] Digestion is filled in from Klein's most advanced Sequence; the modifiers list follows the choices
- [ ] Roll: the card shows the check against Sanity, the loss (doubled without a ritual), and the stage. Promoted:
      Spiritual Overflow appears (-2 row on action and spell rolls, removable; ends with its button)
- [ ] Force a semi stage (untick the ritual, add +30): Will (DC 15) button works once; failing posts the extra sanity
      check and the next card. 5+ lost: Will (DC 20); failing rolls 1d2 for out of control or death
- [ ] As a player: the dialog opens for the player who dropped the Sequence; the GM's client doesn't open one
- [ ] No Burn Luck button on promotion cards or their Will checks

## Burning Luck

Files: `module/helpers/luck.mjs`, `module/helpers/check-chat.mjs`

- [ ] Every check card Klein rolls has Burn Luck for Klein's owner and the GM. An NPC's attack that targeted Klein
      shows it to Klein's owner too
- [ ] Burn 2 to add: a new message with the new total and the DC result / each target's Hit or Miss ("was ..." when it
      changed). Klein's Luck drops by 2. A second burn counts the first
- [ ] As Klein's owner on the NPC's attack: Klein's Luck, defaulting to Subtract
- [ ] A natural 20 or 1 stays a Big Success / Big Failure
- [ ] Dying's failed Physique check (Dead) turned into a pass with Luck: Dead comes off. Bloodbath's faint: Helpless
      comes off. Fear's resist: marked resisted
- [ ] A sanity check turned from fail to pass: the pass loss is rolled and the difference given back
- [ ] The Spend button under Luck spends Luck with a reason

## Rest and recovery

Files: `module/sheets/player-character-sheet.mjs`, `module/effects/rules/dying.mjs`

- [ ] Treated ticked, Long Rest: Health + Physique; unticked: + half Physique. Treated is cleared afterwards
- [ ] Long Rest refills Spirituality and Luck and gives +1 Sanity (none during Indeterminate Madness); a chat
      message says what happened
- [ ] Dying's start-of-turn Physique check is DC 10

## Spiritual intuition

Files: `module/apps/attribute-check-dialog.mjs`, `module/helpers/check-bonuses.mjs`, `module/macros/move-spirit-vision-bonus.js`

- [ ] Run the Move Spirit Vision Bonus macro (report, then APPLY)
- [ ] With Spirit Vision on: an Occultism check and a spell attack have no Spirit Vision row
- [ ] Inspiration check with Spiritual Intuition ticked: DC 25, title Spiritual Intuition, Spirit Vision +2 row
- [ ] Macro: `game.lotm.spiritualIntuition(actor)` opens it ticked

## Effects that grant actions

Files: `module/effects/effect-grants.mjs`, `module/data/effect/effect.mjs`, `module/apps/effect-config.mjs`,
`templates/effects/effect-lotm.hbs`, `module/sheets/base-actor-sheet.mjs`

- [ ] Effect sheet, LotM tab: Grants box with Actions and Skill Increases lists. Dropping a spell or a gear Item on
      Actions warns "isn't an action"; dropping the same action twice adds it once
- [ ] Type a new name on the Details tab, then drop an action without saving: the name is kept (saved with the drop)
- [ ] Trash can removes the action; a deleted action shows as missing and can still be removed
- [ ] Put the effect on Klein: the action is on the Actions tab in its action-type section, "Granted by" the effect,
      with its roll / damage buttons and the Favorites star
- [ ] Turn the effect off on the Effects tab: the action goes away. On again: it's back. Delete it: gone
- [ ] Klein already owns the action: one row, "Granted by" lists the effect
- [ ] A timed effect (1 round) in combat: the action goes when the effect runs out
- [ ] A passive effect with an action on gear: held -> listed; stowed -> gone (suppressed)
- [ ] A Toggle effect (Spirit Vision) with an action: the action is there only while it's switched on
- [ ] A spell's Targets effect with an action, applied to a goblin: the goblin's NPC sheet lists the action, and the
      GM can hide it with the eye-slash button
- [ ] Effects tab row says "Grants: <action>, <skill> +1 (at most Advanced)"

## Effects that raise skills

Files: `module/effects/effect-grants.mjs`, `module/data/actor/base-actor.mjs`, `module/helpers/skill-levels.mjs`,
`module/sheets/player-character-sheet.mjs`, `module/sheets/npc-sheet.mjs`, `templates/actor/player-character/character.hbs`,
`templates/actor/player-character/parts/granted-skill-entry.hbs`

- [ ] Effect with Pistol +1, no limit, on Klein (Pistol Trained): the skill row shows the link badge Proficient,
      modifier +4, hover "Effects: <effect> (+1)". The dropdown still says Trained
- [ ] Set the row's limit to "at most Trained": no badge, modifier back to Trained's
- [ ] Two effects on Pistol, +1 at most Proficient and +1 no limit, from Trained: Advanced, whichever was added first
- [ ] A Shoot action with Pistol: the dice button's bonus and the roll dialog use the raised level
- [ ] `@Check[Pistol]` in a journal rolls at the raised level
- [ ] Raise Sword to Advanced with an effect: Melee (Fighting category) goes up one too, and drops back when the effect
      is turned off
- [ ] Raise Dodge with an effect: Physical Defense goes up
- [ ] Study Pistol while it's raised: the meter and the Study dialog go by Trained, not Proficient. Fill the meter:
      the dropdown becomes Proficient, and with the effect still on the badge says Advanced
- [ ] A skill at Mastery from an effect doesn't count toward Education growth
- [ ] NPC: an effect raising a skill the NPC doesn't list adds a row for it, "Raised by: <effect>"; turning the effect
      off removes the row

## @Effect buttons and Roll Table results

Files: `module/helpers/enrichers.mjs`, `module/helpers/check-chat.mjs`, `module/effects/effect-application.mjs`,
`css/roll-dialog.css`

- [ ] A text table result `@Effect[<uuid from the Effects compendium>]` shows "Apply <name>"; `{Cursed}` changes the text
- [ ] `@Effect[bound]` and `@Effect[Loss of Balance]` apply those statuses; a misspelled one shows crossed out
      "Unknown effect"
- [ ] Listen's failure table with an @Effect result, rolled with Roll Outcome: the button applies to Klein with no
      token selected. Chat says "<effect> is applied to Klein."
- [ ] Clicking again for Klein asks "Apply it again?"; No does nothing. Selecting a different owned token and clicking:
      no question, that token gets it
- [ ] A status Klein already has: "Klein already has Bound", nothing added
- [ ] A compendium effect with a 1-round duration: it starts counting when applied
- [ ] GM draws a table from the sidebar, selects a goblin, clicks Apply: the goblin gets it
- [ ] A document result pointing at an effect (if Foundry lets an effect be dropped on a result), and a text result with
      a plain @UUID link to an effect: both get an Apply button next to the link

## Effects that end after an action is used

Files: `module/effects/action-expiry.mjs`, `module/data/effect/effect.mjs`, `module/apps/effect-config.mjs`,
`templates/effects/effect-expiry.hbs`, `module/helpers/action-roll.mjs`, `module/helpers/firearms.mjs`,
`module/helpers/spirituality.mjs`, `module/effects/toggle-effects.mjs`, `module/sheets/base-actor-sheet.mjs`

- [ ] Effect sheet, Duration tab: "Also ends when" box under Foundry's duration. Add: Action Used makes a row
      reading "any action" (or "any action this effect grants" when it grants actions)
- [ ] Drop an action on the box: a new row for it. Drop another on that row: the row's action changes. Drop a gear
      Item: warns. The X goes back to "any..."; the trash can removes the row
- [ ] Effect "Blessing": grants Smite, duration 1 hour, Action Used (blank) 1 time. On Klein, the Effects tab says
      "Ends after 1 more use(s) of any action this effect grants"
- [ ] Roll Smite: the roll posts, then "Blessing ends: Smite was used 1 time(s)." and Smite leaves the Actions tab
- [ ] Close Smite's roll dialog without rolling: nothing counted. A gun that clicks empty: nothing counted
- [ ] Rows Smite 3 times and Dodge 1 time: Smite twice then Dodge once ends it at Dodge (whichever first)
- [ ] Same effect, advance world time 1 hour before using it: Foundry's duration ends it
- [ ] Spend N button and a Fire button with no roll both count. Switching a toggle on counts; switching off doesn't.
      A Toggle effect with "any action, 2 times": switching it on doesn't use one of its own uses
- [ ] A Shoot action owned by Klein (copied from the compendium) counts for a row holding the compendium's Shoot
- [ ] A passive gear effect with 1 use: after the use the effect is turned off on the gear (not deleted), and turning it
      back on gives it its use again. Stowed gear: its effect doesn't count uses
- [ ] Changing "used" on the sheet gives uses back. An effect applied to a target from a spell starts at 0 used

## @Damage buttons

Files: `module/helpers/enrichers.mjs`, `module/helpers/action-roll.mjs`, `css/roll-dialog.css`

- [ ] `@Damage[2d6]` in a journal shows a "2d6" button. Click: a damage card ("Damage") with Damage / Heal buttons;
      select a goblin and click Damage: its damage reduction applies, the "took damage" message is posted
- [ ] `@Damage[2d6[fire] + 1d4[cold]]{Fire Trap}`: the button reads "Fire Trap"; the card "Fire Trap: Damage (Fire, Cold)"
      with "5 Fire · 3 Cold"
- [ ] `@Damage[1d8+3|fire]`: the button reads "1d8+3 Fire", all of it Fire on the card
- [ ] `@Damage[1d6+@attributes.str.total]` in Klein's ability description: rolls with Klein's Strength, posted as Klein
      even with a goblin selected. In a journal as the GM with nothing selected: warns it needs a character
- [ ] `@Damage[2d6+]` (bad formula) shows crossed out; clicking warns it isn't a valid formula
- [ ] An outcome table result with `@Damage[1d6]`: the card is posted as the character who made the check
- [ ] An action's own Roll Damage and Big Success still post the same cards as before
