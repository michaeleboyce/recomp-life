// The outcomes `computeCompletion` reports beside the lift-state updates: one per
// T1, T2 and T3 lift of the day, including the lifts whose state does not change.
// The updates themselves are pinned by completeWorkout.test.ts and editedWorkout.test.ts.
import { describe, expect, it } from "vitest";
import { isRuleId } from "@/lib/evidence";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, PlanEdit, ProgressionOutcome, SetLog, SetStatus } from "@/types";
import { buildWorkoutPlan } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
import { createSetLog } from "./logSet";
import { prescribedFor } from "./planEdits";
import { EQUIPMENT, SETTINGS, makeSession, seedLiftStates } from "./testFixtures";

const NOW = new Date("2026-11-14T10:00:00Z");

/** Starts, performs and finishes workout A1 the way the app does. */
function run(
  options: {
    edits?: PlanEdit[];
    liftStates?: LiftState[];
    recordPrescription?: boolean;
    alterSets?: (sets: SetLog[]) => SetLog[];
  } = {}
) {
  const liftStates = options.liftStates ?? seedLiftStates();
  const session = makeSession({
    templateId: "A1",
    planEdits: options.edits,
    ...(options.recordPrescription === false
      ? {}
      : { prescribed: prescribedFor(WORKOUT_TEMPLATES.A1, liftStates) }),
  });
  const plan = buildWorkoutPlan({
    template: WORKOUT_TEMPLATES.A1,
    liftStates,
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: false,
    selectedAccessories: [],
    edits: session.planEdits,
  });
  const performed: SetLog[] = [];
  for (const entry of plan) {
    for (let done = 0; done < entry.targetSets; done++) {
      const id = `${entry.exerciseId}-${entry.tier}-${done + 1}`;
      performed.push(
        createSetLog({
          exercise: { ...entry, completedSets: done },
          actualReps: entry.targetReps,
          repsInReserve: null,
          location: "gym",
          autoRegulated: false,
          now: NOW,
          id,
          clientId: id,
        })
      );
    }
  }
  const sets = (options.alterSets ?? ((s) => s))(performed);
  const result = computeCompletion({
    session,
    plan,
    sets,
    liftStates,
    settings: SETTINGS,
    recentE1RMsByExercise: {},
    currentExerciseIndex: plan.length,
    workoutStartTime: NOW,
    now: NOW,
  });
  const outcome = (exerciseId: string): ProgressionOutcome => {
    const found = result.outcomes.find((o) => o.exerciseId === exerciseId);
    if (!found) throw new Error(`No outcome for ${exerciseId}`);
    return found;
  };
  const stateAfter = (exerciseId: string) =>
    result.liftStateUpdates.find((ls) => ls.exerciseId === exerciseId) ??
    liftStates.find((ls) => ls.exerciseId === exerciseId)!;
  return { result, outcome, stateAfter, liftStates };
}

const only = (exerciseId: string, change: (set: SetLog) => SetLog | null) => (sets: SetLog[]) =>
  sets.flatMap((set) => {
    if (set.exerciseId !== exerciseId) return [set];
    const next = change(set);
    return next ? [next] : [];
  });
const withStatus = (status: SetStatus, setNumber = 1) => (set: SetLog) =>
  set.setNumber === setNumber ? { ...set, status } : set;

