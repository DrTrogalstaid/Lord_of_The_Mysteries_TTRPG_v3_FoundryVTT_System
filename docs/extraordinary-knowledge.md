# Extraordinary Knowledge — design notes

The Reader's Sequence 9 ability. Source: the original (translated) rules document,
plus the trimmed version in the Abilities compendium (`Compendium.lotm.ability_compendium.Item.9jOvKZDHVHAsyX5E`).

## What's implemented

Built on DrTrog's suggestion: the ability *holds* the skills it grants, instead of the system
special-casing Extraordinary Knowledge.

- **Any ability can grant skills.** Its Details tab has a **Grants Skills** checkbox, a
  **Skill Options** list (drag skills from a compendium onto it), and an **analyze** checkbox.
  Extraordinary Knowledge has both ticked, with the 21 Knowledge skills (Skills compendium,
  folder *Extraordinary Knowledge*) as its options.
- **Each skill-granting ability gets its own skill tab** on the character sheet. There the
  player adds skills from the dropdown or types a custom one with any attribute (e.g. Reading
  Knowledge, Space Knowledge).
- **Each granted skill** has a level, a roll modifier and an **Analyses** counter (+ button).
  The GM decides when the count earns the next level and changes it by hand.
- **Analyze button on regular skills** (when the character has an analyze ability):
  - *Non-Education skill* (e.g. Stealth): the first analysis adds an Education copy of it to
    the ability's tab ("Education + Knowledge replaces attribute + skill"); later analyses raise
    that copy's count. The regular skill is untouched.
  - *Education skill* (e.g. History): the count goes on the skill itself, in the Education tab,
    since it can be trained directly through analysis. It isn't copied.
- **Granted skills' progress lives on the character's copy of the ability**
  (`system.grantedSkills`), so it goes with the ability if stolen and is lost if it's removed.
  Education skills' analysis counts live on the character (`system.skills.edu[].analysis`).
- Everything rolls like a normal skill. Nothing substitutes for other skills automatically.

## Open items — need to be addressed

### 1. Reading Knowledge (on hold)
The Reader's own pathway. Not in the compendium; a player can add it as a custom skill for now. Per the original text it differs from
the other Knowledges: its bonus comes from the character's Sequence (Seq 9 = +1 … Seq 0 = +10),
it should only be used in special cases, and a Reader simulating *another* pathway's ability
should use that pathway's Knowledge instead.

### 2. Space Knowledge (on hold)
A catch-all in the original text for further pathways "if they exist and are known". Not in
the compendium; can be added as a custom skill.

### 3. Skill replacement (the ability's Special rule) — not implemented
Partly sidestepped by granted skills: players add the skills they're actually learning
(dropdown or custom) instead of the system deciding what replaces what.
The original lets Education + a Knowledge replace specific skills; skills in parentheses are
*hidden* and can only be replaced after the character has analyzed a relevant ability from
that pathway. The GM can also approve replacements for related skills that aren't listed.
We decided not to build this into rolls for now; the mapping is kept here for reference.
The terms in quotes are from the translation; ⚠ marks matches that still need deciding
(candidates from the repo's skills are listed).

| Knowledge | Replaces | Hidden (needs an analyzed ability) |
|---|---|---|
| Divination | Occultism (divination-related only) | Disguise, Archeology, History |
| Apprentice | Locksmith | ⚠ "Pilot": Driving / Navigate / Heavy Machinery |
| Stealing | Slight of Hand | ⚠ "Cheat": Deception / Disguise / Speech |
| Writing | Writing, Psychology | Psychotherapy ("Psychoanalysis") |
| Sailor | Swim, Singing | |
| Sun | Singing | Religion |
| Flesh | Listening, Intimidate | |
| Reading | Library Use | Reconnaissance ("Scout"), Tracking |
| Death | Survival | ⚠ "Pilot": Driving / Navigate / Heavy Machinery |
| Night | Stealth | |
| Combat | Special: +1 level to fighting, shooting and Throwing skills the character already has | |
| Law | Persuasion, Deception, Law | |
| Judgment | Law | ⚠ "Credit": Reputation (likely — its description matches) |
| Hunting | Survival, Tracking, Craft Manufacturing (traps only) | |
| Witchcraft | ⚠ "Pleasure": Charm (likely); ⚠ "Fast Talk": Speech (likely) / Deception; Stealth | |
| Abyss | All fighting + shooting skills, "criminal skills" — only at Trained level | |
| Prisoner | Same as Abyss | |
| Moon | Chemistry, Pharmacy | Beast Taming |
| Earth | Biology | Medicine |
| Destiny | Reconnaissance ("Scouting") | |
| Secrets | Occultism | ⚠ "(Combat)": unclear — fighting skills / Dodge? |
| Artisan | Craft Manufacturing, Mechanical Maintenance | Archeology, History |

Skill groups referenced above, as they exist in the compendium today:
- **Fighting** (category `fighting`): Melee, Sword, Pole Weapon, Giant Weapon, Special
- **Shooting**: Pistol, Rifle, Shotgun (`firearms`); Bow, Crossbow (`arrow`); Gunnery (no category)
- **Throwing**: no category
- **"Criminal skills"**: no such group exists — candidates: Locksmith, Slight of Hand, Stealth,
  Disguise, Deception

### 4. Leveling rules
The original text gives a flat +1 level per source, up to 6 levels (+8) per Knowledge:
① reading the pathway's Sequence 3/6/9 potion formulas, ② seeing the pathway fight,
③ fighting it, ④ experiencing an event dominated by it, ⑤ knowing its Beyonder characteristics
across 4+ sequences, ⑥ analyzing a Beyonder's blood, ⑦ directly analyzing a Beyonder,
characteristic or item (+1 each; doesn't stack with ②③⑥ for the same subject).
Current house rule: analyses are counted and the GM judges when they earn a level, with each
step needing more than the last. Still to decide: exact thresholds (if any), and whether
sources ①–⑥ count as analyses or as flat levels.

Also from the original: above Sequence 9, a Reader may spend potion attribute points on
Knowledge levels. Not automated.

### 5. Reminder when an ability is witnessed
Wanted: a prompt to the Reader's player when they witness a new Beyonder ability so they
remember to analyze it. Needs abilities to post to chat first (they can't yet); then the chat
card could show an "Analyze" button.

### 6. Pathway naming
The ability's "Secret Peer" (Secrets Knowledge, "Prying Knowledge" in the Special list) is the
Mystery Pryer pathway — **not** the repo's "Secrets Suppliant" sequence, which belongs to the
Hanged Man pathway (Flesh Knowledge).
