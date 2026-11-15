// A weight the user set for the day: the saved trace says what happens to the lift, and
// finishing the workout then does exactly that. The wording comes from the same
// classification completion uses (`classifyEntry`), so each case is checked against
// `computeCompletion` on a session performed at the planned weights.
import { describe, expect, it } from "vitest";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { computeCompletion } from "@/lib/workout/completeWorkout";
import { createSetLog } from "@/lib/workout/logSet";
import { prescribedFor } from "@/lib/workout/planEdits";
import { EQUIPMENT, SETTINGS, makeSession, seedLiftStates } from "@/lib/workout/testFixtures";
import type { WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { PlanEdit, SetLog, Tier, TraceStep, WorkoutLocation } from "@/types";
import {
  buildSessionDecisions,
  explainPrescription,
  explainSubstitute,
  findStoredDecision,
  replayTrace,
  type TraceContext,
} from "./index";
import { weightChangeEffect } from "./substitute";

const NOW = new Date("2026-11-12T10:00:00Z");

/** A1 from the seeded lifts: squat T1 at 190, bench T2 at 100, lat pulldown T3 at 90. */
function start(edits: PlanEdit[], location: WorkoutLocation = "gym") {
  const liftStates = seedLiftStates();
  const template = WORKOUT_TEMPLATES.A1;
  const prescribed = prescribedFor(template, liftStates);
  const session = makeSession({ templateId: "A1", location, planEdits: edits, prescribed });
  const plan = buildWorkoutPlan({
    template,
    liftStates,
    location,
    equipment: EQUIPMENT,
    includeWarmUps: true,
    selectedAccessories: [],
    edits,
  });
  const context: TraceContext = {
    now: NOW,
    location,
    equipment: EQUIPMENT,
    phase: SETTINGS.trainingPhase,
    liftStates,
    prescribed,
  };
  const entry = (exerciseId: string, tier: Tier) =>
    plan.find((e) => !e.isWarmUp && e.exerciseId === exerciseId && e.tier === tier)!;
  const lastStep = (exerciseId: string, tier: Tier): TraceStep => {
    const trace = explainPrescription(entry(exerciseId, tier), context, plan);
    expect(replayTrace(trace)).toBe(entry(exerciseId, tier).weight);
    return trace.steps[trace.steps.length - 1];
  };
  return { session, plan, context, liftStates, prescribed, entry, lastStep };
}

/** Every working set of the plan at its planned weight and target reps. */
function perform(plan: WorkoutPlan, location: WorkoutLocation): SetLog[] {
  const sets: SetLog[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp) continue;
    for (let done = 0; done < entry.targetSets; done++) {
      const id = `${entry.exerciseId}-${entry.tier}-${done + 1}`;
      sets.push(
        createSetLog({
          exercise: { ...entry, completedSets: done },
          actualReps: entry.targetReps,
          rpe: null,
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

function finish(
  started: ReturnType<typeof start>,
  alterSets: (sets: SetLog[]) => SetLog[] = (sets) => sets
) {
  const { session, plan, liftStates } = started;
  const result = computeCompletion({
    session,
    plan,
    sets: alterSets(perform(plan, session.location)),
    liftStates,
    settings: SETTINGS,
    recentE1RMsByExercise: {},
    currentExerciseIndex: plan.length,
    workoutStartTime: NOW,
    now: NOW,
  });
  const outcome = (exerciseId: string, tier: Tier) =>
    result.outcomes.find((o) => o.exerciseId === exerciseId && o.tier === tier);
  const updated = (exerciseId: string) =>
    result.liftStateUpdates.find((ls) => ls.exerciseId === exerciseId);
  return { outcome, updated, result };
}

const weightEdit = (exerciseId: string, tier: Tier, weight: number): PlanEdit => ({
  kind: "weight",
  exerciseId,
  tier,
  weight,
});

describe("a heavier weight on a program lift", () => {
  const started = start([weightEdit("squat", "T1", 200)]);

  it("says progression carries on from what is lifted, if every set is done that heavy", () => {
    expect(weightChangeEffect(started.entry("squat", "T1"), started.prescribed)).toBe("heavier");
    expect(started.lastStep("squat", "T1")).toEqual({
      id: "your-change",
      title: "Your change",
      detail:
        "You set 200 for today, heavier than the program asks for. If every set is done that heavy, progression carries on from what you lift. A missed rep at the heavier weight changes nothing: the program weight stays at 190.",
      effect: { op: "set", value: 200, unit: "lb" },
      ruleId: "off-program-credit",
    });
  });

  it("and a pass does build from the heavier weight", () => {
    const { outcome, updated } = finish(started);
    expect(outcome("squat", "T1")).toMatchObject({
      kind: "passed",
      reason: "heavier",
      from: { weight: 190 },
      to: { weight: 210 },
    });
    expect(updated("squat")!.t1Weight).toBe(210);
  });

  it("and a missed rep at the heavier weight changes nothing", () => {
    const { outcome, updated } = finish(started, (sets) =>
      sets.map((set) =>
        set.exerciseId === "squat" && set.setNumber === 5
          ? { ...set, actualReps: 2, status: "failed" as const }
          : set
      )
    );
    expect(outcome("squat", "T1")).toMatchObject({
      kind: "held",
      reason: "heavier",
      to: { weight: 190 },
    });
    expect(updated("squat")).toBeUndefined();
  });
});

describe("a lighter weight on a program lift", () => {
  const started = start([weightEdit("squat", "T1", 180)]);

  it("says the lift is only logged and the program weight stays", () => {
    expect(weightChangeEffect(started.entry("squat", "T1"), started.prescribed)).toBe("lighter");
    expect(started.lastStep("squat", "T1").detail).toBe(
      "You set 180 for today, lighter than the program asks for. The lift is only logged: the program weight stays at 190."
    );
  });

  it("and finishing leaves the lift exactly where it was", () => {
    const { outcome, updated } = finish(started);
    expect(outcome("squat", "T1")).toMatchObject({
      kind: "loggedOnly",
      from: { weight: 190 },
      to: { weight: 190 },
    });
    expect(updated("squat")).toBeUndefined();
  });
});

describe("a weight on a lift whose sets or reps were changed too", () => {
  const started = start([
    { kind: "scheme", exerciseId: "bench", tier: "T2", sets: 4, reps: 8 },
    weightEdit("bench", "T2", 110),
  ]);

  it("says the lift is only logged, heavier or not", () => {
    expect(weightChangeEffect(started.entry("bench", "T2"), started.prescribed)).toBe(
      "other-scheme"
    );
    expect(started.lastStep("bench", "T2").detail).toBe(
      "You set 110 for today. With the sets or reps changed as well, the lift is only logged: the program weight stays at 100."
    );
  });

  it("and finishing leaves the lift where it was", () => {
    const { outcome, updated } = finish(started);
    expect(outcome("bench", "T2")).toMatchObject({ kind: "loggedOnly", to: { weight: 100 } });
    expect(updated("bench")).toBeUndefined();
  });
});

describe("a swapped-in lift", () => {
  const started = start([
    { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "deadlift" },
    weightEdit("deadlift", "T2", 185),
  ]);

  it("is the user's choice from the first step: the program sets no weight for it", () => {
    const entry = started.entry("deadlift", "T2");
    expect(weightChangeEffect(entry, started.prescribed)).toBe("not-prescribed");
    const trace = explainPrescription(entry, started.context, started.plan);
    expect(trace.steps[0]).toMatchObject({ id: "your-choice", effect: { value: 185 } });
    expect(trace.steps.map((s) => s.id)).not.toContain("progression");
    for (const s of trace.steps) expect(s.detail).not.toMatch(/carries on/);
    expect(replayTrace(trace)).toBe(185);
  });

  it("is never said to carry progression on, in anything saved with the workout", () => {
    const saved = buildSessionDecisions(started.plan, started.context).filter(
      (trace) => trace.subject.exerciseId === "deadlift"
    );
    expect(saved.length).toBeGreaterThan(0);
    for (const trace of saved) {
      for (const s of trace.steps) expect(s.detail).not.toMatch(/carries on/);
    }
    const substitute = explainSubstitute(started.entry("deadlift", "T2"), started.context);
    expect(replayTrace(substitute)).toBe(185);
    for (const s of substitute.steps) expect(s.detail).not.toMatch(/carries on|program asks/);
  });

  it("and finishing changes neither the lift swapped in nor the one swapped out", () => {
    const { outcome, updated } = finish(started);
    expect(outcome("bench", "T2")).toMatchObject({ kind: "notDone", to: { weight: 100 } });
    expect(outcome("deadlift", "T2")).toBeUndefined();
    expect(updated("deadlift")).toBeUndefined();
    expect(updated("bench")).toBeUndefined();
  });
});

describe("an added accessory", () => {
  const started = start([
    { kind: "add", exerciseId: "face_pulls", sets: 3, reps: 15, weight: 40, isAMRAP: true },
  ]);

  it("says accessories are only logged", () => {
    expect(weightChangeEffect(started.entry("face_pulls", "accessory"), started.prescribed)).toBe(
      "accessory"
    );
    expect(started.lastStep("face_pulls", "accessory").detail).toBe(
      "You set 40 for today. Accessories are only logged: the program does not move their weight."
    );
  });

  it("and finishing gives it no outcome and changes no lift because of it", () => {
    const plain = finish(start([]));
    const { result } = finish(started);
    expect(result.outcomes).toEqual(plain.result.outcomes);
    expect(result.liftStateUpdates.map((ls) => ls.exerciseId)).toEqual(
      plain.result.liftStateUpdates.map((ls) => ls.exerciseId)
    );
  });
});

describe("a home substitute", () => {
  it("lighter than the conversion gives: only logged, the barbell weight stays", () => {
    const started = start([weightEdit("bench", "T2", 30)], "home");
    const entry = started.entry("bench", "T2");
    expect(entry.substituteExerciseId).toBe("db_bench");
    expect(weightChangeEffect(entry, started.prescribed)).toBe("lighter");
    const said =
      "You set 30 for today, lighter than the program asks for. The lift is only logged: the program weight stays at 100.";
    expect(started.lastStep("bench", "T2").detail).toBe(said);

    // The substitute trace starts from what the program asks for, not the scaled weight.
    const substitute = explainSubstitute(entry, started.context);
    expect(substitute.steps[0].detail).toBe("The program asks for 100 on this lift.");
    expect(substitute.steps.at(-1)!.detail).toBe(said);
    expect(replayTrace(substitute)).toBe(30);

    const { outcome, updated } = finish(started);
    expect(outcome("bench", "T2")).toMatchObject({ kind: "loggedOnly", to: { weight: 100 } });
    expect(updated("bench")).toBeUndefined();
  });

  it("heavier than the conversion gives: a pass builds from the heavier weight", () => {
    const started = start([weightEdit("bench", "T2", 50)], "home");
    const entry = started.entry("bench", "T2");
    expect(weightChangeEffect(entry, started.prescribed)).toBe("heavier");
    expect(started.lastStep("bench", "T2").detail).toMatch(
      /^You set 50 for today, heavier than the program asks for\. If every set is done that heavy, progression carries on from what you lift\./
    );
    const { outcome } = finish(started);
    expect(outcome("bench", "T2")).toMatchObject({ kind: "passed", reason: "heavier" });
    expect(outcome("bench", "T2")!.to.weight).toBeGreaterThan(entry.originalWeight!);
  });
});

describe("a warm-up set", () => {
  it("is never described as a weight the user set", () => {
    const started = start([], "home");
    const warmUps = started.plan.filter((e) => e.isWarmUp);
    expect(warmUps.length).toBeGreaterThan(0);
    for (const entry of warmUps) {
      expect(weightChangeEffect(entry, started.prescribed)).toBe("warm-up");
      for (const trace of [
        explainPrescription(entry, started.context, started.plan),
        explainSubstitute(entry, started.context),
      ]) {
        expect(replayTrace(trace)).toBe(entry.weight);
        for (const s of trace.steps) expect(s.detail).not.toMatch(/You set|carries on/);
      }
    }
  });
});

describe("what is saved with the workout", () => {
  it("is the case-by-case wording, for every edited lift of the plan", () => {
    const started = start([
      weightEdit("squat", "T1", 180),
      weightEdit("bench", "T2", 110),
      weightEdit("lat_pulldown", "T3", 100),
    ]);
    const decisions = buildSessionDecisions(started.plan, started.context);
    const said = (exerciseId: string, tier: Tier) =>
      findStoredDecision(decisions, "weight", exerciseId, tier)!.steps.at(-1)!.detail;
    expect(said("squat", "T1")).toMatch(/only logged: the program weight stays at 190\.$/);
    expect(said("bench", "T2")).toMatch(/progression carries on from what you lift\./);
    expect(said("lat_pulldown", "T3")).toMatch(/the program weight stays at 90\.$/);

    const { outcome } = finish(started);
    expect(outcome("squat", "T1")!.kind).toBe("loggedOnly");
    expect(outcome("bench", "T2")).toMatchObject({ kind: "passed", reason: "heavier" });
    // A T3 lift done heavier keeps the heavier weight.
    expect(outcome("lat_pulldown", "T3")).toMatchObject({
      kind: "t3Up",
      reason: "heavier",
      to: { weight: 100 },
    });
  });
});
