// Changes made to a lift outside a workout: starting weights, a change by hand, a
// reduction after time off, an import. Undo only where another adjustment can cleanly
// restore the earlier value.
import { describe, expect, it } from "vitest";
import { isRuleId } from "@/lib/evidence";
import { rebuildDerived } from "@/lib/rebuild";
import { adjust, makeAdjustment, runSession, startSim, stateOf } from "@/lib/rebuild/testHelpers";
import { liftAdjustmentEntries, undoAdjustment } from "./liftAdjustments";
import { adjustFrom, feedInput } from "./testHelpers";

const MINUTE = 60_000;
const entriesOf = (...args: Parameters<typeof liftAdjustmentEntries>) =>
  liftAdjustmentEntries(...args).map((ranked) => ranked.entry);
const after = (date: Date | null, minutes = 1) => new Date(date!.getTime() + minutes * MINUTE);

describe("liftAdjustmentEntries", () => {
  it("starting weights set at one time are one entry, with no undo and no rule", () => {
    const sim = startSim();
    const entries = entriesOf(feedInput(sim));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: `liftAdjustment:start:${sim.adjustments[0].at.getTime()}`,
      source: "liftAdjustment",
      at: sim.adjustments[0].at,
      title: "Starting weights set",
      detail:
        "Heavy sets start at squat 190, bench 145, deadlift 220 and overhead press 85. " +
        "Every later change in this log builds on these.",
      href: "/progress",
    });
    expect(entries[0].undo).toBeUndefined();
    expect(entries[0].ruleId).toBeUndefined();
  });

  it("a change by hand shows the earlier and the new weight, cites nothing and can be undone", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1" });
    const adjustment = adjust(sim, "squat", { t1Weight: 150 }, after(first.completedAt));
    const entry = entriesOf(feedInput(sim)).find(
      (candidate) => candidate.id === `liftAdjustment:${adjustment.id}`
    )!;

    expect(entry).toMatchObject({
      source: "liftAdjustment",
      at: adjustment.at,
      title: "Squat T1 200 → 150",
      detail: "You set this yourself, outside a workout.",
      change: { from: "200", to: "150" },
      href: "/progress/lift/squat",
      undo: { kind: "liftAdjustment", adjustmentId: adjustment.id },
    });
    expect(entry.ruleId).toBeUndefined();
  });

  it("a reduction after time off cites the time-off rule and can be undone", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1" });
    const decay = adjustFrom(sim, "decay", "bench", { t2Weight: 95 }, after(first.completedAt));
    const entry = entriesOf(feedInput(sim)).find(
      (candidate) => candidate.id === `liftAdjustment:${decay.id}`
    )!;

    expect(entry.title).toBe("Bench press T2 105 → 95");
    expect(entry.detail).toBe("You took the lighter weight the app suggested after time off.");
    expect(entry.ruleId).toBe("time-off");
    expect(isRuleId(entry.ruleId!)).toBe(true);
    expect(entry.undo).toEqual({ kind: "liftAdjustment", adjustmentId: decay.id });
  });

  it("an import has no undo", () => {
    const sim = startSim();
    const row = adjustFrom(sim, "import", "squat", { t1Weight: 225 }, new Date("2026-01-03T00:00:00Z"));
    const entry = entriesOf(feedInput(sim)).find(
      (candidate) => candidate.id === `liftAdjustment:${row.id}`
    )!;
    expect(entry.title).toBe("Squat T1 190 → 225");
    expect(entry.detail).toBe("Brought in with imported data.");
    expect(entry.undo).toBeUndefined();
    expect(entry.ruleId).toBeUndefined();
  });

  it("the earlier value is the one in force when the change was made", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" }); // squat 190 → 200
    const second = runSession(sim, { templateId: "A1" }); // 200 → 210
    const adjustment = adjust(sim, "squat", { t1Weight: 180 }, after(second.completedAt));
    runSession(sim, { templateId: "A1" }); // 180 → 190
    const later = adjust(sim, "squat", { t1Weight: 205 }, after(sim.workouts[2].completedAt));
    const entries = entriesOf(feedInput(sim));

    expect(entries.find((e) => e.id === `liftAdjustment:${adjustment.id}`)!.title).toBe(
      "Squat T1 210 → 180"
    );
    expect(entries.find((e) => e.id === `liftAdjustment:${later.id}`)!.title).toBe(
      "Squat T1 190 → 205"
    );
  });

  it("the earlier value always equals a rebuild of the log up to that moment", () => {
    const sim = startSim();
    const made: ReturnType<typeof adjust>[] = [];
    for (let i = 0; i < 10; i++) {
      const workout = runSession(sim, i % 4 === 2 ? { t1: { lastReps: -1 } } : {});
      if (i % 3 === 0) {
        const lift = ["squat", "bench", "deadlift", "ohp"][i % 4];
        const current = stateOf(sim.states, lift).t1Weight;
        made.push(adjust(sim, lift, { t1Weight: current - 15 }, after(workout.completedAt)));
      }
    }
    const entries = entriesOf(feedInput(sim));

    expect(made).toHaveLength(4);
    for (const adjustment of made) {
      const upTo = rebuildDerived({
        workouts: sim.workouts.filter((w) => w.startedAt.getTime() < adjustment.at.getTime()),
        adjustments: sim.adjustments.filter((a) => a.at.getTime() < adjustment.at.getTime()),
        settings: sim.settings,
      });
      const earlier = stateOf(upTo.liftStates, adjustment.exerciseId).t1Weight;
      const entry = entries.find((e) => e.id === `liftAdjustment:${adjustment.id}`)!;
      expect(entry.change, entry.title).toEqual({
        from: String(earlier),
        to: String(adjustment.set.t1Weight),
      });
    }
  });

  it("a change of weight and scheme shows both", () => {
    const sim = startSim();
    const at = new Date("2026-01-03T00:00:00Z");
    const both = adjust(sim, "squat", { t1Weight: 170, t1Stage: "6x2" }, at);
    const scheme = adjust(sim, "bench", { t2Stage: "3x8" }, at);
    const t3 = adjust(sim, "lat_pulldown", { t3Weight: 100 }, at);
    const entries = entriesOf(feedInput(sim));

    const bothEntry = entries.find((e) => e.id === `liftAdjustment:${both.id}`)!;
    expect(bothEntry.title).toBe("Squat 190 at 5×3 → 170 at 6×2");
    expect(bothEntry.change).toEqual({ from: "190 at 5×3", to: "170 at 6×2" });

    const schemeEntry = entries.find((e) => e.id === `liftAdjustment:${scheme.id}`)!;
    expect(schemeEntry.title).toBe("Bench press 3×10 → 3×8 at 100");

    const t3Entry = entries.find((e) => e.id === `liftAdjustment:${t3.id}`)!;
    expect(t3Entry.title).toBe("Lat pulldown 90 → 100");
    expect(t3Entry.href).toBe("/exercises/lat_pulldown");
  });

  it("a change to more than one tier lists them", () => {
    const sim = startSim();
    const row = adjust(sim, "squat", { t1Weight: 180, t2Weight: 125 }, new Date("2026-01-03T00:00:00Z"));
    const entry = entriesOf(feedInput(sim)).find((e) => e.id === `liftAdjustment:${row.id}`)!;
    expect(entry.title).toBe("Squat weights changed");
    expect(entry.detail).toBe("T1 190 → 180, T2 135 → 125. You set this yourself, outside a workout.");
    expect(entry.change).toBeUndefined();
  });

  it("a change that sets the value it already had says so and offers no undo", () => {
    const sim = startSim();
    const row = adjust(sim, "squat", { t1Weight: 190 }, new Date("2026-01-03T00:00:00Z"));
    const entry = entriesOf(feedInput(sim)).find((e) => e.id === `liftAdjustment:${row.id}`)!;
    expect(entry.title).toBe("Squat T1 set to 190");
    expect(entry.change).toBeUndefined();
    expect(entry.undo).toBeUndefined();
  });

  it("offers no undo once the lift has been trained at that tier since", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1" });
    const adjustment = adjust(sim, "squat", { t1Weight: 150 }, after(first.completedAt));
    const benchT2 = adjust(sim, "bench", { t2Weight: 90 }, after(first.completedAt, 2));
    const ohp = adjust(sim, "ohp", { t1Weight: 80 }, after(first.completedAt, 3));
    runSession(sim, { templateId: "A1" }); // trains squat T1 and bench T2, not the press

    const entries = entriesOf(feedInput(sim));
    expect(entries.find((e) => e.id === `liftAdjustment:${adjustment.id}`)!.undo).toBeUndefined();
    expect(entries.find((e) => e.id === `liftAdjustment:${benchT2.id}`)!.undo).toBeUndefined();
    expect(entries.find((e) => e.id === `liftAdjustment:${ohp.id}`)!.undo).toEqual({
      kind: "liftAdjustment",
      adjustmentId: ohp.id,
    });
  });

  it("a change to the T1 weight can still be undone after the lift was trained at T2", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1" });
    const adjustment = adjust(sim, "bench", { t1Weight: 135 }, after(first.completedAt));
    runSession(sim, { templateId: "A1" }); // bench is the T2 lift here
    const entry = entriesOf(feedInput(sim)).find((e) => e.id === `liftAdjustment:${adjustment.id}`)!;
    expect(entry.undo).toEqual({ kind: "liftAdjustment", adjustmentId: adjustment.id });
  });

  it("offers no undo once a later change has set the same field", () => {
    const sim = startSim();
    const at = new Date("2026-01-03T00:00:00Z");
    const earlier = adjust(sim, "squat", { t1Weight: 150 }, at);
    const later = adjust(sim, "squat", { t1Weight: 160 }, after(at));
    const entries = entriesOf(feedInput(sim));
    expect(entries.find((e) => e.id === `liftAdjustment:${earlier.id}`)!.undo).toBeUndefined();
    expect(entries.find((e) => e.id === `liftAdjustment:${later.id}`)!.undo).toBeDefined();
  });

  it("ignores a deleted row", () => {
    const sim = startSim();
    const row = adjust(sim, "squat", { t1Weight: 150 }, new Date("2026-01-03T00:00:00Z"));
    row.deletedAt = 1_800_000_000_000;
    const entries = entriesOf(feedInput(sim));
    expect(entries.map((e) => e.id)).toEqual([`liftAdjustment:start:${sim.adjustments[0].at.getTime()}`]);
  });

  it("names a lift it does not know by its id", () => {
    const sim = startSim();
    const row = adjust(sim, "mystery_lift", { t3Weight: 20 }, new Date("2026-01-03T00:00:00Z"));
    const entry = entriesOf(feedInput(sim)).find((e) => e.id === `liftAdjustment:${row.id}`)!;
    expect(entry.title).toBe("mystery_lift set to 20");
    expect(entry.href).toBeUndefined();
  });
});

