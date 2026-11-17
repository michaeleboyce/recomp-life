import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { isRuleId } from "@/lib/evidence";
import { day, t1Session } from "@/lib/strength/testHelpers";
import { seedVariantState, variantKey } from "@/lib/workout/variant";
import type { VariantState } from "@/types";
import { applySteps } from "./replay";
import { capNextStep, homeWeightSteps } from "./homeWeight";
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

  it("names sets imported from another app as imported, not as home sets", () => {
    const v = variant();
    const withImported = sets.map((s) => (s.sessionId === "h1" ? { ...s, imported: true as const } : s));
    const steps = homeWeightSteps(entry(v), context({ home: { variantStates: [v], sets: withImported } }));
    expect(steps[2].title).toMatch(/^From imported sets: Bulgarian Split Squat 75×8 ≈ squat \d+/);
    expect(steps[2].detail).toMatch(/^That imported session's estimated max/);
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

  it("says how the first weight was seeded, for every seed source", () => {
    const own = (seed: VariantState["seed"]) => {
      const v = variant({ seed });
      return homeWeightSteps(entry(v), context({ home: { variantStates: [v] } }))[0].detail;
    };
    expect(own({ source: "estimate", barbellWeight: 245, ratio: 0.78, estimate: 262, targetReps: 3 })).toContain(
      "It started from your squat strength estimate, 262, at 0.78 of it: the heaviest for 3 reps."
    );
    expect(own({ source: "ratio", barbellWeight: 245, ratio: 0.7 })).toContain(
      "It started at 0.70 of the program's 245 barbell weight (the exercise's starting ratio)."
    );
    expect(own({ source: "conversion", barbellWeight: 245 })).toContain(
      "It started from the program's 245 barbell weight, converted to dumbbells (80%)."
    );
    expect(own({ source: "harderVariant", barbellWeight: 245, fromVariantId: "squat|goblet_squat|T1" })).toContain(
      "It started here when Goblet Squat reached the heaviest dumbbell, at a load no lighter."
    );
    // A seed that asked for more than the heaviest dumbbell says so.
    expect(own({ source: "ratio", barbellWeight: 300, ratio: 0.7, cappedFrom: 105 })).toContain(
      "That asked for 105, so it started at your heaviest dumbbell."
    );
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

  it("says a weight set by hand since the other location's last session stays as set", () => {
    const e: PlanEntry = { ...entry(variant()), substituteExerciseId: undefined, variantId: undefined, weight: 200 };
    const setByHandAt = new Date(2026, 10, 16, 9);
    const [gym] = homeWeightSteps(e, {
      ...context({ location: "gym" }),
      home: {
        reentry: { rule: "hand", weight: 200, fromSteps: null, fromEstimate: null, location: "gym", setByHandAt },
      },
    });
    expect(gym.title).toBe("Back at the gym");
    expect(gym.detail).toBe(
      "You set this weight by hand on Nov 16, after your last home session, so re-entry leaves it as it is."
    );
    expect(applySteps([gym]).lb).toBe(200);

    const v = variant({ weight: 65 });
    const home = homeWeightSteps(entry(v, { weight: 65 }), {
      ...context(),
      home: {
        variantStates: [v],
        reentry: { rule: "hand", weight: 65, fromSteps: null, fromEstimate: null, location: "home", setByHandAt },
      },
    }).find((s) => s.title === "Back at home")!;
    expect(home.detail).toContain("set this weight by hand on Nov 16, after your last barbell session");
  });
});

describe("capNextStep", () => {
  const at = (exerciseId: string, weight: number, tier: "T1" | "T2" | "T3" = "T1") => ({
    liftId: "squat",
    exerciseId,
    tier,
    weight,
    perHand: exerciseId !== "goblet_squat",
  });

  it("moves a capped exercise to its harder variant when the dumbbells give it a load no lighter", () => {
    expect(capNextStep(at("goblet_squat", 80), equipment)).toEqual({
      policy: "harderVariant",
      exerciseId: "bulgarian_split_squat",
    });
  });

  it("adds reps when there is no harder variant", () => {
    expect(capNextStep(at("bulgarian_split_squat", 80), equipment)).toEqual({ policy: "reps", reps: 1 });
    expect(capNextStep(at("bulgarian_split_squat", 80, "T2"), equipment)).toEqual({ policy: "reps", reps: 2 });
  });

  it("adds reps when the harder variant could not be loaded as heavy", () => {
    // A goblet squat with one 80 lb dumbbell needs 40 a hand on the split squat: more than 35.
    expect(capNextStep(at("goblet_squat", 80), { ...equipment, maxDumbbellWeight: 35 })).toEqual({
      policy: "reps",
      reps: 1,
    });
  });

  it("keeps T3 at as many reps as you can", () => {
    expect(capNextStep(at("bulgarian_split_squat", 80, "T3"), equipment)).toEqual({ policy: "none" });
  });
});
