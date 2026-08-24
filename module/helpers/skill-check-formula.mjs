/**
 * Pure formula/total math for SkillCheckDialog, pulled out of the class so it
 * can be unit tested without the Foundry runtime (ApplicationV2 needs
 * `foundry`/`game`/DOM globals that don't exist under plain Node, but none of
 * this arithmetic or string-building does).
 */

/** Format a number with an explicit leading sign, e.g. 3 -> "+3", -2 -> "-2", 0 -> "+0". */
export function signedTerm(n) {
    return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Build the `N[Label]` formula LOTM_VTTRoll's getTooltip()/cleanFormula expect.
 * @param {object} params
 * @param {string} params.baseDie      e.g. "1d20"
 * @param {string} params.attrAbbr     Localized attribute abbreviation, e.g. "CHA"
 * @param {number} params.attrTotal
 * @param {string} params.levelLabel   Localized proficiency level label, e.g. "Trained"
 * @param {number} params.levelBonus
 * @param {string} params.skillName    Used as the flavor label for a nonzero flatModifier term
 * @param {number} [params.flatModifier=0]  The skill item's own flat system.modifier; omitted from the formula when 0
 * @param {{label: string, value: number}[]} [params.modifiers=[]]  Ad-hoc modifiers added in the dialog
 * @returns {string}
 */
export function buildSkillCheckFormula({
    baseDie,
    attrAbbr,
    attrTotal,
    levelLabel,
    levelBonus,
    skillName,
    flatModifier = 0,
    modifiers = []
}) {
    const terms = [
        baseDie,
        `${signedTerm(attrTotal)}[${attrAbbr}]`,
        `${signedTerm(levelBonus)}[${levelLabel}]`,
        ...(flatModifier ? [`${signedTerm(flatModifier)}[${skillName}]`] : []),
        ...modifiers.map((m) => `${signedTerm(m.value)}[${m.label}]`)
    ];
    return terms.join(" ");
}

/**
 * The live total shown on the dialog's Roll button -- must stay in sync with
 * what buildSkillCheckFormula() above actually rolls.
 * @param {object} params
 * @param {number} params.attrTotal
 * @param {number} params.levelBonus
 * @param {number} [params.flatModifier=0]
 * @param {{value: number}[]} [params.modifiers=[]]
 * @returns {number}
 */
export function computeSkillCheckTotal({ attrTotal, levelBonus, flatModifier = 0, modifiers = [] }) {
    const modTotal = modifiers.reduce((sum, m) => sum + m.value, 0);
    return attrTotal + levelBonus + flatModifier + modTotal;
}
