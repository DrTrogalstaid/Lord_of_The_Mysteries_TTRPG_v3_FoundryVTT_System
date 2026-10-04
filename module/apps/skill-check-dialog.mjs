import LOTM_VTTRoll from "../dice/lotm-roll.mjs";
import { calculateSkillModifier } from "../helpers/skill-modifiers.mjs";
import { buildSkillCheckFormula, computeSkillCheckTotal } from "../helpers/skill-check-formula.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

/**
 * SkillCheckDialog
 * -----------------
 * Popup shown when a player clicks a skill's modifier on the character sheet.
 * Lets them:
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
export default class SkillCheckDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["lotm", "skill-check-dialog"],
        window: {
            title: "LORD_OF_THE_MYSTERIES.SkillCheck.Title",
            icon: "fa-solid fa-dice-d20",
            resizable: false
        },
        position: { width: 380, height: "auto" },
        form: {
            handler: SkillCheckDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        },
        actions: {
            addModifier: SkillCheckDialog.#onAddModifier,
            removeModifier: SkillCheckDialog.#onRemoveModifier
        }
    };

    static PARTS = {
        form: { template: "systems/lotm/templates/apps/skill-check-dialog.hbs" }
    };

    /**
     * @param {Actor} actor
     * @param {object} skillEntry
     * @param {string} skillEntry.uuid        UUID of the Skill item (compendium or world)
     * @param {string} skillEntry.name        Display name (avoids an extra fromUuid before render)
     * @param {string} skillEntry.category    The system.skills bucket this entry lives in (str/agi/cha/ins/edu/languages)
     * @param {string} skillEntry.level       Current proficiency level for this actor (untrained/trained/.../grandMaster)
     * @param {string} [skillEntry.attribute] The skill's default linked attribute key, if already known (avoids a fromUuid lookup)
     */
    constructor(actor, skillEntry, options = {}) {
        super(options);
        this.actor = actor;
        this.skillEntry = skillEntry;
        this.defaultAttribute = skillEntry.attribute ?? skillEntry.category;
        this.attributeKey = this.defaultAttribute;
        this.modifiers = []; // { id, label, value }
        this.submitted = false;
        this.resolve = null;
    }

    /**
     * Open the dialog and resolve with the evaluated Roll, or null if the
     * dialog was cancelled/closed without rolling, or if the roll was blocked
     * because it's an untrained skill and the GM has disallowed those (see
     * the "allowUntrainedSkillChecks" world setting, registered in lotm.mjs).
     * @returns {Promise<Roll|null>}
     */
    static async prompt(actor, skillEntry) {
        if (skillEntry.level === "untrained" && !game.settings.get("lotm", "allowUntrainedSkillChecks")) {
            ui.notifications.warn(
                game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.UntrainedBlocked", { skill: skillEntry.name })
            );
            return null;
        }

        return new Promise((resolve) => {
            const app = new this(actor, skillEntry);
            app.resolve = resolve;
            app.addEventListener(
                "close",
                () => {
                    if (!app.submitted) resolve(null);
                },
                { once: true }
            );
            app.render(true);
        });
    }

    /* -------------------------------------------- */
    /*  Context / rendering                          */
    /* -------------------------------------------- */

    async _prepareContext() {
        const attributes = Object.entries(CONFIG.LORD_OF_THE_MYSTERIES.attributes).map(([key, labelKey]) => ({
            key,
            label: game.i18n.localize(labelKey),
            total: this.actor.system.attributes[key]?.total ?? 0,
            selected: key === this.attributeKey,
            isDefault: key === this.defaultAttribute
        }));

        const levelBonus = calculateSkillModifier(this.skillEntry.level, 0);
        const flatModifier = this.skillEntry.flatModifier ?? 0;

        return {
            skillName: this.skillEntry.name,
            levelLabel: game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[this.skillEntry.level] ?? this.skillEntry.level),
            levelBonus,
            flatModifier,
            attributes,
            attributeChanged: this.attributeKey !== this.defaultAttribute,
            modifiers: this.modifiers,
            total: computeSkillCheckTotal({
                attrTotal: this.actor.system.attributes[this.attributeKey]?.total ?? 0,
                levelBonus,
                flatModifier,
                modifiers: this.modifiers
            })
        };
    }

    _onRender(context, options) {
        this.element.querySelector("select[name=attribute]")?.addEventListener("change", (ev) => {
            this.attributeKey = ev.target.value;
            this.render();
        });

        this.element.querySelector(".mod-value")?.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                SkillCheckDialog.#onAddModifier.call(this, ev, ev.currentTarget);
            }
        });
    }

    /* -------------------------------------------- */
    /*  Actions                                      */
    /* -------------------------------------------- */

    static #onAddModifier(event, target) {
        const form = this.element;
        const nameInput = form.querySelector(".mod-name");
        const valueInput = form.querySelector(".mod-value");
        const value = Number(valueInput.value);

        if (!value || Number.isNaN(value)) {
            ui.notifications.warn(game.i18n.localize("LORD_OF_THE_MYSTERIES.SkillCheck.InvalidModifier"));
            return;
        }

        this.modifiers.push({
            id: foundry.utils.randomID(),
            label: nameInput.value.trim() || (value > 0 ? "Bonus" : "Penalty"),
            value
        });

        nameInput.value = "";
        valueInput.value = "";
        this.render();
    }

    static #onRemoveModifier(event, target) {
        const id = target.dataset.modifierId;
        this.modifiers = this.modifiers.filter((m) => m.id !== id);
        this.render();
    }

    static async #onSubmit(event, form, formData) {
        this.submitted = true;

        const attr = CONFIG.LORD_OF_THE_MYSTERIES.attributes[this.attributeKey];
        const attrAbbrKey = CONFIG.LORD_OF_THE_MYSTERIES.attributeAbbreviations[this.attributeKey];
        const attrAbbr = game.i18n.localize(attrAbbrKey).toUpperCase();
        const attrTotal = this.actor.system.attributes[this.attributeKey]?.total ?? 0;
        const levelBonus = calculateSkillModifier(this.skillEntry.level, 0);
        const levelLabel = game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.skillLevels[this.skillEntry.level] ?? this.skillEntry.level);
        const flatModifier = this.skillEntry.flatModifier ?? 0;

        const formula = buildSkillCheckFormula({
            baseDie: "1d20", // adjust to whatever this system's actual base die turns out to be
            attrAbbr,
            attrTotal,
            levelLabel,
            levelBonus,
            skillName: this.skillEntry.name,
            flatModifier,
            modifiers: this.modifiers
        });

        const roll = new LOTM_VTTRoll(formula, this.actor.getRollData());
        await roll.evaluate();

        const attributeChanged = this.attributeKey !== this.defaultAttribute;
        const defaultAttrLabel = game.i18n.localize(CONFIG.LORD_OF_THE_MYSTERIES.attributes[this.defaultAttribute]);
        const flavor = attributeChanged
            ? game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.FlavorOverride", {
                  skill: this.skillEntry.name,
                  attribute: game.i18n.localize(attr),
                  defaultAttribute: defaultAttrLabel
              })
            : game.i18n.format("LORD_OF_THE_MYSTERIES.SkillCheck.Flavor", {
                  skill: this.skillEntry.name,
                  attribute: game.i18n.localize(attr)
              });

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor,
            rollMode: game.settings.get("core", "rollMode")
        });

        this.resolve(roll);
    }

    async close(options) {
        if (!this.submitted) this.resolve?.(null);
        return super.close(options);
    }
}
