// A swap or removal during a workout, scripted end to end: the plan the screen keeps,
// the plan resume rebuilds from the saved edits, and the lift states the rebuild gives
// for the finished session against the ones finishing it live gives.
import { describe, it, expect } from "vitest";
import { rebuildDerived } from "@/lib/rebuild";
import { PROGRESSION_FIELDS } from "@/lib/rebuild/testHelpers";
import { computeCompletion } from "@/lib/workout/completeWorkout";
import { createSetLog } from "@/lib/workout/logSet";
import { prescribedFor } from "@/lib/workout/planEdits";
import { planForSession } from "@/lib/workout/planForSession";
import { rehydratePlan } from "@/lib/workout/rehydrate";
import { EQUIPMENT, SETTINGS, fixtureStartAdjustments, makeSession, seedLiftStates } from "@/lib/workout/testFixtures";
import type { WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, PlanEdit, SetLog, Tier, WorkoutSession } from "@/types";
import type { SwapReplacement } from "./combos";
import { isDroppedEntry, isWarmUpOfDropped, midWorkoutRemove, midWorkoutSwap } from "./midWorkout";

const TEMPLATE = WORKOUT_TEMPLATES.A1;
const START = new Date(2026, 10, 18, 9, 0, 0);

function at(minutes: number): Date {
  const d = new Date(START);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

const replacement = (exerciseId: string, weight: number, sets = 3, reps = 10, isAMRAP = false): SwapReplacement => ({
  exerciseId,
  prescription: { weight, sets, reps, isAMRAP, basis: "history", note: "" },
});

/** A workout in progress, driven the way the active workout screen drives it. */
class Live {
  liftStates: LiftState[] = seedLiftStates();
  session: WorkoutSession = makeSession({
    templateId: "A1",
    startedAt: START,
    includeWarmUps: true,
    selectedAccessories: ["face_pulls"],
    prescribed: prescribedFor(TEMPLATE, this.liftStates),
    planEdits: [],
  });
  frozen: WorkoutPlan = this.planOnResume();
  sets: SetLog[] = [];
  private clock = 0;

  planOnResume(): WorkoutPlan {
    return planForSession({ session: this.session, template: TEMPLATE, liftStates: this.liftStates, equipment: EQUIPMENT });
  }

  /** The plan with progress, as the screen shows it. */
  get plan(): WorkoutPlan {
    return rehydratePlan(this.frozen, this.sets).plan;
  }

  /** Logs `count` sets of the entry at its target reps. */
  log(exerciseId: string, tier: Tier, count: number, warmUp = false) {
    for (let i = 0; i < count; i++) {
      const index = this.plan.findIndex(
        (e) => e.exerciseId === exerciseId && e.tier === tier && e.isWarmUp === warmUp && e.completedSets < e.targetSets
      );
      if (index === -1) throw new Error(`nothing left of ${exerciseId} ${tier}`);
      const entry = this.plan[index];
      this.clock += 3;
      const id = `${this.session.id}-set-${this.sets.length + 1}`;
      this.sets.push(
        createSetLog({ exercise: entry, actualReps: entry.targetReps, rpe: null, location: "gym", autoRegulated: false, now: at(this.clock), id, clientId: id })
      );
    }
  }

  logWarmUps(exerciseId: string) {
    for (const entry of this.plan.filter((e) => e.isWarmUp && e.exerciseId === exerciseId)) {
      this.log(exerciseId, "warmup", entry.targetSets - entry.completedSets, true);
    }
  }

  /** Saves the edits and lays them on the frozen plan, as `addExercise` does. */
  apply(change: { edits: PlanEdit[]; plan: WorkoutPlan }) {
    this.session = { ...this.session, planEdits: [...(this.session.planEdits ?? []), ...change.edits] };
    this.frozen = change.plan;
  }

  logRest() {
    for (const entry of this.plan) {
      if (entry.isWarmUp) continue;
      this.log(entry.exerciseId, entry.tier, entry.targetSets - entry.completedSets);
    }
  }

  /** Finishes live (what `finishWorkout` stores) and from the rebuild. */
  finish() {
    const now = at(this.clock + 5);
    const plan = this.plan;
    const live = computeCompletion({
      session: this.session,
      plan,
      sets: this.sets,
      liftStates: this.liftStates,
      settings: SETTINGS,
      recentE1RMsByExercise: {},
      currentExerciseIndex: plan.length,
      workoutStartTime: START,
      now,
    });
    const finished: WorkoutSession = { ...this.session, ...live.sessionPatch, sets: this.sets };
    const rebuilt = rebuildDerived({ workouts: [finished], adjustments: fixtureStartAdjustments(), settings: SETTINGS });
    const after = new Map(this.liftStates.map((s) => [s.exerciseId, s]));
    for (const s of live.liftStateUpdates) after.set(s.exerciseId, s);
    return { live: [...after.values()], rebuilt: rebuilt.liftStates, outcomes: rebuilt.outcomes.get(finished.id)!, liveOutcomes: live.outcomes };
  }
}

/** The progression fields; the e1RM series is an input the hook supplies, not the swap's. */
function view(states: LiftState[]) {
  const fields = PROGRESSION_FIELDS.filter((f) => f !== "recentE1RMs");
  return Object.fromEntries(
    [...states]
      .sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1))
      .map((s) => [s.exerciseId, Object.fromEntries(fields.map((f) => [f, s[f]]))])
  );
}

