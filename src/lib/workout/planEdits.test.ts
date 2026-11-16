import { describe, it, expect } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { PlanEdit } from "@/types";
import { buildWorkoutPlan } from "./buildPlan";
import {
  applyPlanEdits,
  heaviestWorkingSet,
  pinSnapshot,
  prescribedFor,
  snapshotOfPlan,
  snapshotOfSets,
  structuralEdits,
  workingTargetSets,
} from "./planEdits";
import { EQUIPMENT, makeSets, seedLiftStates } from "./testFixtures";
import type { WorkoutPlan } from "./types";

function plan(overrides: { location?: "gym" | "home"; includeWarmUps?: boolean } = {}): WorkoutPlan {
  return buildWorkoutPlan({
    template: WORKOUT_TEMPLATES.A1,
    liftStates: seedLiftStates(),
    location: overrides.location ?? "gym",
    equipment: EQUIPMENT,
    includeWarmUps: overrides.includeWarmUps ?? false,
    selectedAccessories: ["face_pulls"],
  });
}

const working = (p: WorkoutPlan) => p.filter((e) => !e.isWarmUp);
const ids = (p: WorkoutPlan) => working(p).map((e) => e.exerciseId);

describe("applyPlanEdits", () => {
  it("returns an equal plan, and never the same objects, when there are no edits", () => {
    const base = plan({ includeWarmUps: true });
    const result = applyPlanEdits(base, undefined);
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
    expect(result[0]).not.toBe(base[0]);
    expect(applyPlanEdits(base, [])).toEqual(base);
  });

  it("swaps an exercise in place, keeping the slot's tier and scheme", () => {
    const base = plan();
    const result = applyPlanEdits(base, [
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" },
    ]);
    expect(ids(result)).toEqual(["squat", "incline_db_press", "lat_pulldown", "face_pulls"]);
    const swapped = result[1];
    const original = base[1];
    expect(swapped.tier).toBe("T2");
    expect(swapped.targetSets).toBe(original.targetSets);
    expect(swapped.targetReps).toBe(original.targetReps);
    expect(swapped.substituteExerciseId).toBeUndefined();
    expect(swapped.originalWeight).toBeUndefined();
  });

  it("drops the warm-ups generated for a swapped or removed T1 lift", () => {
    const base = plan({ includeWarmUps: true });
    expect(base.some((e) => e.isWarmUp)).toBe(true);

    const swapped = applyPlanEdits(base, [
      { kind: "swap", exerciseId: "squat", tier: "T1", replacementId: "pendulum_squat" },
    ]);
    expect(swapped.some((e) => e.isWarmUp)).toBe(false);
    expect(ids(swapped)[0]).toBe("pendulum_squat");

    const removed = applyPlanEdits(base, [{ kind: "remove", exerciseId: "squat", tier: "T1" }]);
    expect(removed.some((e) => e.isWarmUp)).toBe(false);
    expect(ids(removed)).toEqual(["bench", "lat_pulldown", "face_pulls"]);
  });

  it("drops a home substitute when the exercise is swapped", () => {
    const base = plan({ location: "home" });
    const bench = base.find((e) => e.exerciseId === "bench")!;
    expect(bench.substituteExerciseId).toBeDefined();

    const result = applyPlanEdits(base, [
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "db_floor_press" },
    ]);
    const swapped = result.find((e) => e.exerciseId === "db_floor_press")!;
    expect(swapped.substituteExerciseId).toBeUndefined();
    expect(swapped.originalWeight).toBeUndefined();
  });

  it("adds an accessory entry and replaces one of the same exercise", () => {
    const result = applyPlanEdits(plan(), [
      { kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 12, weight: 20, isAMRAP: false },
      { kind: "add", exerciseId: "face_pulls", sets: 2, reps: 20, weight: 30, isAMRAP: true },
    ]);
    expect(ids(result)).toEqual(["squat", "bench", "lat_pulldown", "bicep_curls", "face_pulls"]);
    expect(result.find((e) => e.exerciseId === "bicep_curls")).toMatchObject({
      tier: "accessory",
      targetSets: 3,
      targetReps: 12,
      weight: 20,
      isAMRAP: false,
      completedSets: 0,
    });
    expect(result.find((e) => e.exerciseId === "face_pulls")).toMatchObject({
      targetSets: 2,
      targetReps: 20,
      weight: 30,
    });
  });

  it("changes sets and reps, and weight", () => {
    const result = applyPlanEdits(plan(), [
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 4, reps: 8 },
      { kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 },
    ]);
    expect(result[0]).toMatchObject({ targetSets: 4, targetReps: 8, weight: 150 });
  });

  it("scales the program weight a home substitute stands for when its weight changes", () => {
    const base = plan({ location: "home" });
    const bench = base.find((e) => e.exerciseId === "bench")!;
    const lighter = applyPlanEdits(base, [
      { kind: "weight", exerciseId: "bench", tier: "T2", weight: bench.weight / 2 },
    ]).find((e) => e.exerciseId === "bench")!;
    expect(lighter.weight).toBe(bench.weight / 2);
    expect(lighter.originalWeight).toBe(Math.round(bench.originalWeight! / 2));

    const same = applyPlanEdits(base, [
      { kind: "weight", exerciseId: "bench", tier: "T2", weight: bench.weight },
    ]).find((e) => e.exerciseId === "bench")!;
    expect(same.originalWeight).toBe(bench.originalWeight);
  });

  it("applies edits in order, so an edit after a swap names the replacement", () => {
    const result = applyPlanEdits(plan(), [
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" },
      { kind: "weight", exerciseId: "incline_db_press", tier: "T2", weight: 45 },
    ]);
    expect(result[1]).toMatchObject({ exerciseId: "incline_db_press", weight: 45 });
  });

  it("ignores edits that name a missing entry or an unknown exercise", () => {
    const base = plan();
    const edits: PlanEdit[] = [
      { kind: "swap", exerciseId: "deadlift", tier: "T1", replacementId: "db_rdl" },
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "not_an_exercise" },
      { kind: "remove", exerciseId: "bench", tier: "T1" },
      { kind: "add", exerciseId: "not_an_exercise", sets: 3, reps: 10, weight: 5, isAMRAP: false },
      { kind: "scheme", exerciseId: "ohp", tier: "T2", sets: 1, reps: 1 },
      { kind: "weight", exerciseId: "ohp", tier: "T2", weight: 1 },
    ];
    expect(applyPlanEdits(base, edits)).toEqual(base);
  });
});

