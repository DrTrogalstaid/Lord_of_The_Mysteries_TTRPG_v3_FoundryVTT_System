import { test } from "node:test";
import assert from "node:assert/strict";
import { bindDropZone, bindEach, takeDrop } from "../module/helpers/listeners.mjs";

/** Just enough of a DOM element: listeners, dataset, classList, contains, querySelectorAll. */
class FakeElement {
  constructor(children = []) {
    this.listeners = {};
    this.dataset = {};
    this.classes = new Set();
    this.children = children;
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
    };
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  fire(type, event = {}) { return (this.listeners[type] ?? []).map((fn) => fn(event)); }
  contains(other) { return other === this || this.children.includes(other); }
  querySelectorAll() { return this.children; }
}

function fakeEvent(extra = {}) {
  return {
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    ...extra,
  };
}

test("bindEach: one listener per element, however many times the sheet renders", () => {
  const a = new FakeElement();
  const b = new FakeElement();
  const root = new FakeElement([a, b]);
  const seen = [];
  bindEach(root, "[x]", "change", (event, element) => seen.push(element));
  bindEach(root, "[x]", "change", (event, element) => seen.push(element));   // a second render
  a.fire("change");
  b.fire("change");
  assert.deepEqual(seen, [a, b]);
});

test("bindDropZone: highlighted while dragged over, cleared on leave and on drop; onDrop runs once", () => {
  const inner = new FakeElement();
  const zone = new FakeElement([inner]);
  let drops = 0;
  bindDropZone(zone, () => drops++);
  bindDropZone(zone, () => drops++);   // not bound twice

  const over = fakeEvent();
  zone.fire("dragover", over);
  assert.equal(over.prevented, true, "dragover allows the drop");
  assert.ok(zone.classes.has("drag-over"));

  zone.fire("dragleave", fakeEvent({ relatedTarget: inner }));
  assert.ok(zone.classes.has("drag-over"), "moving onto a child keeps the highlight");
  zone.fire("dragleave", fakeEvent({ relatedTarget: null }));
  assert.ok(!zone.classes.has("drag-over"), "leaving the zone clears it");

  zone.fire("dragover", fakeEvent());
  zone.fire("drop", fakeEvent());
  assert.ok(!zone.classes.has("drag-over"), "a drop clears it");
  assert.equal(drops, 1);
});

test("bindDropZone without onDrop only highlights: the drop is left for the sheet", () => {
  const zone = new FakeElement();
  bindDropZone(zone);
  const drop = fakeEvent();
  zone.fire("dragover", fakeEvent());
  zone.fire("drop", drop);
  assert.equal(drop.prevented, false);
  assert.equal(drop.stopped, false);
  assert.ok(!zone.classes.has("drag-over"));
});

test("takeDrop claims the drop and looks up what was dropped", async () => {
  const docs = { "Item.abc": { name: "Pistol" } };
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: { getDragEventData: (event) => event.data } } } } };
  globalThis.fromUuid = async (uuid) => {
    if (!(uuid in docs)) throw new Error("bad uuid");
    return docs[uuid];
  };

  const event = fakeEvent({ data: { type: "Item", uuid: "Item.abc" } });
  const { data, doc } = await takeDrop(event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(data.type, "Item");
  assert.equal(doc.name, "Pistol");

  assert.equal((await takeDrop(fakeEvent({ data: { type: "Item", uuid: "Item.gone" } }))).doc, null, "gone: null, no error");
  assert.equal((await takeDrop(fakeEvent({ data: { type: "Item" } }))).doc, null, "no uuid: null");
});