describe("computeCompletion outcomes", () => {
  it("one outcome per T1, T2 and T3 lift, in template order", () => {
    const { result } = run();
    expect(result.outcomes.map((o) => [o.exerciseId, o.tier, o.kind])).toEqual([
      ["squat", "T1", "passed"],
      ["bench", "T2", "passed"],
      ["lat_pulldown", "T3", "t3Same"],
    ]);
  });

  it("each outcome's from and to are the lift's weight and stage before and after", () => {
    const { result, liftStates, stateAfter } = run({
      alterSets: only("bench", (s) => (s.setNumber === 3 ? { ...s, actualReps: 6, status: "failed" } : s)),
    });
    const before = (id: string) => liftStates.find((ls) => ls.exerciseId === id)!;
    expect(result.outcomes).toEqual([
      {
        exerciseId: "squat",
        tier: "T1",
        kind: "passed",
        from: { weight: before("squat").t1Weight, stage: "5x3" },
        to: { weight: stateAfter("squat").t1Weight, stage: "5x3" },
        ruleId: "gzclp-progression",
      },
      {
        exerciseId: "bench",
        tier: "T2",
        kind: "stageDown",
        from: { weight: before("bench").t2Weight, stage: "3x10" },
        to: { weight: before("bench").t2Weight, stage: "3x8" },
        ruleId: "gzclp-progression",
      },
      {
        exerciseId: "lat_pulldown",
        tier: "T3",
        kind: "t3Same",
        reason: "lastSet",
        from: { weight: 90 },
        to: { weight: 90 },
        ruleId: "t3-progression",
      },
    ]);
    expect(stateAfter("squat").t1Weight).toBeGreaterThan(before("squat").t1Weight);
  });

  it("is additive: the lift-state updates and the session patch are what they were", () => {
    const { result } = run();
    // 2026-11-15: the home exercises' updates and outcomes were added beside them.
    expect(Object.keys(result).sort()).toEqual([
      "liftStateUpdates",
      "outcomes",
      "sessionPatch",
      "variantOutcomes",
      "variantStateUpdates",
    ]);
    expect(result.liftStateUpdates.map((ls) => ls.exerciseId)).toEqual(["squat", "bench"]);
  });

  it("a T3 lift whose last set reaches 25 goes up", () => {
    const { outcome } = run({
      alterSets: only("lat_pulldown", (s) => (s.setNumber === 3 ? { ...s, actualReps: 25 } : s)),
    });
    expect(outcome("lat_pulldown")).toMatchObject({
      kind: "t3Up",
      reason: "lastSet",
      from: { weight: 90 },
      to: { weight: 95 },
    });
  });

  it("a lift with no set logged is not done, and nothing about it changes", () => {
    const { outcome, result } = run({ alterSets: only("bench", () => null) });
    expect(outcome("bench")).toMatchObject({
      kind: "notDone",
      from: { weight: 100, stage: "3x10" },
      to: { weight: 100, stage: "3x10" },
      ruleId: "gzclp-progression",
    });
    expect(outcome("bench").reason).toBeUndefined();
    expect(result.liftStateUpdates.map((ls) => ls.exerciseId)).not.toContain("bench");
  });

  it("stopping part-way is partial for every tier: neither a pass nor a miss", () => {
    const firstSetOnly = (s: SetLog) => (s.setNumber === 1 ? s : null);
    const { outcome } = run({
      alterSets: (sets) =>
        only("lat_pulldown", firstSetOnly)(only("bench", firstSetOnly)(only("squat", firstSetOnly)(sets))),
    });
    expect(outcome("squat")).toMatchObject({ kind: "partial", from: { weight: 190 }, to: { weight: 190 } });
    expect(outcome("bench")).toMatchObject({ kind: "partial", to: { weight: 100, stage: "3x10" } });
    expect(outcome("lat_pulldown")).toMatchObject({ kind: "partial", to: { weight: 90 }, ruleId: "t3-progression" });
  });

  it.each([
    ["skipped_pain", "pain"],
    ["reduced_run_fatigue", "run"],
    ["reduced_equipment", "equipment"],
  ] as const)("a set marked %s holds the lift, whether or not every set was logged", (status, reason) => {
    const full = run({ alterSets: only("squat", withStatus(status)) });
    expect(full.outcome("squat")).toMatchObject({
      kind: "held",
      reason,
      from: { weight: 190, stage: "5x3" },
      to: { weight: 190, stage: "5x3" },
      ruleId: "gzclp-progression",
    });
    expect(full.stateAfter("squat")).toMatchObject({ t1Weight: 190, t1Stage: "5x3", t1FailCount: 0 });

    const cutShort = run({
      alterSets: only("squat", (s) => (s.setNumber > 2 ? null : withStatus(status, 2)(s))),
    });
    expect(cutShort.outcome("squat")).toMatchObject({ kind: "held", reason });
    expect(cutShort.stateAfter("squat")).toMatchObject({ t1Weight: 190, t1Stage: "5x3", t1FailCount: 0 });
  });

  it("a held T3 lift keeps its weight even with 25 on the last set", () => {
    const { outcome } = run({
      alterSets: only("lat_pulldown", (s) =>
        s.setNumber === 3 ? { ...s, actualReps: 30 } : withStatus("skipped_pain")(s)
      ),
    });
    expect(outcome("lat_pulldown")).toMatchObject({ kind: "held", reason: "pain", to: { weight: 90 } });
  });

  it("an accepted T2 load drop is a hold with its own reason and rule", () => {
    const { outcome } = run({
      alterSets: only("bench", (s) => (s.setNumber > 1 ? { ...s, status: "autoregulated_load_drop" } : s)),
    });
    expect(outcome("bench")).toMatchObject({
      kind: "held",
      reason: "loadDrop",
      to: { weight: 100, stage: "3x10" },
      ruleId: "t2-autoregulation",
    });
  });
});

