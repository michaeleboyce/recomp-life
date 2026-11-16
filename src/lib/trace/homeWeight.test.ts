import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { isRuleId } from "@/lib/evidence";
import { day, t1Session } from "@/lib/strength/testHelpers";
import { seedVariantState, variantKey } from "@/lib/workout/variant";
import type { VariantState } from "@/types";
import { applySteps } from "./replay";
import { homeWeightSteps } from "./homeWeight";
import type { PlanEntry, TraceContext } from "./types";

const equipment = { ...DEFAULT_USER_PROFILE.settings.equipment, maxDumbbellWeight: 80 };

function variant(over: Partial<VariantState> = {}): VariantState {
  const base = seedVariantState({
    liftId: "squat",
    exerciseId: "bulgarian_split_squat",
    tier: "T1",
    liftState: undefined,
    equipment,
  });
  return { ...base, weight: 75, passesSinceGym: 2, current: true, ...over };
}

function entry(v: VariantState, over: Partial<PlanEntry> = {}): PlanEntry {
  return {
    exerciseId: "squat",
    substituteExerciseId: v.exerciseId,
    tier: "T1",
    targetSets: 5,
    targetReps: 3,
    weight: v.weight,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 0,
    variantId: variantKey("squat", v.exerciseId, "T1"),
    perHand: v.perHand,
    ...over,
  };
}

const sets = [
  ...t1Session({ sessionId: "g1", exerciseId: "squat", weight: 205, amrapReps: 5, day: 0 }),
  ...t1Session({ sessionId: "h1", exerciseId: "bulgarian_split_squat", weight: 75, amrapReps: 8, day: 3, perHand: true }),
];

function context(over: Partial<TraceContext> = {}): TraceContext {
  return {
    now: day(5),
    location: "home",
    equipment,
    phase: { mode: "maintaining" },
    liftStates: [],
    ...over,
  };
}

describe("homeWeightSteps", () => {
  it("adds nothing without home inputs", () => {
    const v = variant();
    expect(homeWeightSteps(entry(v), context())).toEqual([]);
  });

  it("says where a home weight came from, how much of the estimate is home sets and which sets", () => {
    const v = variant();
    const steps = homeWeightSteps(entry(v), context({ home: { variantStates: [v], sets } }));
    const titles = steps.map((s) => s.title);
    expect(titles[0]).toBe("Your home weight");
    expect(titles[1]).toBe("Strength estimate");
    expect(titles[2]).toMatch(/^From home sets: Bulgarian Split Squat 75×8 ≈ squat \d+ \(ratio 0\.70 from 1 pair\)$/);
    expect(steps[0].detail).toContain("2 passes at home");
    expect(steps[1].detail).toMatch(/\d+% from home sets/);
    expect(steps.map((s) => s.ruleId)).toEqual(["home-progression", "strength-pooling", "transfer-ratio"]);
    expect(applySteps(steps).lb).toBe(75);
    for (const s of steps) expect(isRuleId(s.ruleId!)).toBe(true);
  });

  it("names the cap: a harder variant, or more reps", () => {
    const squat = variant({ exerciseId: "goblet_squat", perHand: false, weight: 80, id: variantKey("squat", "goblet_squat", "T1") });
    const harder = homeWeightSteps(entry(squat), context({ home: { variantStates: [squat] } }));
    const cap = harder.find((s) => s.title === "At the dumbbell cap");
    expect(cap?.detail).toContain("Bulgarian Split Squat");
    expect(cap?.ruleId).toBe("cap-progression");

    const bss = variant({ weight: 80 });
    const reps = homeWeightSteps(
      entry(bss),
      context({ home: { variantStates: [bss], cap: { policy: "reps", maxDumbbellWeight: 80, repsFrom: 3, repsTo: 4 } } })
    ).find((s) => s.title === "At the dumbbell cap");
    expect(reps?.detail).toContain("3 to 4 a set");
    const below = variant();
    expect(homeWeightSteps(entry(below), context({ home: { variantStates: [below] } })).some((s) => s.title === "At the dumbbell cap")).toBe(false);
  });

  it("says which re-entry rule decided back at the gym, and skips the step when none is given", () => {
    const e: PlanEntry = { ...entry(variant()), substituteExerciseId: undefined, variantId: undefined, weight: 215 };
    const gym = context({ location: "gym" });
    expect(homeWeightSteps(e, { ...gym, home: {} })).toEqual([]);
    const [step] = homeWeightSteps(e, {
      ...gym,
      home: { reentry: { rule: "estimate", weight: 215, fromSteps: 225, fromEstimate: 215, stepsEarned: 2, targetReps: 3 } },
    });
    expect(step.title).toBe("Back at the gym");
    expect(step.detail).toContain("2 steps");
    expect(step.detail).toContain("The estimate is the smaller, so it decides.");
    expect(step.ruleId).toBe("strength-pooling");
    expect(applySteps([step]).lb).toBe(215);
  });
});
