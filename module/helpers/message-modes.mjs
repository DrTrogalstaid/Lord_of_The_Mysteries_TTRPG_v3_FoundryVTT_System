/**
 * Who sees a roll: the four modes in the roll dialogs' toggle buttons, and posting a roll with one of them.
 *
 *   public  Everyone sees it, posted as the character.
 *   gm      Private GM roll: you and the GM.
 *   blind   Blind GM roll: only the GM (not even you).
 *   self    Only you.
 *
 * Foundry v14 calls these "message modes": the core "messageMode" setting (what the chat sidebar is set to),
 * CONFIG.ChatMessage.modes (their labels and icons), and roll.toMessage(data, { messageMode }).
 * The old names ("rollMode", CONFIG.Dice.rollModes, toMessage's rollMode option) are deprecated in v14 and
 * removed in v16, so nothing in the system uses them any more.
 */

/** The toggle buttons, left to right. */
export const MESSAGE_MODES = ["public", "gm", "blind", "self"];

/** The chat sidebar's mode right now ("public", "ic", "gm", "blind" or "self"). */
function sidebarMode() {
  return game.settings.get("core", "messageMode");
}

/**
 * The mode the roll dialogs start on: the chat sidebar's, as one of the four buttons.
 * The sidebar's in-character mode ("ic") counts as public: both post for everyone to see.
 * @returns {string}
 */
export function defaultMessageMode() {
  const mode = sidebarMode();
  if (mode === "ic") return "public";
  return MESSAGE_MODES.includes(mode) ? mode : "public";
}

/**
 * The four buttons for a roll dialog, with Foundry's own labels and icons (the same ones the chat sidebar uses).
 * @param {string} active  The mode that's selected.
 * @returns {{key: string, label: string, icon: string, active: boolean}[]}
 */
export function messageModeButtons(active) {
  const modes = CONFIG.ChatMessage.modes;
  return MESSAGE_MODES.map((key) => ({
    key,
    label: game.i18n.localize(modes[key]?.label ?? `LORD_OF_THE_MYSTERIES.RollDialog.Modes.${key}`),
    icon: modes[key]?.icon ?? "fa-solid fa-comment",
    active: key === active,
  }));
}

/**
 * Post a roll to chat, seen by whoever `mode` allows.
 * A public roll keeps the sidebar's own public choice (public or in-character), so it's posted as the
 * character the same way the sidebar would post it.
 * @param {Roll} roll           An evaluated roll.
 * @param {object} messageData  speaker, flavor, flags, ...
 * @param {string} [mode]       One of MESSAGE_MODES. Default: the chat sidebar's mode.
 * @returns {Promise<ChatMessage>}
 */
export function postRoll(roll, messageData, mode = defaultMessageMode()) {
  const messageMode = (mode === "public" && sidebarMode() === "ic") ? "ic" : mode;
  return roll.toMessage(messageData, { messageMode });
}