/** Every entry before the change is at its index, the same entry, except the one changed. */
function expectIndexesKept(before: WorkoutPlan, after: WorkoutPlan, changed: number) {
  expect(after.length).toBeGreaterThanOrEqual(before.length);
  before.forEach((entry, i) => {
    if (i !== changed) expect(after[i]).toEqual(entry);
  });
}

function expectResumeAgrees(live: Live) {
  // What resume plans from the saved session equals the plan the screen keeps.
  expect(live.planOnResume()).toEqual(live.frozen);
  expect(rehydratePlan(live.planOnResume(), live.sets)).toEqual(rehydratePlan(live.frozen, live.sets));
}

describe("midWorkoutSwap", () => {
  it("replaces an entry with no set logged in place", () => {
    const live = new Live();
    live.logWarmUps("squat");
    live.log("squat", "T1", 5);
    const before = live.frozen;
    const index = before.findIndex((e) => e.exerciseId === "bench" && e.tier === "T2");

    const change = midWorkoutSwap({
      plan: live.frozen,
      sets: live.sets,
      exerciseId: "bench",
      tier: "T2",
      replacements: [replacement("db_bench", 50), replacement("tricep_pushdowns", 40, 3, 15)],
    });
    expect(change.mode).toBe("replaced");
    expect(change.edits.map((e) => e.kind)).toEqual(["swap", "weight", "add"]);
    expectIndexesKept(before, change.plan, index);
    expect(change.plan[index]).toMatchObject({ exerciseId: "db_bench", tier: "T2", targetSets: 3, targetReps: 10, weight: 50 });
    expect(change.replacementIndexes).toEqual([index, before.length]);

    live.apply(change);
    expectResumeAgrees(live);
    live.logRest();
    expectResumeAgrees(live);
    const { live: states, rebuilt, outcomes } = live.finish();
    expect(view(rebuilt)).toEqual(view(states));
    // The bench is held: not done, nothing changes.
    expect(outcomes.find((o) => o.exerciseId === "bench")!.kind).toBe("notDone");
    expect(states.find((s) => s.exerciseId === "bench")).toEqual(live.liftStates.find((s) => s.exerciseId === "bench"));
  });

  it("keeps the sets logged, ends the rest of the entry and appends the replacement", () => {
    const live = new Live();
    live.logWarmUps("squat");
    live.log("squat", "T1", 2);
    const before = live.frozen;
    const index = before.findIndex((e) => e.exerciseId === "squat" && e.tier === "T1");

    const change = midWorkoutSwap({
      plan: live.frozen,
      sets: live.sets,
      exerciseId: "squat",
      tier: "T1",
      replacements: [replacement("leg_press", 180, 3, 3, true)],
    });
    expect(change.mode).toBe("ended");
    expect(change.loggedSets).toBe(2);
    expect(change.edits).toEqual([
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 2, reps: 3 },
      {
        kind: "add",
        exerciseId: "leg_press",
        sets: 3,
        reps: 3,
        weight: 180,
        isAMRAP: true,
        replaces: { exerciseId: "squat", tier: "T1" },
      },
    ]);
    // The appended entry carries the marker: it stands in for the squat, logged only.
    expect(change.plan.at(-1)).toMatchObject({ exerciseId: "leg_press", replaces: { exerciseId: "squat", tier: "T1" } });
    expectIndexesKept(before, change.plan, index);
    expect(change.plan[index]).toMatchObject({ exerciseId: "squat", targetSets: 2 });
    expect(change.replacementIndexes).toEqual([before.length]);

    live.apply(change);
    expectResumeAgrees(live);
    // The squat is done as far as the screen is concerned.
    const squat = live.plan[index];
    expect(squat.completedSets).toBe(squat.targetSets);

    live.logRest();
    expectResumeAgrees(live);
    const { live: states, rebuilt, outcomes } = live.finish();
    expect(view(rebuilt)).toEqual(view(states));
    // Both exercises are in the session's sets, the squat's two first.
    expect(live.sets.filter((s) => s.exerciseId === "squat" && s.tier === "T1")).toHaveLength(2);
    expect(live.sets.filter((s) => s.exerciseId === "leg_press")).toHaveLength(3);
    // The squat is logged only: held at its weight and stage.
    expect(outcomes.find((o) => o.exerciseId === "squat")!.kind).toBe("loggedOnly");
    expect(view(states).squat).toEqual(view(live.liftStates).squat);
  });

  it("ends an entry whose warm-ups are in front of it at 0 sets instead of removing them", () => {
    const live = new Live();
    live.log("squat", "warmup", 1, true);
    const before = live.frozen;
    const index = before.findIndex((e) => e.exerciseId === "squat" && e.tier === "T1");
    expect(before.some((e) => e.isWarmUp && e.exerciseId === "squat")).toBe(true);

    const change = midWorkoutSwap({
      plan: live.frozen,
      sets: live.sets,
      exerciseId: "squat",
      tier: "T1",
      replacements: [replacement("leg_press", 180, 5, 3, true)],
    });
    expect(change.mode).toBe("ended");
    expect(change.edits[0]).toEqual({ kind: "scheme", exerciseId: "squat", tier: "T1", sets: 0, reps: 3 });
    expectIndexesKept(before, change.plan, index);
    expect(isDroppedEntry(change.plan[index])).toBe(true);
    const warmUps = change.plan.map((_, i) => i).filter((i) => change.plan[i].isWarmUp && change.plan[i].exerciseId === "squat");
    expect(warmUps.every((i) => isWarmUpOfDropped(change.plan, i))).toBe(true);

    live.apply(change);
    expectResumeAgrees(live);
    live.logRest();
    const { live: states, rebuilt } = live.finish();
    expect(view(rebuilt)).toEqual(view(states));
    expect(view(states).squat).toEqual(view(live.liftStates).squat);
  });

  it("survives a reload between the swap and the next set", () => {
    const live = new Live();
    live.logWarmUps("squat");
    live.log("squat", "T1", 2);
    live.apply(
      midWorkoutSwap({ plan: live.frozen, sets: live.sets, exerciseId: "squat", tier: "T1", replacements: [replacement("leg_press", 180, 3, 3)] })
    );
    // Reload: the frozen plan is planned again from the saved session.
    live.frozen = live.planOnResume();
    live.log("leg_press", "accessory", 1);
    live.frozen = live.planOnResume();
    live.logRest();
    const { live: states, rebuilt } = live.finish();
    expect(view(rebuilt)).toEqual(view(states));
  });

  it("refuses a finished entry, an unknown or duplicate replacement and one already in the workout", () => {
    const live = new Live();
    live.logWarmUps("squat");
    live.log("squat", "T1", 5);
    const base = { plan: live.frozen, sets: live.sets };
    expect(() => midWorkoutSwap({ ...base, exerciseId: "squat", tier: "T1", replacements: [replacement("leg_press", 1)] })).toThrow(/already finished/);
    expect(() => midWorkoutSwap({ ...base, exerciseId: "bench", tier: "T2", replacements: [] })).toThrow(/Pick/);
    expect(() => midWorkoutSwap({ ...base, exerciseId: "bench", tier: "T2", replacements: [replacement("nope", 1)] })).toThrow(/library/);
    expect(() => midWorkoutSwap({ ...base, exerciseId: "bench", tier: "T2", replacements: [replacement("face_pulls", 1)] })).toThrow(/already in this workout/);
    expect(() =>
      midWorkoutSwap({ ...base, exerciseId: "bench", tier: "T2", replacements: [replacement("db_bench", 1), replacement("db_bench", 1)] })
    ).toThrow(/once/);
    expect(() => midWorkoutSwap({ ...base, exerciseId: "deadlift", tier: "T1", replacements: [replacement("db_bench", 1)] })).toThrow(/not in this workout/);
  });
});

