# Lord of the Mysteries for Foundry VTT

![Foundry v14](https://img.shields.io/badge/foundry-v14-green)

A game system for playing the Lord of the Mysteries tabletop RPG in [Foundry VTT](https://foundryvtt.com). It has
character and NPC sheets, and the rules worked into rolls and chat cards:

- **Skills and attributes**: skill and attribute checks with a roll window for modifiers, skill levels, learning
  by study or by doing, Education growth, skills granted by Sequences and abilities.
- **Pathways**: Sequences, abilities, actions and spells, and promotion (the potion check, its Sanity loss, the
  ritual, and losing control).
- **Combat**: attack rolls against a target's defenses (hit / miss on the card), damage with types and damage
  reduction, firearms (magazines, cylinders, barrels, reloading and special rounds), and Big Success / Big Failure.
- **Statuses**: Bound, Blind, Dying, Bleeding, Fear, Semi-Out-of-Control and the others, each with its rules:
  start-of-turn cards, checks to end them, and warnings before an action they stop.
- **Sanity, Luck and Spirituality**: Sanity checks and losses, Burning Luck to change a roll after the fact, and
  Spirituality costs on actions and spells.
- **Inventory**: gear, containers, worn armor and money.
- **Effects**: effects that actions and spells give to their targets, areas on the scene, and Spirit Vision.
- **Compendiums**: skills, Sequences, abilities, actions, spells and rituals, containers and gear, effects, roll
  tables, and the rules.

## Requirements

Foundry VTT version 14 (verified on 14.369).

## Installing

There's no release link yet, so the system is installed by hand:

1. Download or clone this repository into Foundry's `Data/systems/` folder, in a folder named `lotm` (the system's id
   in `system.json`; Foundry won't find it under another name).
2. Restart Foundry, then create a world with **Lord Of The Mysteries** as its game system.

To update, replace the folder's files with the new ones and reload the world. Restart Foundry instead when
`system.json` changed (a new compendium, document type or region behavior).

## Where things are

There's no build step: the files are loaded as they are, so edit them and reload the world.

| Folder | What's in it |
|---|---|
| `module/lotm.mjs` | The entry point: registers the data models, sheets, settings and hooks |
| `module/data/` | Data models: what each actor, item, effect and region behavior saves |
| `module/documents/` | The system's Actor, Item, ActiveEffect and Combat classes |
| `module/sheets/` | Actor and item sheets |
| `module/apps/` | Roll windows (skill, attribute, action, Sanity, promotion) and other dialogs |
| `module/helpers/` | Rules and chat cards: rolls, damage, firearms, Sanity, Luck, Spirituality, promotion, money, skills |
| `module/effects/` | Statuses (`effects/rules/` has one file per status) and effects given by actions and spells |
| `module/canvas/` | Spirit Vision and other things drawn on the scene |
| `module/macros/` | Maintenance macros for the GM (see `tests/MANUAL_QA.md`) |
| `templates/` | Handlebars templates: sheets, roll windows, chat cards (`chat/`) and dialogs (`dialogs/`) |
| `css/` | Styles |
| `lang/en.json` | All the text the system shows |
| `packs/` | Compendiums |
| `tests/` | Unit tests, and the manual QA checklist |
| `docs/` | Notes on how some features work |

### Chat cards and dialogs

Chat cards and dialog contents are Handlebars templates in `templates/chat/` and `templates/dialogs/`, like the
sheets. A template escapes what it shows, so names typed by players can't break a card. `module/helpers/render.mjs`
explains how to render one; a new template also goes in the `CARD_TEMPLATES` list in `module/helpers/templates.mjs`,
so it's loaded when the world starts.

### Text

Every piece of text is in `lang/en.json`. For a file that uses many keys from one section, `langSection` in
`module/helpers/lang.mjs` saves writing the section's name each time.

## Styles

The styles are plain CSS in `css/`, edited directly (no build step). `system.json` lists them under `styles`:
`lotm.css` has the shared basics (sheet headers and tabs, item lists, form fields); the others
are one file per part of the system (actor sheets, item sheets, drop sections, inventory, NPC sheet, roll dialogs,
effects).

## Tests

Unit tests check the rules that don't need Foundry running (skill formulas, status math, damage, money, chat card
text). They need [Node.js](https://nodejs.org) 22 or later. In the system's folder:

```bash
npm install   # once: installs Handlebars, which the chat card tests render their templates with
npm test
```

`tests/MANUAL_QA.md` is the checklist for what has to be checked by hand in Foundry: sheets, dialogs, chat cards,
tokens and scenes.

## License

See `LICENSE.txt`. The system started from Asacolips' Foundry system template (MIT).