describe("prescribedFor", () => {
  it("lists the program's T1, T2 and T3 lifts with weight, scheme and stage", () => {
    expect(prescribedFor(WORKOUT_TEMPLATES.A1, seedLiftStates())).toEqual([
      { exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" },
      { exerciseId: "bench", tier: "T2", weight: 100, sets: 3, reps: 10, stage: "3x10" },
      { exerciseId: "lat_pulldown", tier: "T3", weight: expect.any(Number), sets: 3, reps: 15 },
    ]);
  });

  it("follows the lift state's stage", () => {
    const states = seedLiftStates().map((ls) =>
      ls.exerciseId === "squat" ? { ...ls, t1Stage: "6x2" as const, t1Weight: 200 } : ls
    );
    expect(prescribedFor(WORKOUT_TEMPLATES.A1, states)[0]).toEqual({
      exerciseId: "squat",
      tier: "T1",
      weight: 200,
      sets: 6,
      reps: 2,
      stage: "6x2",
    });
  });
});

describe("structuralEdits", () => {
  it("keeps swaps, removals and additions only", () => {
    const edits: PlanEdit[] = [
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" },
      { kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 },
      { kind: "remove", exerciseId: "lat_pulldown", tier: "T3" },
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 4, reps: 8 },
      { kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 12, weight: 20, isAMRAP: false },
    ];
    expect(structuralEdits(edits).map((e) => e.kind)).toEqual(["swap", "remove", "add"]);
    expect(structuralEdits(undefined)).toEqual([]);
  });
});

