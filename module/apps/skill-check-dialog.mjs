import LotmRollDialog, { ROLL_DIALOG_PARTIALS } from "./roll-dialog.mjs";
import { calculateSkillModifier } from "../helpers/skill-modifiers.mjs";
import { buildSkillCheckFormula, computeSkillCheckTotal, signedTerm } from "../helpers/skill-check-formula.mjs";
import { spiritualityCost } from "../helpers/spirituality.mjs";

/**
 * SkillCheckDialog
 * -----------------
 * Popup shown when a player clicks a skill's modifier on a sheet, or rolls an action that uses a skill.
 * Built on LotmRollDialog (roll-dialog.mjs), which gives it the modifiers list, the who-sees-it buttons,
 * the Spirituality checkbox and the Roll button. This class adds the skill part. It lets them:
 *   - see the skill's normal (compendium-defined) linked attribute
 *   - override it with ANY of the system's 8 attributes for this roll only,
 *     to cover the "a skill's related attribute can change based on how it's
 *     being used" house rule (e.g. rolling Performance with Inspiration
 *     instead of its default Charisma when the scene calls for it)
 *   - add any number of ad-hoc situational modifiers (label + value)
 *   - see the live total before committing
 *   - roll on submit
 *
 * The override is scoped to this one roll -- it never writes back to the
 * Skill item's own `system.skill_attribute` field, so the compendium
 * skill's default is untouched for every other character who has it.
 *
 * Untrained skills roll the same as any other (attribute total minus the
 * untrained penalty) unless the GM has turned off the "allowUntrainedSkillChecks"
 * world setting, in which case prompt() blocks the roll before the dialog
 * even opens and shows a warning instead.
 */
export default class SkillCheckDialog extends LotmRollDialog {
    /** @override */
    static DEFAULT_OPTIONS = {
        window: {
            title: "LORD_OF_THE_MYSTERIES.SkillCheck.Title"
        }
    };

    /** @override */
    static PARTS = {
        form: { template: "systems/lotm/templates/apps/skill-check-dialog.hbs", templates: ROLL_DIALOG_PARTIALS }
    };

    /**
     * @param {Actor} actor
     * @param {object} skillEntry
     * @param {string} skillEntry.uuid        UUID of the Skill item (compendium or world)
     * @param {string} skillEntry.name        Display name (avoids an extra fromUuid before render)
     * @param {string} skillEntry.category    The system.skills bucket this entry lives in (str/agi/cha/ins/edu/languages)
     * @param {string} skillEntry.level       Current proficiency level for this actor (untrained/trained/.../grandMaster)
     * @param {string} [skillEntry.attribute] The skill's default linked attribute key, if already known (avoids a fromUuid lookup)
     * @param {Item} [skillEntry.action]      The action item, when rolling an action (e.g. a revolver's "Shoot") with
     *                                        this skill. Opened through helpers/action-roll.mjs. The dialog uses its
     *                                        name (window title, chat card), system.attackRollMacro (rolled instead of
     *                                        the plain 1d20), system.modifiers (added as a removable modifier) and
     *                                        system.spiritualityCost (the Spirituality checkbox).
     * @param {object} [skillEntry.chat]      Extra things to put on the chat message:
     * @param {object} [skillEntry.chat.flags]   Message flags (actions save which action/character this was).
     * @param {string} [skillEntry.chat.footer]  HTML added after the flavor text (actions add the damage buttons).
     */
    constructor(actor, skillEntry, options = {}) {
        const action = skillEntry.action ?? null;
        super(actor, {
            // The action's own Modifiers field starts in the modifier list, labelled with the action's name,
            // so the player sees it in the breakdown and can remove it for this roll if it doesn't apply.
            modifiers: action ? [{ label: action.name, value: Number(action.system.modifiers) || 0 }] : [],
            spirituality: action ? { cost: spiritualityCost(action), reason: action.name } : null,
            chat: skillEntry.chat ?? {},
            ...options
        });
        this.skillEntry = skillEntry;
        this.action = action;
        this.defaultAttribute = skillEntry.attribute ?? skillEntry.category;
        this.attributeKey = this.defaultAttribute;
    }

    /**
     * Open the dialog and resolve with the evaluated Roll, or null if the
     * dialog was cancelled/closed without rolling, or if the roll was blocked
     * because it's an untrained skill and the GM has disallowed those (see
     * the "allowUntrainedSkillChecks" world setting, registered in lotm.mjs).
     * @param {Actor} actor
     * @param {object} skillEntry         See the constructor.
     * @param {object} [options]
     * @param {boolean} [options.fast]    Shift-click: roll right away with the defaults.
     * @returns {Promise<Roll|null>}
     */
    static async prompt(actor, skillEntry, { fast = false } = {}) {
        if (skillEntry.level === "untrained" && !game.settings.get("lotm", "allowUntrainedSkillChecks")) {
            ui.notifications.warn(
                game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.UntrainedBlocked", { skill: skillEntry.name })
            );
            return null;
        }
        return this.show(new this(actor, skillEntry), { fast });
    }

