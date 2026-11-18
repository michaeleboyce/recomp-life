// An edited workout end to end through the pure domain: the plan builder applies the
// edits, completion credits each lift on its own, and the rotation and the upcoming
// forecast follow. Unedited behaviour is pinned by buildPlan.test.ts and
// completeWorkout.test.ts, which this file does not repeat.
import { describe, it, expect } from "vitest";
import { getWeeklyMuscleLoad } from "@/lib/muscleLoad";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, PlanEdit, SetLog, WorkoutSession } from "@/types";
import { buildWorkoutPlan, describeNextWorkout, substituteModification } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
import { createSetLog } from "./logSet";
import { applyPlanEdits, prescribedFor } from "./planEdits";
import { EQUIPMENT, SETTINGS, makeSession, seedLiftStates } from "./testFixtures";
import type { WorkoutPlan } from "./types";
import { projectUpcomingWorkouts } from "./upcoming";

const NOW = new Date("2026-11-12T10:00:00Z");

function planFor(session: WorkoutSession, liftStates: LiftState[], overrides = {}): WorkoutPlan {
  return buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[session.templateId],
    liftStates,
    location: session.location,
    equipment: EQUIPMENT,
    includeWarmUps: session.includeWarmUps,
    selectedAccessories: session.selectedAccessories,
    edits: session.planEdits,
    overrides,
  });
}

/** Every working set of the plan at exactly its target reps and planned weight. */
function performAll(plan: WorkoutPlan, location: "gym" | "home" = "gym"): SetLog[] {
  const sets: SetLog[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp) continue;
    for (let done = 0; done < entry.targetSets; done++) {
      const id = `${entry.exerciseId}-${entry.tier}-${done + 1}`;
      sets.push(
        createSetLog({
          exercise: { ...entry, completedSets: done },
          actualReps: entry.targetReps,
          repsInReserve: null,
          location,
          autoRegulated: false,
          now: NOW,
          id,
          clientId: id,
        })
      );
    }
  }
  return sets;
}

/** Starts, performs and finishes a session the way the app does. */
function run(options: {
  templateId?: string;
  edits?: PlanEdit[];
  liftStates?: LiftState[];
  alterSets?: (sets: SetLog[]) => SetLog[];
}) {
  const liftStates = options.liftStates ?? seedLiftStates();
  const templateId = options.templateId ?? "A1";
  const session = makeSession({
    templateId,
    planEdits: options.edits,
    prescribed: prescribedFor(WORKOUT_TEMPLATES[templateId], liftStates),
  });
  const plan = planFor(session, liftStates);
  const sets = (options.alterSets ?? ((s) => s))(performAll(plan));
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
  /** The session row as it is stored once finished. */
  const finished: WorkoutSession = { ...session, ...result.sessionPatch };
  return {
    session,
    finished,
    plan,
    sets,
    result,
    changed: result.liftStateUpdates.map((ls) => ls.exerciseId),
  };
}

const state = (states: LiftState[], id: string) => states.find((ls) => ls.exerciseId === id)!;

describe("buildWorkoutPlan with edits", () => {
  const base = { templateId: "A1" } as const;

  it("is the unedited plan followed by applyPlanEdits", () => {
    const edits: PlanEdit[] = [
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" },
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 4, reps: 8 },
    ];
    const plain = planFor(makeSession(base), seedLiftStates());
    const edited = planFor(makeSession({ ...base, planEdits: edits }), seedLiftStates());
    expect(edited).toEqual(applyPlanEdits(plain, edits));
  });

  it("returns the program's plan for absent and empty edits", () => {
    const plain = planFor(makeSession(base), seedLiftStates());
    expect(planFor(makeSession({ ...base, planEdits: [] }), seedLiftStates())).toEqual(plain);
  });

  it("lets a swap win over a home substitute for the same exercise", () => {
    const session = makeSession({
      ...base,
      location: "home",
      planEdits: [{ kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "db_floor_press" }],
    });
    const plan = planFor(session, seedLiftStates(), { bench: "db_bench" });
    expect(plan.some((e) => e.exerciseId === "bench")).toBe(false);
    expect(plan.find((e) => e.exerciseId === "db_floor_press")).toMatchObject({ tier: "T2" });
    expect(plan.find((e) => e.exerciseId === "db_floor_press")!.substituteExerciseId).toBeUndefined();
  });
});