describe("snapshots", () => {
  it("snapshotOfPlan copies working entries and leaves warm-ups out", () => {
    const snapshot = snapshotOfPlan(plan({ includeWarmUps: true }));
    expect(snapshot.map((e) => e.exerciseId)).toEqual([
      "squat",
      "bench",
      "lat_pulldown",
      "face_pulls",
    ]);
    expect(snapshot[0]).toEqual({
      exerciseId: "squat",
      tier: "T1",
      sets: 5,
      reps: 3,
      weight: 190,
      isAMRAP: true,
    });
  });

  it("snapshotOfSets groups logged sets by exercise and tier, without warm-ups", () => {
    const sets = [
      ...makeSets("squat", "warmup", 2, 5, { weight: 95 }),
      ...makeSets("squat", "T1", 4, 3, { weight: 190 }),
      ...makeSets("squat", "T1", 1, 3, { weight: 190, isAMRAP: true, actualReps: 6 }),
      ...makeSets("bench", "T2", 3, 10, { weight: 100 }),
    ];
    expect(snapshotOfSets(sets)).toEqual([
      { exerciseId: "squat", tier: "T1", sets: 5, reps: 3, weight: 190, isAMRAP: true },
      { exerciseId: "bench", tier: "T2", sets: 3, reps: 10, weight: 100, isAMRAP: false },
    ]);
  });

  it("snapshotOfSets keeps the working sets only: their count and reps, at the heaviest working weight", () => {
    const sets = [
      ...makeSets("squat", "T1", 2, 3, { weight: 155, role: "ramp" }),
      ...makeSets("squat", "T1", 4, 3, { weight: 190 }),
      ...makeSets("squat", "T1", 1, 3, { weight: 195, isAMRAP: true, actualReps: 6 }),
      ...makeSets("squat", "T1", 2, 3, { weight: 155, role: "drop" }),
      ...makeSets("bench", "T2", 3, 10, { weight: 100, role: "work" }),
      ...makeSets("bench", "T2", 1, 12, { weight: 80, role: "backoff" }),
    ];
    expect(snapshotOfSets(sets)).toEqual([
      { exerciseId: "squat", tier: "T1", sets: 5, reps: 3, weight: 195, isAMRAP: true },
      { exerciseId: "bench", tier: "T2", sets: 3, reps: 10, weight: 100, isAMRAP: false },
    ]);
  });

  it("records the home exercise each home weight is for", () => {
    const home = buildWorkoutPlan({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: seedLiftStates(),
      location: "home",
      equipment: EQUIPMENT,
      includeWarmUps: false,
      selectedAccessories: [],
    });
    const squat = home.find((e) => e.exerciseId === "squat")!;
    expect(squat.substituteExerciseId).toBeTruthy();
    expect(snapshotOfPlan(home)[0]).toEqual({
      exerciseId: "squat",
      tier: "T1",
      sets: squat.targetSets,
      reps: squat.targetReps,
      weight: squat.weight,
      isAMRAP: true,
      performedAs: squat.substituteExerciseId,
    });

    const sets = makeSets("squat", "T1", 3, 3, {
      weight: 70,
      originalWeight: 190,
      isSubstituted: true,
      substituteExerciseId: "bulgarian_split_squat",
    });
    expect(snapshotOfSets(sets)).toEqual([
      { exerciseId: "squat", tier: "T1", sets: 3, reps: 3, weight: 70, isAMRAP: false, performedAs: "bulgarian_split_squat" },
    ]);
  });

  it("pinSnapshot reproduces a saved plan after lift states have moved on", () => {
    const edits: PlanEdit[] = [
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" },
      { kind: "weight", exerciseId: "incline_db_press", tier: "T2", weight: 45 },
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 4, reps: 8 },
    ];
    const saved = applyPlanEdits(plan(), edits);
    const snapshot = snapshotOfPlan(saved);

    const later = buildWorkoutPlan({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: seedLiftStates().map((ls) => ({ ...ls, t1Weight: ls.t1Weight + 10 })),
      location: "gym",
      equipment: EQUIPMENT,
      includeWarmUps: false,
      selectedAccessories: ["face_pulls"],
    });
    const replayed = applyPlanEdits(later, pinSnapshot(edits, snapshot));
    expect(snapshotOfPlan(replayed)).toEqual(snapshot);
  });
});

