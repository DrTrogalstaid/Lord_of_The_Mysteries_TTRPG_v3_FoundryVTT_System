/**
 * The system's Roll class (registered first in CONFIG.Dice.rolls in lotm.mjs). Every check, attack and damage roll
 * uses it. It changes how a roll shows in chat:
 *   - getTooltip(): the breakdown also lists flat modifiers ("STR  3"), not only dice, with penalties shown negative.
 *   - cleanFormula: "1d20 + 5[STR]" shows as "1d20 + STR". Every modifier is tagged N[Label]
 *     (helpers/skill-check-formula.mjs builds them that way).
 * Keep the class name: chat messages save the class name of their rolls, so renaming it would break older messages.
 */
export default class LOTM_VTTRoll extends Roll {
    /**
     * The collapsible breakdown on the chat card: one row per die, and one per flat modifier ("STR  3").
     * A term after a minus sign shows as negative ("Angry/Taunted  -4"), so penalties don't look like bonuses.
     */
    async getTooltip() {
        const parts = [];
        const { DiceTerm, NumericTerm, FunctionTerm, ParentheticalTerm, OperatorTerm } = foundry.dice.terms;
        const isA = (term, cls) => foundry.utils.isSubclass(term.constructor, cls);

        // -1 when the term just after it is subtracted ("- 4[Angry]"), otherwise 1.
        let sign = 1;
        const signed = (total) => (typeof total === "number" ? sign * total : total);

        for ( const term of this.terms ) {
            if ( isA(term, OperatorTerm) ) {
                // "+ -4" stays negative, "- -4" becomes positive; * and / don't change the sign.
                if ( term.operator === "-" ) sign = -sign;
                continue;
            }

            if ( isA(term, DiceTerm) ) {
                const data = term.getTooltipData();
                parts.push({ ...data, total: signed(data.total) });
            }
            else if ( isA(term, NumericTerm) ) {
                parts.push({
                    formula: term.flavor,
                    total: signed(term.total),
                    faces: null,
                    flavor: "",
                    rolls: []
                });
            }
            else if ( isA(term, FunctionTerm) || isA(term, ParentheticalTerm) ) {
                // Dice inside floor(...) or (...) get their own rows, like top-level dice (the 1d6).
                for ( const die of term.dice ?? [] ) {
                    parts.push(die.getTooltipData());
                }
                // Then one row for the result, labelled like the attack's STR row (e.g. "Half STR  1").
                parts.push({
                    formula: term.flavor || term.formula,
                    total: signed(term.total),
                    faces: null,
                    flavor: "",
                    rolls: []
                });
            }
            // The sign only applies to the term right after the operator.
            sign = 1;
        }

        return foundry.applications.handlebars.renderTemplate(this.constructor.TOOLTIP_TEMPLATE, { parts });
    }


    /* -------------------------------------------- */

    get cleanFormula() {
        // Replace flavor terms such as 5[STR] with just the flavor text
        let cleanFormula = this._formula;
        for ( const term of this.terms ) {
            if ( term.formula && term.flavor ) {
                cleanFormula = cleanFormula.replace(term.formula, term.flavor);
            }
        }

        // If there are still parts of the formula such as 5[STR] then replace them with just the flavor text
        const rgx = new RegExp(/(\d+)\[(.*?)\]/g);
        cleanFormula = cleanFormula.replace(rgx, "$2");

        return cleanFormula;
    }

    async _prepareChatRenderContext(options = {}) {
        const context = await super._prepareChatRenderContext(options);
        if ( !options.isPrivate ) context.formula = this.cleanFormula;
        return context;
    }

}