    /**
     * Window title: "Shoot (Pistol)" when rolling an action, the usual skill check title otherwise.
     * @override
     */
    get title() {
        if (this.action) return `${this.action.name} (${this.skillEntry.name})`;
        return super.title;
    }

    /**
     * The dice part of the roll: the action's own formula when it has a valid one, otherwise 1d20.
     * buildSkillCheckFormula puts this first and adds the attribute, skill level and modifiers after it,
     * so the action formula should hold the dice plus anything special to that action (e.g. "1d20 + 1"),
     * not the skill bonus. @-references (e.g. @attributes.str.total) use the actor's roll data.
     * @returns {{die: string, custom: boolean, invalid: boolean, formula: string}}
     *   die      What to roll.
     *   custom   True when that's the action's formula.
     *   invalid  The action has a formula, but it isn't a valid roll, so 1d20 is used instead.
     */
    #baseDie() {
        const DEFAULT = "1d20"; // adjust to whatever this system's actual base die turns out to be
        const formula = this.action?.system.attackRollMacro?.trim() ?? "";
        if (!formula || formula.toLowerCase() === "na") return { die: DEFAULT, custom: false, invalid: false, formula };
        if (!Roll.validate(formula)) return { die: DEFAULT, custom: false, invalid: true, formula };
        return { die: formula, custom: true, invalid: false, formula };
    }

    /** The skill's numbers for this roll. */
    #parts() {
        const levelBonus = calculateSkillModifier(this.skillEntry.level, 0);
        return {
            attrTotal: this.actor.system.attributes[this.attributeKey]?.total ?? 0,
            levelBonus,
            levelLabel: game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[this.skillEntry.level] ?? this.skillEntry.level),
            flatModifier: this.skillEntry.flatModifier ?? 0,
        };
    }

    /* -------------------------------------------- */
    /*  LotmRollDialog parts                         */
    /* -------------------------------------------- */

    /** @override */
    _prepareBodyContext() {
        const attributes = Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.attributes).map(([key, labelKey]) => ({
            key,
            label: game.i18n.localize(labelKey),
            total: this.actor.system.attributes[key]?.total ?? 0,
            selected: key === this.attributeKey,
            isDefault: key === this.defaultAttribute
        }));
        const { levelBonus, levelLabel, flatModifier } = this.#parts();
        const base = this.#baseDie();

        return {
            // Rolling an action: its name, and the dice it rolls before the skill bonuses below are added.
            actionName: this.action?.name ?? "",
            actionDice: base.die,
            actionFormulaInvalid: base.invalid,
            actionFormula: base.formula,
            skillName: this.skillEntry.name,
            levelLabel,
            levelBonus,
            flatModifier,
            attributes,
            attributeChanged: this.attributeKey !== this.defaultAttribute,
        };
    }

    /** @override */
    _totalLabel() {
        const { attrTotal, levelBonus, flatModifier } = this.#parts();
        return signedTerm(computeSkillCheckTotal({ attrTotal, levelBonus, flatModifier, modifiers: this.modifiers }));
    }

    /** @override */
    _formula() {
        const base = this.#baseDie();
        if (base.invalid) {
            ui.notifications.warn(game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.InvalidActionFormula", {
                action: this.action.name, formula: base.formula
            }));
        }
        const { attrTotal, levelBonus, levelLabel, flatModifier } = this.#parts();
        const attrAbbrKey = CONFIG.LORD_OF_THE_MYSTERIES.attributeAbbreviations[this.attributeKey];
        return buildSkillCheckFormula({
            baseDie: base.die, // 1d20, or the action's own formula (see #baseDie)
            attrAbbr: game.i18n.localize(attrAbbrKey).toUpperCase(),
            attrTotal,
            levelLabel,
            levelBonus,
            skillName: this.skillEntry.name,
            flatModifier,
            modifiers: this.modifiers
        });
    }

    /** @override */
    _flavor() {
        const attr = CONFIG.LORD_OF_THE_MYSTERIES.attributes[this.attributeKey];
        const attributeChanged = this.attributeKey !== this.defaultAttribute;
        const defaultAttrLabel = game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.attributes[this.defaultAttribute]);
        const checkFlavor = attributeChanged
            ? game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.FlavorOverride", {
                  skill: this.skillEntry.name,
                  attribute: game.i18n.localize(attr),
                  defaultAttribute: defaultAttrLabel
              })
            : game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.Flavor", {
                  skill: this.skillEntry.name,
                  attribute: game.i18n.localize(attr)
              });

        // Rolling an action: put its name in front, e.g. "Shoot: Pistol check (Agility)".
        return this.action
            ? game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.ActionFlavor", {
                  action: Handlebars.escapeExpression(this.action.name),
                  check: checkFlavor
              })
            : checkFlavor;
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);
        this.element.querySelector("select[name=attribute]")?.addEventListener("change", (ev) => {
            this.attributeKey = ev.target.value;
            this.render();
        });
    }
}
