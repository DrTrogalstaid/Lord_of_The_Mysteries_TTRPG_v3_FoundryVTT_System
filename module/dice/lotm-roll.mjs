/**
 * LOTM_VTTRoll
 * ------------
 * Moved here, unchanged, from LOTM_VTT/system/rolls/roll.mjs (the older ISDL-
 * generated prototype under a different system id, "LOTM_VTT" -- that folder
 * isn't loaded by the active system.json, so this class was previously dead
 * code). It's re-homed under the active `lotm` module tree and registered in
 * lotm.mjs so the skill-check dialog (module/apps/skill-check-dialog.mjs) can
 * use it.
 *
 * It adds three things standard Foundry `Roll` doesn't give you for free:
 *   - getTooltip() also picks up flat NumericTerms (e.g. the `5` in `5[STR]`)
 *     into the dice breakdown, not just actual dice.
 *   - cleanFormula strips a formula like `1d20 + 5[STR]` down to `1d20 + STR`
 *     for display -- this is the convention the skill-check dialog's formula
 *     builder relies on (every modifier term is tagged `N[Label]`).
 *   - Config-driven crit/fumble (`roll.options.crit` / `.fumble`, each an
 *     {op, value} threshold compared against the first die's natural face)
 *     and dice-pool helpers (successes/countDice/containsDie) for house rules
 *     that need them later. Nothing in this change sets crit/fumble/success
 *     options yet -- they're inert until something populates them.
 *
 * getTooltip() renders via `this.constructor.TOOLTIP_TEMPLATE`, which isn't
 * redefined here -- it resolves through static inheritance to Foundry's own
 * `Roll.TOOLTIP_TEMPLATE` ("templates/dice/tooltip.hbs"), so this works with
 * no extra template needed.
 */
export default class LOTM_VTTRoll extends Roll {
    async getTooltip() {
        const parts = [];

        for ( const term of this.terms ) {
            if ( foundry.utils.isSubclass(term.constructor, foundry.dice.terms.DiceTerm) ) {
                parts.push(term.getTooltipData());
            }
            else if ( foundry.utils.isSubclass(term.constructor, foundry.dice.terms.NumericTerm) ) {
                parts.push({
                    formula: term.flavor,
                    total: term.total,
                    faces: null,
                    flavor: "",
                    rolls: []
                });
            }
        }

        return renderTemplate(this.constructor.TOOLTIP_TEMPLATE, { parts });
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

    /* -------------------------------------------- */
    /*  Roll result inspection (crit / fumble / dice pools)         */
    /* -------------------------------------------- */

    // Apply a comparison operator string. A missing operator means equality.
    _cmp(a, op, b) {
        switch ( op ) {
            case "<":  return a <  b;
            case "<=": return a <= b;
            case ">":  return a >  b;
            case ">=": return a >= b;
            case "!=": return a != b;
            case "==":
            default:   return a == b;
        }
    }

    // The natural (unmodified) total of the first DiceTerm in the roll.
    get _firstDieTotal() {
        const die = this.dice[0];
        if ( !die ) return this.total;
        return die.results.filter(r => r.active).reduce((sum, r) => sum + r.result, 0);
    }

    // Evaluate a crit/fumble config: { op, value } against the first die's natural face.
    // Returns false when unconfigured.
    _evalCondition(cfg) {
        if ( !cfg ) return false;
        return this._cmp(this._firstDieTotal, cfg.op, cfg.value);
    }

    // crit/fumble may be set manually (e.g. for game-specific rules that a crit:/fumble:
    // threshold can't express). A manually-assigned value wins over the param evaluation;
    // ?? only falls through when no manual value has been set (undefined).
    get crit()   { return this._critForced ?? this._evalCondition(this.options.crit); }
    set crit(v)  { this._critForced = v; }
    get fumble()  { return this._fumbleForced ?? this._evalCondition(this.options.fumble); }
    set fumble(v) { this._fumbleForced = v; }

    // Every standing face result across all DiceTerms in the roll. Keeps faces dropped
    // by keep/drop modifiers (so 'any die shows a 1' works on Nd6kh1) but excludes the
    // pre-reroll value of a rerolled die.
    get _allResults() {
        return this.dice.flatMap(d => d.results.filter(r => !r.rerolled).map(r => r.result));
    }

    // ISDL `r.dice` maps to this getter -- Foundry's Roll#dice returns DiceTerm
    // objects, so the face-value array gets its own name to avoid clobbering it.
    get diceFaces() { return this._allResults; }

    get highest() { const r = this._allResults; return r.length ? Math.max(...r) : 0; }
    get lowest()  { const r = this._allResults; return r.length ? Math.min(...r) : 0; }

    // Success counting: faces matching success:, minus faces matching failure:.
    get successes() {
        const s = this.options.success;
        if ( !s ) return 0;
        const hits = this._allResults.filter(r => this._cmp(r, s.op, s.value)).length;
        const f = this.options.failure;
        const misses = f ? this._allResults.filter(r => this._cmp(r, f.op, f.value)).length : 0;
        return hits - misses;
    }

    // count(arg)/contains(arg): arg is a face value or a die predicate function.
    _predicate(arg) {
        return typeof arg === "function" ? arg : (r => r === arg);
    }
    countDice(arg)   { return this._allResults.filter(this._predicate(arg)).length; }
    containsDie(arg) { return this._allResults.some(this._predicate(arg)); }
}