describe("midWorkoutRemove", () => {
  it("ends an entry with no set logged at 0 sets, every index kept", () => {
    const live = new Live();
    live.logWarmUps("squat");
    live.log("squat", "T1", 5);
    const before = live.frozen;
    const index = before.findIndex((e) => e.exerciseId === "lat_pulldown");
    const change = midWorkoutRemove({ plan: live.frozen, sets: live.sets, exerciseId: "lat_pulldown", tier: "T3" });
    expect(change.mode).toBe("removed");
    expect(change.plan).toHaveLength(before.length);
    expectIndexesKept(before, change.plan, index);
    expect(isDroppedEntry(change.plan[index])).toBe(true);

    live.apply(change);
    expectResumeAgrees(live);
    live.logRest();
    const { live: states, rebuilt, outcomes } = live.finish();
    expect(view(rebuilt)).toEqual(view(states));
    expect(outcomes.find((o) => o.exerciseId === "lat_pulldown")!.kind).toBe("notDone");
  });

  it("refuses an entry with a set logged", () => {
    const live = new Live();
    live.logWarmUps("squat");
    live.log("squat", "T1", 1);
    expect(() => midWorkoutRemove({ plan: live.frozen, sets: live.sets, exerciseId: "squat", tier: "T1" })).toThrow(/logged/);
  });
});
