/**
 * Listener wiring the sheets and dialogs share, so each place says what should happen, not how to hook it up:
 *
 *   bindEach(root, selector, "change", handler)   a listener on every matching element, never added twice
 *   bindDropZone(zone, onDrop)                    a drop target: highlighted (.drag-over) while something is
 *                                                 dragged over it; onDrop(event) runs when something lands on it
 *   takeDrop(event)                               in an onDrop: claim the drop (the sheet's own drop handling
 *                                                 doesn't see it too) and look up the document it carries
 *
 * "Never added twice": Foundry redraws a sheet one part at a time, so an element that wasn't redrawn would get a
 * second listener on the next render. Each helper marks the element (data-lotm-bound) and skips marked ones.
 */

/** Marks an element whose listeners are already on (dataset.lotmBound = data-lotm-bound). */
const BOUND = "lotmBound";

/**
 * Mark an element as wired up. False when it already was.
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function markBound(element) {
  if (element.dataset[BOUND]) return false;
  element.dataset[BOUND] = "1";
  return true;
}


/**
 * A listener on every element under `root` that matches `selector`, skipping elements that already have it.
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {string} type                     The event, e.g. "change" or "toggle".
 * @param {(event: Event, element: HTMLElement) => any} handler
 */
export function bindEach(root, selector, type, handler) {
  for (const element of root?.querySelectorAll(selector) ?? []) {
    if (!markBound(element)) continue;
    element.addEventListener(type, (event) => handler(event, element));
  }
}


/**
 * Make an element a drop target. While something is dragged over it, it has the "drag-over" class (the dashed
 * highlight in the stylesheets).
 * @param {HTMLElement} zone
 * @param {(event: DragEvent) => any} [onDrop]   What a drop does. Leave it out when the sheet's own drop handling
 *                                               (_onDropDocument) takes the drop and the zone is only highlighted.
 */
export function bindDropZone(zone, onDrop = null) {
  if (!zone || !markBound(zone)) return;
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();   // without this the browser never fires "drop"
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", (event) => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (event) => {
    zone.classList.remove("drag-over");
    return onDrop?.(event);
  });
}


/**
 * Claim a drop for the zone it landed on, and look up what was dropped.
 * The sheet's own drop handling doesn't see it after this, so call it only once the zone is taking the drop.
 * @param {DragEvent} event
 * @returns {Promise<{data: object|null, doc: foundry.abstract.Document|null}>}
 *   data: the drag data ({type, uuid, ...}); doc: the document at data.uuid, or null when there's none or it's gone.
 */
export async function takeDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event) ?? null;
  const doc = data?.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
  return { data, doc };
}