describe("per-set weights (H10 data shape)", () => {
  const rampSets = [
    { weight: 150, reps: 3, role: "ramp" as const },
    { weight: 190, reps: 3 },
    { weight: 190, reps: 3 },
    { weight: 190, reps: 3 },
    { weight: 190, reps: 3 },
    { weight: 190, reps: 3 },
    { weight: 165, reps: 6, role: "backoff" as const },
  ];
  const ramp: PlanEdit = { kind: "setWeights", exerciseId: "squat", tier: "T1", sets: rampSets };

  it("gives each set its own weight and reps; the entry reads as its heaviest working set", () => {
    const squat = applyPlanEdits(plan(), [ramp])[0];
    expect(squat).toMatchObject({ targetSets: 7, targetReps: 3, weight: 190 });
    expect(squat.perSet?.map((s) => s.weight)).toEqual([150, 190, 190, 190, 190, 190, 165]);
    expect(workingTargetSets(squat)).toBe(5);
    expect(heaviestWorkingSet(rampSets)).toEqual({ weight: 190, reps: 3 });
  });

  it("a later scheme or weight edit makes the sets uniform again", () => {
    const weight = applyPlanEdits(plan(), [
      ramp,
      { kind: "weight", exerciseId: "squat", tier: "T1", weight: 185 },
    ])[0];
    expect(weight.perSet).toBeUndefined();
    const scheme = applyPlanEdits(plan(), [
      ramp,
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 5, reps: 3 },
    ])[0];
    expect(scheme.perSet).toBeUndefined();
    expect(workingTargetSets(scheme)).toBe(5);
  });

  it("scales a home substitute's program weight to the heaviest working set", () => {
    const base = plan({ location: "home" });
    const bench = base.find((e) => e.exerciseId === "bench")!;
    const edited = applyPlanEdits(base, [
      {
        kind: "setWeights",
        exerciseId: "bench",
        tier: "T2",
        sets: [
          { weight: 30, reps: 10, role: "ramp" },
          ...Array.from({ length: 3 }, () => ({ weight: bench.weight, reps: 10 })),
        ],
      },
    ]).find((e) => e.exerciseId === "bench")!;
    expect(edited.originalWeight).toBe(bench.originalWeight);
    expect(edited.targetSets).toBe(4);
    expect(workingTargetSets(edited)).toBe(3);
  });

  it("an entry without a per-set list behaves exactly as before", () => {
    const squat = plan()[0];
    expect(squat.perSet).toBeUndefined();
    expect(workingTargetSets(squat)).toBe(squat.targetSets);
  });
});

describe("prescribedFor at home", () => {
  it("records each home exercise's own prescription, exactly as the plan builds it", () => {
    const liftStates = seedLiftStates();
    const prescribed = prescribedFor(WORKOUT_TEMPLATES.A1, liftStates, {
      variantStates: [],
      equipment: EQUIPMENT,
    });
    const homePlan = plan({ location: "home" });
    expect(prescribed[0]).toMatchObject({ exerciseId: "squat", weight: 190, sets: 5, reps: 3 });
    expect(prescribed.map((p) => p.home)).toEqual(
      homePlan
        .filter((e) => e.substituteExerciseId)
        .map((e) => ({
          exerciseId: e.substituteExerciseId,
          weight: e.weight,
          perHand: e.perHand,
          ...(e.tier === "T1" ? { stage: "5x3" } : e.tier === "T2" ? { stage: "3x10" } : {}),
          sets: e.targetSets,
          reps: e.targetReps,
        }))
    );
    // Without the home context (the gym) nothing is added.
    expect(prescribedFor(WORKOUT_TEMPLATES.A1, liftStates).every((p) => p.home === undefined)).toBe(true);
  });
});
