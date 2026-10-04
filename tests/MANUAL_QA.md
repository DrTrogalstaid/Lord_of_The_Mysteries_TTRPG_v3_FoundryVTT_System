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
      default −4)
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
      a −4-inclusive modifier) — with the default setting, the dialog opens and
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