describe("computeCompletion credits each lift on its own", () => {
  it("an unedited session that recorded its prescription progresses exactly like one that did not", () => {
    const liftStates = seedLiftStates();
    const session = makeSession();
    const plan = planFor(session, liftStates);
    const input = {
      plan,
      sets: performAll(plan),
      liftStates,
      settings: SETTINGS,
      recentE1RMsByExercise: {},
      currentExerciseIndex: plan.length,
      workoutStartTime: NOW,
      now: NOW,
    };
    const without = computeCompletion({ ...input, session });
    const withPrescription = computeCompletion({
      ...input,
      session: { ...session, prescribed: prescribedFor(WORKOUT_TEMPLATES.A1, liftStates) },
    });
    expect(withPrescription).toEqual(without);
    expect(without.liftStateUpdates.length).toBeGreaterThan(0);
  });

  it("a swapped lift leaves the program lift alone while the others progress", () => {
    const { changed, result } = run({
      edits: [{ kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" }],
    });
    expect(changed).toContain("squat");
    expect(changed).not.toContain("bench");
    expect(changed).not.toContain("incline_db_press");
    expect(state(result.liftStateUpdates, "squat").t1Weight).toBeGreaterThan(190);
  });

  it("a lift done lighter is neither a pass nor a fail: nothing about it changes", () => {
    const { changed } = run({
      edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 }],
    });
    expect(changed).not.toContain("squat");
    expect(changed).toContain("bench");
  });

  it("a lift done at a different scheme changes nothing", () => {
    const { changed } = run({
      edits: [{ kind: "scheme", exerciseId: "bench", tier: "T2", sets: 4, reps: 8 }],
    });
    expect(changed).not.toContain("bench");
    expect(changed).toContain("squat");
  });

  it("a lighter lift that also missed reps is not counted as a failure", () => {
    const { changed } = run({
      edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 }],
      alterSets: (sets) =>
        sets.map((s) =>
          s.exerciseId === "squat" ? { ...s, actualReps: 1, status: "failed" as const } : s
        ),
    });
    expect(changed).not.toContain("squat");
  });

  it("a removed lift changes nothing", () => {
    const { changed } = run({ edits: [{ kind: "remove", exerciseId: "squat", tier: "T1" }] });
    expect(changed).not.toContain("squat");
    expect(changed).toContain("bench");
  });

  it("a lift done heavier in every set passes and builds the next weight from the heavier one", () => {
    const plain = run({});
    const increment = state(plain.result.liftStateUpdates, "squat").t1Weight - 190;
    expect(increment).toBeGreaterThan(0);

    const heavier = run({
      edits: [
        { kind: "weight", exerciseId: "squat", tier: "T1", weight: 200 },
        { kind: "weight", exerciseId: "bench", tier: "T2", weight: 110 },
      ],
    });
    const squat = state(heavier.result.liftStateUpdates, "squat");
    expect(squat.t1Weight).toBe(200 + increment);
    expect(squat.t1Stage).toBe("5x3");
    expect(squat.t1FailCount).toBe(0);
    expect(state(heavier.result.liftStateUpdates, "bench").t2Weight).toBeGreaterThan(110);
  });

  it("missing reps at a heavier weight is not a failure of the prescribed one: nothing changes", () => {
    const { changed } = run({
      edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 200 }],
      alterSets: (sets) =>
        sets.map((s) =>
          s.exerciseId === "squat" && s.setNumber === 5
            ? { ...s, actualReps: 1, status: "failed" as const }
            : s
        ),
    });
    expect(changed).not.toContain("squat");
    expect(changed).toContain("bench");
  });

  it("one heavier set among prescribed ones is an ordinary pass from the prescribed weight", () => {
    const plain = run({});
    const mixed = run({
      alterSets: (sets) =>
        sets.map((s) => (s.exerciseId === "squat" && s.setNumber === 5 ? { ...s, weight: 205 } : s)),
    });
    expect(state(mixed.result.liftStateUpdates, "squat").t1Weight).toBe(
      state(plain.result.liftStateUpdates, "squat").t1Weight
    );
  });

  it("a T3 lift done heavier keeps the heavier weight, and goes up from it when its last set reaches the threshold", () => {
    const base = seedLiftStates().map((ls) =>
      ls.exerciseId === "lat_pulldown" ? { ...ls, t3Weight: 90 } : ls
    );
    const edits: PlanEdit[] = [{ kind: "weight", exerciseId: "lat_pulldown", tier: "T3", weight: 100 }];

    const kept = run({ liftStates: base, edits });
    expect(state(kept.result.liftStateUpdates, "lat_pulldown").t3Weight).toBe(100);

    const raised = run({
      liftStates: base,
      edits,
      alterSets: (sets) =>
        sets.map((s) =>
          s.exerciseId === "lat_pulldown" && s.setNumber === 3 ? { ...s, actualReps: 25 } : s
        ),
    });
    expect(state(raised.result.liftStateUpdates, "lat_pulldown").t3Weight).toBeGreaterThan(100);
  });

  it("added exercises never change lift state", () => {
    const plain = run({});
    const added = run({
      edits: [{ kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 12, weight: 20, isAMRAP: false }],
    });
    expect(added.changed).toEqual(plain.changed);
  });

  // 2026-11-15 (strength model): the credit now goes to the home exercise's own state
  // (`variantStateUpdates`), not to the barbell lift's (`liftStateUpdates`).
  it("a home substitute still earns credit: its own state progresses", () => {
    const liftStates = seedLiftStates();
    const session = makeSession({
      location: "home",
      modifications: [substituteModification("bench", "db_bench", 100, 40)],
      prescribed: prescribedFor(WORKOUT_TEMPLATES.A1, liftStates),
    });
    const plan = planFor(session, liftStates);
    const bench = plan.find((e) => e.exerciseId === "bench")!;
    expect(bench.substituteExerciseId).toBeDefined();
    const result = computeCompletion({
      session,
      plan,
      sets: performAll(plan, "home"),
      liftStates,
      settings: SETTINGS,
      recentE1RMsByExercise: {},
      currentExerciseIndex: plan.length,
      workoutStartTime: NOW,
      now: NOW,
    });
    expect(result.liftStateUpdates.map((ls) => ls.exerciseId)).not.toContain("bench");
    expect(result.variantStateUpdates.map((v) => v.id)).toContain("bench|db_bench|T2");
    expect(result.variantOutcomes.find((o) => o.liftId === "bench")?.kind).toBe("passed");
  });

  it("correcting finished sets to below the prescription removes the lift's credit", () => {
    const { changed } = run({
      alterSets: (sets) => sets.map((s) => (s.exerciseId === "squat" ? { ...s, weight: 150 } : s)),
    });
    expect(changed).not.toContain("squat");
  });
});