describe("computeCompletion outcomes for a changed workout", () => {
  it("a lift done lighter, at another scheme or swapped out is only logged or not done", () => {
    const lighter = run({ edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 }] });
    expect(lighter.outcome("squat")).toEqual({
      exerciseId: "squat",
      tier: "T1",
      kind: "loggedOnly",
      reason: "edited",
      from: { weight: 190, stage: "5x3" },
      to: { weight: 190, stage: "5x3" },
      ruleId: "off-program-credit",
    });
    expect(lighter.outcome("bench").kind).toBe("passed");

    const scheme = run({ edits: [{ kind: "scheme", exerciseId: "bench", tier: "T2", sets: 4, reps: 8 }] });
    expect(scheme.outcome("bench")).toMatchObject({ kind: "loggedOnly", reason: "edited" });

    const swapped = run({
      edits: [{ kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" }],
    });
    expect(swapped.outcome("bench")).toMatchObject({ kind: "notDone", to: { weight: 100, stage: "3x10" } });
    expect(swapped.result.outcomes.map((o) => o.exerciseId)).toEqual(["squat", "bench", "lat_pulldown"]);
  });

  it("a lighter lift that also missed reps is still only logged, not a miss", () => {
    const { outcome } = run({
      edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 }],
      alterSets: only("squat", (s) => ({ ...s, actualReps: 1, status: "failed" })),
    });
    expect(outcome("squat")).toMatchObject({ kind: "loggedOnly", reason: "edited" });
  });

  it("a lift done heavier in every set passes from the heavier weight and says why", () => {
    const { outcome, stateAfter } = run({
      edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 200 }],
    });
    expect(outcome("squat")).toEqual({
      exerciseId: "squat",
      tier: "T1",
      kind: "passed",
      reason: "heavier",
      from: { weight: 190, stage: "5x3" },
      to: { weight: stateAfter("squat").t1Weight, stage: "5x3" },
      ruleId: "off-program-credit",
    });
    expect(stateAfter("squat").t1Weight).toBeGreaterThan(200);
  });

  it("missing reps at a heavier weight holds the lift at what was prescribed", () => {
    const { outcome, result } = run({
      edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 200 }],
      alterSets: only("squat", (s) => (s.setNumber === 5 ? { ...s, actualReps: 1, status: "failed" } : s)),
    });
    expect(outcome("squat")).toMatchObject({
      kind: "held",
      reason: "heavier",
      from: { weight: 190, stage: "5x3" },
      to: { weight: 190, stage: "5x3" },
      ruleId: "off-program-credit",
    });
    expect(result.liftStateUpdates.map((ls) => ls.exerciseId)).not.toContain("squat");
  });

  it("a T3 lift done heavier keeps the heavier weight: up because it was heavier, or up from it on 25", () => {
    const edits: PlanEdit[] = [{ kind: "weight", exerciseId: "lat_pulldown", tier: "T3", weight: 100 }];

    const kept = run({ edits });
    expect(kept.outcome("lat_pulldown")).toEqual({
      exerciseId: "lat_pulldown",
      tier: "T3",
      kind: "t3Up",
      reason: "heavier",
      from: { weight: 90 },
      to: { weight: 100 },
      ruleId: "off-program-credit",
    });
    expect(kept.stateAfter("lat_pulldown").t3Weight).toBe(100);

    const raised = run({
      edits,
      alterSets: only("lat_pulldown", (s) => (s.setNumber === 3 ? { ...s, actualReps: 25 } : s)),
    });
    expect(raised.outcome("lat_pulldown")).toMatchObject({
      kind: "t3Up",
      reason: "lastSet",
      from: { weight: 90 },
      to: { weight: 105 },
      ruleId: "t3-progression",
    });
    expect(raised.stateAfter("lat_pulldown").t3Weight).toBe(105);
  });

  it("a session that recorded no prescription is judged as before: nothing is only logged", () => {
    const { result } = run({
      recordPrescription: false,
      alterSets: only("squat", (s) => ({ ...s, weight: 150 })),
    });
    expect(result.outcomes.map((o) => o.kind)).toEqual(["passed", "passed", "t3Same"]);
  });
});

describe("computeCompletion outcomes always agree with the state change", () => {
  it("to is the weight and stage of the lift state after, for every case above", () => {
    const cases = [
      run(),
      run({ alterSets: only("squat", (s) => (s.setNumber === 5 ? { ...s, actualReps: 0, status: "failed" } : s)) }),
      run({ alterSets: only("bench", () => null) }),
      run({ edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 200 }] }),
      run({ edits: [{ kind: "weight", exerciseId: "lat_pulldown", tier: "T3", weight: 100 }] }),
      run({ alterSets: only("squat", withStatus("skipped_pain")) }),
    ];
    for (const { result, stateAfter } of cases) {
      for (const outcome of result.outcomes) {
        const after = stateAfter(outcome.exerciseId);
        const expected =
          outcome.tier === "T1"
            ? { weight: after.t1Weight, stage: after.t1Stage }
            : outcome.tier === "T2"
              ? { weight: after.t2Weight, stage: after.t2Stage }
              : { weight: after.t3Weight };
        expect(outcome.to).toEqual(expected);
        expect(isRuleId(outcome.ruleId), outcome.ruleId).toBe(true);
      }
    }
  });
});
