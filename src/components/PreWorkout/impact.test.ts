import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { buildWorkoutPlan, prescribedFor } from "@/lib/workout";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { PlanEdit } from "@/types";
import { computeImpact } from "./impact";

const template = WORKOUT_TEMPLATES.A1;
const liftStates = Object.values(INITIAL_LIFT_STATES).map((ls) => ({ ...ls, synced: true }));
const prescribed = prescribedFor(template, liftStates);
const bench = prescribed.find((p) => p.exerciseId === "bench")!;

function impactOf(edits: PlanEdit[]) {
  const plan = buildWorkoutPlan({
    template,
    liftStates,
    location: "gym",
    equipment: DEFAULT_USER_PROFILE.settings.equipment,
    includeWarmUps: false,
    selectedAccessories: [],
    edits,
  });
  return computeImpact(plan, prescribed, edits);
}

describe("computeImpact", () => {
  it("is empty without edits", () => {
    expect(impactOf([])).toEqual([]);
  });

  it("marks an edited lift done as prescribed as program", () => {
    const items = impactOf([{ kind: "weight", exerciseId: "bench", tier: "T2", weight: bench.weight }]);
    expect(items.find((i) => i.exerciseId === "bench")).toMatchObject({ status: "program", edited: true });
    expect(items.find((i) => i.exerciseId === "squat")).toMatchObject({ status: "program", edited: false });
  });

  it("marks a lighter or different-scheme lift as logged only", () => {
    const lighter = impactOf([{ kind: "weight", exerciseId: "bench", tier: "T2", weight: bench.weight - 5 }]);
    expect(lighter.find((i) => i.exerciseId === "bench")?.status).toBe("logged-only");
    const scheme = impactOf([{ kind: "scheme", exerciseId: "bench", tier: "T2", sets: 2, reps: 10 }]);
    expect(scheme.find((i) => i.exerciseId === "bench")?.status).toBe("logged-only");
  });

  it("lists a removed or swapped-out lift as not done, and the replacement as logged only", () => {
    const items = impactOf([
      { kind: "remove", exerciseId: "bench", tier: "T2" },
      { kind: "swap", exerciseId: "lat_pulldown", tier: "T3", replacementId: "face_pulls" },
    ]);
    expect(items).toContainEqual({ exerciseId: "bench", tier: "T2", status: "not-done", edited: true });
    expect(items).toContainEqual({ exerciseId: "lat_pulldown", tier: "T3", status: "not-done", edited: true });
    expect(items).toContainEqual({ exerciseId: "face_pulls", tier: "T3", status: "logged-only", edited: true });
  });

  it("leaves added accessories out", () => {
    const items = impactOf([
      { kind: "add", exerciseId: "face_pulls", sets: 3, reps: 12, weight: 30, isAMRAP: false },
    ]);
    expect(items.some((i) => i.exerciseId === "face_pulls")).toBe(false);
  });

  it("marks a program lift set heavier than prescribed", () => {
    const heavier = impactOf([
      { kind: "weight", exerciseId: "bench", tier: "T2", weight: bench.weight + 10 },
    ]).find((item) => item.exerciseId === "bench")!;
    expect(heavier).toMatchObject({ status: "program", heavier: true });

    const same = impactOf([
      { kind: "weight", exerciseId: "bench", tier: "T2", weight: bench.weight },
    ]).find((item) => item.exerciseId === "bench")!;
    expect(same.heavier).toBeUndefined();
  });
});
