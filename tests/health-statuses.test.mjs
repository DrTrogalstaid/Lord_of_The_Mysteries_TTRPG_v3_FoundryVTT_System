import { test } from "node:test";
import assert from "node:assert/strict";
import { syncHealthStatuses, wantedHealthStatuses } from "../module/effects/health-statuses.mjs";

const base = { max: 12, physique: 4, isBeyonder: false };

test("full Health: no statuses", () => {
    const wanted = wantedHealthStatuses({ ...base, hp: 12 });
    assert.deepEqual([wanted.bloodbath, wanted.dying, wanted.dead], [false, false, false]);
});

test("Bloodbath below half the maximum, rounded up", () => {
    // 12 max: half is 6, so 6 is fine and 5 is Bloodbath.
    assert.equal(wantedHealthStatuses({ ...base, hp: 6 }).bloodbath, false);
    assert.equal(wantedHealthStatuses({ ...base, hp: 5 }).bloodbath, true);
    // 13 max: half rounded up is 7, so 6 is Bloodbath.
    assert.equal(wantedHealthStatuses({ ...base, max: 13, hp: 7 }).bloodbath, false);
    assert.equal(wantedHealthStatuses({ ...base, max: 13, hp: 6 }).bloodbath, true);
});

test("Dying at 0 or less, with Bloodbath still on", () => {
    const wanted = wantedHealthStatuses({ ...base, hp: 0 });
    assert.equal(wanted.dying, true);
    assert.equal(wanted.bloodbath, true);
    assert.equal(wanted.dead, false);
});

test("ordinary people die below minus Physique", () => {
    assert.equal(wantedHealthStatuses({ ...base, hp: -4 }).dead, false, "-4 is the death point itself");
    const dead = wantedHealthStatuses({ ...base, hp: -5 });
    assert.equal(dead.dead, true);
    assert.equal(dead.dying, false, "Dead replaces Dying");
    assert.equal(dead.deathPoint, -4);
});

test("Beyonders die below twice minus Physique", () => {
    const beyonder = { ...base, isBeyonder: true };
    assert.equal(wantedHealthStatuses({ ...beyonder, hp: -5 }).dead, false);
    assert.equal(wantedHealthStatuses({ ...beyonder, hp: -5 }).dying, true);
    assert.equal(wantedHealthStatuses({ ...beyonder, hp: -9 }).dead, true);
    assert.equal(wantedHealthStatuses({ ...beyonder, hp: -9 }).deathPoint, -8);
});

test("already Dead: Dying isn't added again", () => {
    assert.equal(wantedHealthStatuses({ ...base, hp: -1, isDead: true }).dying, false);
});

test("no maximum yet (a brand-new actor): no Bloodbath", () => {
    assert.equal(wantedHealthStatuses({ ...base, max: 0, hp: 0 }).bloodbath, false);
});

/** A stand-in actor: statuses, Health, and toggleStatusEffect recording what it was asked to do. */
function fakeActor({ hp, statuses = [] }) {
    const actor = {
        statuses: new Set(statuses),
        toggled: [],
        system: { resources: { hp: { value: hp, max: 12 } }, attributes: { phy: { total: 4 } }, isBeyonder: false },
        async toggleStatusEffect(id, { active }) {
            this.toggled.push(`${active ? "+" : "-"}${id}`);
            if (active) this.statuses.add(id); else this.statuses.delete(id);
        },
    };
    return actor;
}

test("syncHealthStatuses only changes what's different", async () => {
    const actor = fakeActor({ hp: 3, statuses: ["bloodbath"] });
    await syncHealthStatuses(actor);
    assert.deepEqual(actor.toggled, [], "already in Bloodbath, not Dying");

    actor.system.resources.hp.value = -1;
    await syncHealthStatuses(actor);
    assert.deepEqual(actor.toggled, ["+dying"]);

    actor.system.resources.hp.value = -6;
    await syncHealthStatuses(actor);
    assert.deepEqual(actor.toggled, ["+dying", "+dead", "-dying"], "Dead first, then Dying comes off");

    actor.system.resources.hp.value = 12;
    await syncHealthStatuses(actor);
    assert.deepEqual(actor.toggled.slice(3), ["-bloodbath"], "healed: Bloodbath off, Dead stays (the GM removes it)");
    assert.ok(actor.statuses.has("dead"));
});