describe("rotation", () => {
  const nextAfter = (completedWorkouts: WorkoutSession[]) =>
    describeNextWorkout({
      completedWorkouts,
      templates: WORKOUT_TEMPLATES,
      liftStates: seedLiftStates(),
      plan: { location: "gym", equipment: EQUIPMENT, includeWarmUps: false, selectedAccessories: [] },
    }).templateId;

  it("the due day done as prescribed moves the rotation on", () => {
    expect(nextAfter([run({}).finished])).toBe("B1");
  });

  it("a day pulled out of order progresses its lifts but leaves the due day due", () => {
    const pulled = run({ templateId: "B1" });
    expect(pulled.changed).toContain("ohp");
    expect(nextAfter([pulled.finished])).toBe("A1");
  });

  it("the due day does not move the rotation when its T1 lift was swapped, removed or done lighter", () => {
    const edits: PlanEdit[][] = [
      [{ kind: "swap", exerciseId: "squat", tier: "T1", replacementId: "pendulum_squat" }],
      [{ kind: "remove", exerciseId: "squat", tier: "T1" }],
      [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 }],
    ];
    for (const edit of edits) {
      expect(nextAfter([run({ edits: edit }).finished])).toBe("A1");
    }
  });

  it("the due day moves the rotation when only its T2 lift was changed", () => {
    const { finished } = run({
      edits: [{ kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" }],
    });
    expect(nextAfter([finished])).toBe("B1");
  });
});

describe("downstream figures (R6)", () => {
  it("an off-program session adds to weekly muscle load and leaves the forecast's next day alone", () => {
    const a1: WorkoutSession = {
      ...run({}).finished,
      id: "a1",
      startedAt: new Date("2026-11-10T10:00:00Z"),
    };
    const extra: WorkoutSession = {
      ...run({
        templateId: "B2",
        edits: [{ kind: "weight", exerciseId: "deadlift", tier: "T1", weight: 135 }],
      }).finished,
      id: "extra",
      startedAt: new Date("2026-11-11T10:00:00Z"),
    };

    const forecast = (completedWorkouts: WorkoutSession[]) =>
      projectUpcomingWorkouts({
        completedWorkouts,
        templates: WORKOUT_TEMPLATES,
        liftStates: seedLiftStates(),
        location: "gym",
        equipment: EQUIPMENT,
        includeWarmUps: false,
        count: 3,
        settings: SETTINGS,
        now: NOW,
      }).map((w) => w.templateId);
    expect(forecast([a1, extra])).toEqual(forecast([a1]));
    expect(forecast([a1, extra])[0]).toBe("B1");

    const weekStart = new Date("2026-11-09T00:00:00Z");
    const total = (workouts: WorkoutSession[]) =>
      Object.values(getWeeklyMuscleLoad(workouts, weekStart)).reduce((sum, n) => sum + (n ?? 0), 0);
    expect(total([extra])).toBeGreaterThan(0);
  });
});
