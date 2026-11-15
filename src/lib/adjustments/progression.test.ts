// Progression outcomes in the feed: one line for an ordinary workout, an entry of its
// own for a stage change, a reset, a hold and a T3 increase.
import { describe, expect, it } from "vitest";
import { isRuleId } from "@/lib/evidence";
import { applyChange, rebuildDerived } from "@/lib/rebuild";
import { FAIL, PARTIAL, runSession, startSim } from "@/lib/rebuild/testHelpers";
import { workoutDetailHref } from "@/lib/routes";
import { progressionEntries } from "./progression";
import { feedInput } from "./testHelpers";

const entriesOf = (...args: Parameters<typeof progressionEntries>) =>
  progressionEntries(...args).map((ranked) => ranked.entry);

describe("progressionEntries", () => {
  it("an ordinary workout is one entry, not one per lift", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1" });
    const entries = entriesOf(feedInput(sim));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: `progression:${workout.id}`,
      source: "progression",
      at: workout.completedAt,
      title: "Squat day: all three lifts passed",
      ruleId: "gzclp-progression",
      href: workoutDetailHref(workout.id),
    });
    // The lines are the ones the workout page shows ("What it did").
    expect(entries[0].detail).toBe(
      "Squat passed: next 200 lbs 5×3. Bench press passed: next 105 lbs 3×10. " +
        "Lat pulldown stays at 90 lbs (last set 15 of 25 reps)."
    );
    expect(entries[0].undo).toBeUndefined();
  });

  it("names the day after its heavy lift", () => {
    const sim = startSim();
    for (let i = 0; i < 4; i++) runSession(sim);
    const titles = entriesOf(feedInput(sim)).map((entry) => entry.title);
    expect(titles).toEqual([
      "Squat day: all three lifts passed",
      "Overhead press day: all three lifts passed",
      "Bench day: all three lifts passed",
      "Deadlift day: all three lifts passed",
    ]);
  });

  it("a stage change gets its own entry, and the rest of the day is still one line", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1", t1: FAIL });
    const entries = entriesOf(feedInput(sim));

    expect(entries.map((entry) => entry.id)).toEqual([
      `progression:${workout.id}`,
      `progression:${workout.id}:squat:T1`,
    ]);
    expect(entries[0].title).toBe("Squat day: bench passed");
    expect(entries[1]).toMatchObject({
      title: "Squat 5×3 → 6×2 at 190",
      detail: "You missed reps on one set at 5×3. The weight stays and the scheme changes.",
      change: { from: "5×3", to: "6×2" },
      ruleId: "gzclp-progression",
      href: workoutDetailHref(workout.id),
    });
  });

  it("counts the sets that missed", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", t1: { reps: [3, 3, 3, 2], lastReps: 1 } });
    const stage = entriesOf(feedInput(sim)).find((entry) => entry.id.endsWith(":squat:T1"))!;
    expect(stage.detail).toBe(
      "You missed reps on two sets at 5×3. The weight stays and the scheme changes."
    );
  });

  it("a reset says where the lift starts again", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    runSession(sim, { templateId: "A1", t1: FAIL });
    runSession(sim, { templateId: "A1", t1: FAIL });
    const reset = runSession(sim, { templateId: "A1", t1: FAIL });
    const entry = entriesOf(feedInput(sim)).find(
      (candidate) => candidate.id === `progression:${reset.id}:squat:T1`
    )!;

    expect(entry.title).toBe("Squat reset 200 at 10×1 → 170 at 5×3");
    expect(entry.change).toEqual({ from: "200 at 10×1", to: "170 at 5×3" });
    expect(entry.detail).toBe(
      "You missed reps on one set at 10×1. That was the last scheme, so the lift starts again at 5×3 with 85% of the weight."
    );
    expect(entry.ruleId).toBe("gzclp-progression");
  });

  it("a hold gets its own entry with the reason and the rule the outcome names", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1", t2: { drop: true } });
    const entry = entriesOf(feedInput(sim)).find(
      (candidate) => candidate.id === `progression:${workout.id}:bench:T2`
    )!;

    expect(entry.title).toBe("Bench press T2 held at 100");
    expect(entry.detail).toBe(
      "You took the lighter weight the app offered after a hard first set. " +
        "It counts as neither a pass nor a miss, so the weight and scheme stay."
    );
    expect(entry.ruleId).toBe("t2-autoregulation");
    expect(entry.change).toBeUndefined();
  });

  it("a set lightened after a run holds the lift", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1" });
    const sets = workout.sets.map((set) =>
      set.exerciseId === "squat" && set.setNumber === 2
        ? { ...set, status: "reduced_run_fatigue" as const }
        : set
    );
    const workouts = [{ ...workout, sets }];
    const rebuild = rebuildDerived({ workouts, adjustments: sim.adjustments, settings: sim.settings });
    const entry = entriesOf(feedInput(sim, { workouts, rebuild })).find((candidate) =>
      candidate.id.endsWith(":squat:T1")
    )!;

    expect(entry.title).toBe("Squat T1 held at 190");
    expect(entry.detail).toBe(
      "A set was lightened after a run. It counts as neither a pass nor a miss, so the weight and scheme stay."
    );
    expect(entry.ruleId).toBe("gzclp-progression");
  });

  it("a lift stopped part-way is held, with how far it got", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1", t2: PARTIAL });
    const entry = entriesOf(feedInput(sim)).find(
      (candidate) => candidate.id === `progression:${workout.id}:bench:T2`
    )!;

    expect(entry.title).toBe("Bench press T2 held at 100");
    expect(entry.detail).toBe(
      "You stopped after one set, before the lift was finished. " +
        "It counts as neither a pass nor a miss, so the weight and scheme stay."
    );
  });

  it("a T3 increase gets its own entry and cites the T3 rule", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1", t3: { lastReps: 26 } });
    const entries = entriesOf(feedInput(sim));
    const t3 = entries.find(
      (candidate) => candidate.id === `progression:${workout.id}:lat_pulldown:T3`
    )!;

    expect(t3.title).toBe("Lat pulldown 90 → 95");
    expect(t3.change).toEqual({ from: "90", to: "95" });
    expect(t3.detail).toBe("Your last set was 26 reps. At 25 or more the weight goes up.");
    expect(t3.ruleId).toBe("t3-progression");
    // The day's line still counts all three lifts and lists the two that passed.
    expect(entries[0].title).toBe("Squat day: all three lifts passed");
    expect(entries[0].detail).toBe(
      "Squat passed: next 200 lbs 5×3. Bench press passed: next 105 lbs 3×10."
    );
  });

  it("a lift that was not done is mentioned in the day's line, not given an entry", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", t2: { sets: 0 } });
    const entries = entriesOf(feedInput(sim));
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Squat day: squat passed");
    expect(entries[0].detail).toContain("Bench press not done: no change.");
  });

  it("a workout in which nothing passed and nothing changed has no entry", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", t1: { sets: 0 }, t2: { sets: 0 } });
    expect(entriesOf(feedInput(sim))).toEqual([]);
  });

  it("a lift done lighter than planned is only logged, and says so", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1" });
    const sets = workout.sets.map((set) =>
      set.exerciseId === "squat" ? { ...set, weight: 170 } : set
    );
    const workouts = [{ ...workout, sets }];
    const rebuild = rebuildDerived({ workouts, adjustments: sim.adjustments, settings: sim.settings });
    const entry = entriesOf(feedInput(sim, { workouts, rebuild })).find((candidate) =>
      candidate.id.endsWith(":squat:T1")
    )!;

    expect(entry.title).toBe("Squat T1 only logged, stays at 190");
    expect(entry.detail).toBe(
      "You lifted lighter than planned, so it was logged without moving the program. The weight and scheme stay."
    );
    expect(entry.ruleId).toBe("off-program-credit");
  });

  it("every rule id is a real rule, and no entry offers an undo", () => {
    const sim = startSim();
    for (let i = 0; i < 12; i++) {
      runSession(sim, {
        t1: i % 3 === 1 ? FAIL : {},
        t2: i % 4 === 2 ? PARTIAL : i % 5 === 3 ? { drop: true } : {},
        t3: i % 2 === 0 ? { lastReps: 25 } : {},
      });
    }
    const entries = entriesOf(feedInput(sim));
    expect(entries.length).toBeGreaterThan(12);
    for (const entry of entries) {
      expect(entry.ruleId && isRuleId(entry.ruleId), entry.title).toBe(true);
      expect(entry.undo).toBeUndefined();
      expect(entry.source).toBe("progression");
    }
  });

  it("when the title shows a change, it shows it as from → to", () => {
    const sim = startSim();
    for (let i = 0; i < 12; i++) {
      runSession(sim, { t1: i % 3 === 1 ? FAIL : {}, t3: i % 2 === 0 ? { lastReps: 25 } : {} });
    }
    const changed = entriesOf(feedInput(sim)).filter((entry) => entry.change);
    expect(changed.length).toBeGreaterThan(0);
    for (const entry of changed) {
      expect(entry.title).toContain(`${entry.change!.from} → ${entry.change!.to}`);
    }
  });

  it("a deleted or unfinished workout gives nothing", () => {
    const sim = startSim();
    const kept = runSession(sim);
    const gone = runSession(sim);
    const log = applyChange(
      { workouts: sim.workouts, adjustments: sim.adjustments },
      { kind: "deleteWorkout", workoutId: gone.id }
    );
    const rebuild = rebuildDerived({ ...log, settings: sim.settings });
    const entries = entriesOf(feedInput(sim, { workouts: log.workouts, rebuild }));
    expect(entries.map((entry) => entry.id)).toEqual([`progression:${kept.id}`]);
  });
});