describe("undoAdjustment", () => {
  it("gives the adjustment that restores the earlier values, and the rebuild agrees", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1" });
    const beforeDecay = stateOf(rebuildDerived(feedRebuild(sim)).liftStates, "squat");
    const decay = adjustFrom(
      sim,
      "decay",
      "squat",
      { t1Weight: 180, t1Stage: "6x2" },
      after(first.completedAt)
    );

    const inverse = undoAdjustment(feedInput(sim), decay.id);
    expect(inverse).toEqual({
      exerciseId: "squat",
      source: "manual",
      set: { t1Weight: 200, t1Stage: "5x3" },
      note: "Undo of an earlier change",
    });

    // Recorded as a new adjustment, it puts the lift back exactly where it was.
    sim.adjustments.push(
      makeAdjustment("squat", inverse!.set, after(decay.at), {
        id: "undo-1",
        clientId: "undo-1",
        source: inverse!.source,
        note: inverse!.note,
      })
    );
    const restored = stateOf(rebuildDerived(feedRebuild(sim)).liftStates, "squat");
    expect(restored.t1Weight).toBe(beforeDecay.t1Weight);
    expect(restored.t1Stage).toBe(beforeDecay.t1Stage);

    // The undone change can no longer be undone; the undo itself can.
    const entries = liftAdjustmentEntries(feedInput(sim)).map((ranked) => ranked.entry);
    expect(entries.find((e) => e.id === `liftAdjustment:${decay.id}`)!.undo).toBeUndefined();
    const undoEntry = entries.find((e) => e.id === "liftAdjustment:undo-1")!;
    expect(undoEntry.title).toBe("Squat 180 at 6×2 → 200 at 5×3");
    expect(undoEntry.detail).toBe("You set this yourself, outside a workout. Undo of an earlier change.");
    expect(undoEntry.undo).toEqual({ kind: "liftAdjustment", adjustmentId: "undo-1" });
  });

  it("is null wherever the entry offers no undo", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1" });
    const trainedSince = adjust(sim, "squat", { t1Weight: 150 }, after(first.completedAt));
    const imported = adjustFrom(sim, "import", "ohp", { t1Weight: 95 }, after(first.completedAt, 2));
    runSession(sim, { templateId: "A1" });
    const input = feedInput(sim);

    expect(undoAdjustment(input, trainedSince.id)).toBeNull();
    expect(undoAdjustment(input, imported.id)).toBeNull();
    expect(undoAdjustment(input, sim.adjustments[0].id)).toBeNull(); // a starting weight
    expect(undoAdjustment(input, "no-such-id")).toBeNull();
  });
});

function feedRebuild(sim: ReturnType<typeof startSim>) {
  return { workouts: sim.workouts, adjustments: sim.adjustments, settings: sim.settings };
}
