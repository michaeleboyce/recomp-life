// One resolution per lift: the prescription a session records and the plan it runs
// before edits are two views of the same `LiftResolution`s, for every planning case.
// Made-up data only.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { strengthSetsFrom } from "@/lib/data/forecasts";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { PrescribedEntry } from "@/types";
import { dueTemplateId } from "./rotation";
import { planFromLifts, prescriptionOf, resolveLifts } from "./liftResolution";
import { planWorkoutStart } from "./startPlan";
import { planningCases } from "./testPlanningCases";
import type { WorkoutPlan } from "./types";

const PROGRAM_TIERS = new Set(["T1", "T2", "T3"]);

/** A plan's program lifts as a prescription reads them: exercise performed, weight, scheme. */
function programView(plan: WorkoutPlan) {
  return plan
    .filter((e) => !e.isWarmUp && PROGRAM_TIERS.has(e.tier))
    .map((e) => ({
      liftId: e.exerciseId,
      tier: e.tier,
      exerciseId: e.substituteExerciseId ?? e.exerciseId,
      weight: e.weight,
      sets: e.targetSets,
      reps: e.targetReps,
      program: e.originalWeight ?? e.weight,
    }));
}

function prescribedView(prescribed: readonly PrescribedEntry[]) {
  return prescribed.map((p) => ({
    liftId: p.exerciseId,
    tier: p.tier,
    exerciseId: p.home?.exerciseId ?? p.exerciseId,
    weight: p.home?.weight ?? p.weight,
    sets: p.home?.sets ?? p.sets,
    reps: p.home?.reps ?? p.reps,
    program: p.weight,
  }));
}

describe("planWorkoutStart: one resolution for the prescription and the plan", () => {
  const cases = planningCases();

  it("covers home and gym starts, home exercises and set plans", () => {
    expect(cases.length).toBe(96);
  });

  it("records the prescription the plan has before edits, for every case", () => {
    for (const c of cases) {
      const template = WORKOUT_TEMPLATES[dueTemplateId(c.records.workouts)];
      const input = {
        template,
        liftStates: c.records.liftStates,
        location: c.location,
        equipment: c.settings.equipment,
        includeWarmUps: true,
        selectedAccessories: [],
        variantStates: c.records.variantStates ?? [],
        strengthSets: strengthSetsFrom(c.records),
        ...(c.overrides ? { overrides: c.overrides } : {}),
      };
      const start = planWorkoutStart({ ...input, edits: c.editsFor(template), nextSetPlans: c.settings.nextSetPlans });
      const unedited = planWorkoutStart(input);

      // The prescription is read from the lifts, and so is the plan before edits.
      expect(start.prescribed, c.name).toEqual(prescriptionOf(start.lifts));
      expect(unedited.plan, c.name).toEqual(planFromLifts(start.lifts, input));
      expect(prescribedView(start.prescribed), c.name).toEqual(programView(unedited.plan));
      // Edits and set plans change the plan, never the prescription.
      expect(unedited.prescribed, c.name).toEqual(start.prescribed);
    }
  });
});

describe("resolveLifts", () => {
  const cases = planningCases();
  const home = cases.find((c) => c.location === "home" && c.index === 0)!;
  const gym = cases.find((c) => c.location === "gym" && c.index === 0)!;
  const template = WORKOUT_TEMPLATES.A1;

  it("resolves the lift itself at the gym, with the program's prescription", () => {
    const lifts = resolveLifts({
      template,
      liftStates: gym.records.liftStates,
      location: "gym",
      equipment: gym.settings.equipment,
    });
    expect(lifts.map((l) => [l.liftId, l.tier, l.exerciseId])).toEqual([
      ["squat", "T1", "squat"],
      ["bench", "T2", "bench"],
      ["lat_pulldown", "T3", "lat_pulldown"],
    ]);
    for (const lift of lifts) {
      expect(lift.home).toBeUndefined();
      expect(lift.weight).toBe(lift.program.weight);
    }
  });

  it("resolves a home exercise at home, keeping the barbell weight it stands for", () => {
    const lifts = resolveLifts({
      template,
      liftStates: home.records.liftStates,
      location: "home",
      equipment: home.settings.equipment,
      variantStates: home.records.variantStates,
    });
    const squat = lifts.find((l) => l.liftId === "squat")!;
    expect(squat.exerciseId).not.toBe("squat");
    expect(squat.home?.variantId).toBe(`squat|${squat.exerciseId}|T1`);
    expect(squat.program.weight).toBe(home.records.liftStates.find((s) => s.exerciseId === "squat")!.t1Weight);
    expect(squat.weight).toBeLessThanOrEqual(home.settings.equipment.maxDumbbellWeight);
  });
});
