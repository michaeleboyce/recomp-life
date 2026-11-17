import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { planWorkoutStart } from "@/lib/workout/startPlan";
import { seedVariantState, seedVariantWeight, targetStrengthSets, variantKey } from "@/lib/workout/variant";
import { strengthSetOf } from "@/lib/workout/strength";
import { makeSets } from "@/lib/workout/testFixtures";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, VariantState } from "@/types";
import {
  homeNextSession,
  homePlanWeight,
  homeScheme,
  homeSubstitutesOf,
  homeWeightLine,
  isPerHand,
  programLiftFor,
  validHomeSubstitute,
  withHomeAdjustment,
  type HomeNextSession,
  type HomePlanContext,
} from "./homeVersion";

const equipment = DEFAULT_USER_PROFILE.settings.equipment;

describe("home substitutes", () => {
  it("lists the dumbbell alternative and the fallback chain", () => {
    expect(homeSubstitutesOf("squat")).toEqual(["goblet_squat", "bulgarian_split_squat", "db_lunge"]);
    expect(homeSubstitutesOf("bench")).toContain("db_floor_press");
  });

  it("accepts only a known substitute of this lift", () => {
    expect(validHomeSubstitute("squat", "goblet_squat")).toBe("goblet_squat");
    expect(validHomeSubstitute("squat", "db_bench")).toBeUndefined();
    expect(validHomeSubstitute("squat", "nonsense")).toBeUndefined();
    expect(validHomeSubstitute("squat", null)).toBeUndefined();
  });

  it("finds the program lift a substitute counts toward", () => {
    expect(programLiftFor("goblet_squat")).toBe("squat");
    expect(programLiftFor("db_floor_press")).toBe("bench");
    expect(programLiftFor("single_leg_db_rdl")).toBe("deadlift");
    expect(programLiftFor("hammer_curls")).toBeUndefined();
  });

  it("knows per-hand weights", () => {
    expect(isPerHand("db_bench")).toBe(true);
    expect(isPerHand("goblet_squat")).toBe(false);
  });
});

const lift = (over: Partial<LiftState> = {}): LiftState => ({ ...INITIAL_LIFT_STATES.squat, ...over });
const bss = (over: Partial<VariantState> = {}): VariantState => ({
  ...seedVariantState({ liftId: "squat", exerciseId: "bulgarian_split_squat", tier: "T1", liftState: lift(), equipment }),
  weight: 70,
  current: true,
  lastSessionDate: new Date(2026, 10, 1),
  ...over,
});
const done = (templateId: string, day: number) => ({
  templateId,
  startedAt: new Date(2026, 10, day),
  completedAt: new Date(2026, 10, day),
});

function context(
  over: { liftStates?: LiftState[]; variantStates?: VariantState[]; completed?: ReturnType<typeof done>[] } = {}
): HomePlanContext {
  const liftStates = over.liftStates ?? [lift()];
  const variantStates = over.variantStates ?? [];
  const next = describeNextWorkout({
    completedWorkouts: over.completed ?? [],
    templates: WORKOUT_TEMPLATES,
    liftStates,
    plan: { location: "home", equipment, includeWarmUps: true, selectedAccessories: [], variantStates },
    reentry: true,
  });
  return { next, liftStates, variantStates, equipment };
}

const squatEntry = (ctx: HomePlanContext) => ctx.next!.plan!.find((e) => !e.isWarmUp && e.exerciseId === "squat")!;

describe("homeNextSession", () => {
  it("is the plan entry Today shows when the next home workout does the lift as this exercise", () => {
    const ctx = context({ liftStates: [lift({ t1Weight: 245 })], variantStates: [bss()] });
    expect(squatEntry(ctx).substituteExerciseId).toBe("bulgarian_split_squat");
    const next = homeNextSession("squat", "bulgarian_split_squat", ctx);
    // Its own weight, not 80% of the 245 lbs barbell squat.
    expect(next).toMatchObject({
      tier: "T1",
      weight: 70,
      perHand: true,
      sets: 5,
      reps: 3,
      isAMRAP: true,
      stage: "5x3",
      barbellWeight: 245,
      atCap: false,
    });
    expect(next.variant?.weight).toBe(70);
    expect(next.seed).toBeUndefined();
    expect(homeScheme(next)).toBe("5×3+");
  });

  it("plans the next workout in the rotation that has the lift when the next one does not", () => {
    // After A1 the next workout is B1 (no squat); squat comes back as A2's T2.
    const t2: VariantState = {
      ...bss(),
      id: variantKey("squat", "bulgarian_split_squat", "T2"),
      tier: "T2",
      stage: "3x10",
      weight: 50,
    };
    const ctx = context({ variantStates: [bss(), t2], completed: [done("A1", 2)] });
    expect(ctx.next!.templateId).toBe("B1");
    expect(homeNextSession("squat", "bulgarian_split_squat", ctx)).toMatchObject({
      tier: "T2",
      weight: 50,
      sets: 3,
      reps: 10,
      isAMRAP: false,
      stage: "3x10",
    });
  });

  it("gives the session at a tier when one is asked for", () => {
    const ctx = context({ variantStates: [bss()] });
    expect(homeNextSession("squat", "bulgarian_split_squat", ctx, "T1").weight).toBe(70);
    expect(homeNextSession("squat", "bulgarian_split_squat", ctx, "T2").tier).toBe("T2");
  });

  it("a first time comes from the seed the plan used", () => {
    const ctx = context({ liftStates: [lift({ t1Weight: 190 })] });
    const entry = squatEntry(ctx);
    const next = homeNextSession("squat", entry.substituteExerciseId!, ctx);
    expect(next.weight).toBe(entry.weight);
    expect(next.seed).toEqual(entry.seed);
    expect(next.variant).toBeUndefined();
  });

  it("names the exercise the plan picked, and gives this one the weight the plan would give it", () => {
    const ctx = context({ liftStates: [lift({ t1Weight: 245 })], variantStates: [bss()] });
    const next = homeNextSession("squat", "db_lunge", ctx);
    expect(next.plannedAs).toBe("bulgarian_split_squat");
    const picked = planWorkoutStart({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: ctx.liftStates,
      location: "home",
      equipment,
      includeWarmUps: false,
      selectedAccessories: [],
      variantStates: ctx.variantStates,
      overrides: { squat: "db_lunge" },
    }).plan.find((e) => e.exerciseId === "squat")!;
    expect(picked.substituteExerciseId).toBe("db_lunge");
    expect(next.weight).toBe(picked.weight);
    expect(next.seed).toEqual(picked.seed);
  });

  it("takes the re-entry weight back at home after barbell sessions", () => {
    // The barbell squat was done after the last split squat session, and passed twice.
    const ctx = context({
      liftStates: [lift({ t1Weight: 245, t1LastWorkoutDate: new Date(2026, 10, 5) })],
      variantStates: [bss({ weight: 60, gymPassesSinceHome: 2 })],
    });
    const entry = squatEntry(ctx);
    expect(entry.reentry?.location).toBe("home");
    const next = homeNextSession("squat", "bulgarian_split_squat", ctx);
    expect(next.weight).toBe(entry.weight);
    expect(next.reentry).toEqual(entry.reentry);
    expect(homeWeightLine("squat", "squat", "bulgarian_split_squat", next, equipment)).toEqual({
      text: expect.stringMatching(
        /^Back at home after barbell sessions: your last 60 plus 2 steps the barbell passes earned is 70/
      ),
      ruleId: "strength-pooling",
    });
  });
});

describe("homeWeightLine", () => {
  const session = (over: Partial<HomeNextSession> = {}): HomeNextSession => ({
    tier: "T1",
    weight: 70,
    perHand: true,
    sets: 5,
    reps: 3,
    isAMRAP: true,
    stage: "5x3",
    barbellWeight: 245,
    atCap: false,
    ...over,
  });
  const line = (over: Partial<HomeNextSession>) =>
    homeWeightLine("squat", "squat", "bulgarian_split_squat", session(over), equipment);

  it("says a weight of its own moves by the dumbbell step, never by the barbell", () => {
    expect(line({ variant: bss({ passesSinceGym: 2 }) })).toEqual({
      text: "Its own weight from your home sessions: each pass adds 5 lbs a hand. 2 passes at home since the barbell squat was last done.",
      ruleId: "home-progression",
    });
  });

  it("says how a first weight was seeded", () => {
    expect(line({ seed: { source: "ratio", barbellWeight: 190, ratio: 0.7 } })).toEqual({
      text: "A first time: 0.70 of your 190 lbs barbell squat, split between two dumbbells, rounded to 5 lbs.",
      ruleId: "transfer-ratio",
    });
    expect(
      line({ seed: { source: "estimate", barbellWeight: 190, ratio: 0.7, estimate: 230, targetReps: 3 } }).text
    ).toBe("A first time: from your squat strength estimate, 230, at 0.70 of it, the heaviest for 3 reps, rounded down to 5 lbs.");
    expect(line({ seed: { source: "conversion", barbellWeight: 190 } })).toEqual({
      text: "A first time: 80% of your 190 lbs barbell squat, split between two dumbbells, rounded to 5 lbs.",
      ruleId: "dumbbell-conversion",
    });
  });

  it("at the heaviest dumbbell, names the cap policy's next step", () => {
    expect(line({ weight: 80, atCap: true, variant: bss({ weight: 80 }) })).toEqual({
      text: "Its own weight from your home sessions: each pass adds 5 lbs a hand. 80 is your heaviest dumbbell: a pass adds 1 rep a set.",
      ruleId: "cap-progression",
    });
    const goblet = session({
      weight: 80,
      perHand: false,
      atCap: true,
      cappedFrom: 95,
      seed: { source: "ratio", barbellWeight: 245, ratio: 0.45, cappedFrom: 95 },
    });
    expect(homeWeightLine("squat", "squat", "goblet_squat", goblet, equipment).text).toBe(
      "A first time: 0.45 of your 245 lbs barbell squat, in one dumbbell, rounded to 5 lbs. That asks for 95 lbs, more than your heaviest dumbbell. 80 is your heaviest dumbbell: a pass moves to Bulgarian split squat, at a load no lighter."
    );
  });

  it("says a weight set by hand since the barbell session stays as set", () => {
    const reentry = {
      rule: "hand" as const,
      weight: 65,
      fromSteps: null,
      fromEstimate: null,
      stepsEarned: 4,
      targetReps: 3,
      location: "home" as const,
      lastWeight: 65,
      estimate: null,
      setByHandAt: new Date(2026, 10, 16),
    };
    expect(line({ weight: 65, reentry, variant: bss({ weight: 65 }) })).toEqual({
      text: "You set it by hand on Nov 16, after your last barbell session, so it stays at 65 lbs a hand.",
      ruleId: "home-progression",
    });
  });

  it("is empty with no weight", () => {
    expect(line({ weight: 0 }).text).toBe("");
  });
});

describe("withHomeAdjustment", () => {
  it("sets the home exercise's own weight and stage and leaves the barbell lift alone", () => {
    const liftStates = [lift({ t1Weight: 245 })];
    const next = withHomeAdjustment([bss({ gymPassesSinceHome: 1 })], liftStates, equipment, {
      liftId: "squat",
      exerciseId: "bulgarian_split_squat",
      tier: "T1",
      weight: 75,
      stage: "6x2",
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ weight: 75, stage: "6x2" });
    expect(next[0].gymPassesSinceHome).toBeUndefined();
    expect(liftStates[0].t1Weight).toBe(245);
    const ctx = context({ liftStates, variantStates: next });
    expect(homeNextSession("squat", "bulgarian_split_squat", ctx)).toMatchObject({ weight: 75, sets: 6, reps: 2 });
  });

  it("previews a weight set by hand as planned, even where re-entry would bound it", () => {
    const liftStates = [lift({ t1Weight: 245, t1LastWorkoutDate: new Date(2026, 10, 5) })];
    const variantStates = [bss({ weight: 60, gymPassesSinceHome: 2 })];
    const next = withHomeAdjustment(variantStates, liftStates, equipment, {
      liftId: "squat",
      exerciseId: "bulgarian_split_squat",
      tier: "T1",
      weight: 75,
      at: new Date(2026, 10, 16),
    });
    expect(next[0].setByHandAt).toEqual(new Date(2026, 10, 16));
    const session = homeNextSession("squat", "bulgarian_split_squat", context({ liftStates, variantStates: next }));
    expect(session).toMatchObject({ weight: 75, reentry: { rule: "hand" } });
  });

  it("seeds an exercise with no state of its own", () => {
    const next = withHomeAdjustment([], [lift()], equipment, {
      liftId: "squat",
      exerciseId: "goblet_squat",
      tier: "T1",
      weight: 40,
    });
    expect(next[0]).toMatchObject({ id: variantKey("squat", "goblet_squat", "T1"), weight: 40, perHand: false });
  });
});

describe("a home weight set by hand", () => {
  const at = new Date(2026, 10, 16);
  const liftStates = [lift({ t1Weight: 245 })];
  const setTo = (weight: number, backToPlan = false) =>
    withHomeAdjustment([bss()], liftStates, equipment, {
      liftId: "squat",
      exerciseId: "bulgarian_split_squat",
      tier: "T1",
      weight,
      at,
      backToPlan,
    });

  it("keeps the plan's weight beside it, and the plan's weight is worked out without it", () => {
    const variantStates = setTo(80);
    expect(variantStates[0]).toMatchObject({ weight: 80, plannedWeight: 70 });
    const ctx = { ...context({ liftStates, variantStates }), strengthSets: targetStrengthSets(variantStates) };
    const next = homeNextSession("squat", "bulgarian_split_squat", ctx);
    expect(next.weight).toBe(80);
    expect(homePlanWeight("squat", "bulgarian_split_squat", ctx, next)).toBe(70);
  });

  it("has no plan weight to show without an override, or once put back", () => {
    for (const variantStates of [[bss()], setTo(65, true)]) {
      const ctx = context({ liftStates, variantStates });
      const next = homeNextSession("squat", "bulgarian_split_squat", ctx);
      expect(homePlanWeight("squat", "bulgarian_split_squat", ctx, next)).toBeNull();
    }
  });

  it("moves the squat estimate, and so the first weight of another squat substitute", () => {
    const gym = makeSets("squat", "T1", 5, 3, { weight: 245, completedAt: new Date(2026, 10, 10) }).map((s, i, all) =>
      strengthSetOf(i === all.length - 1 ? { ...s, isAMRAP: true, actualReps: 5 } : s, "gym")
    );
    const lunge = (strengthSets: ReturnType<typeof targetStrengthSets>) =>
      seedVariantWeight({
        liftId: "squat",
        exerciseId: "db_lunge",
        tier: "T1",
        barbellWeight: 245,
        targetReps: 3,
        equipment: { ...equipment, maxDumbbellWeight: 200 },
        strengthSets,
      });
    const without = lunge(gym);
    const withTarget = lunge([...gym, ...targetStrengthSets(setTo(110))]);
    expect(without.source).toBe("estimate");
    expect(withTarget.estimate!).toBeGreaterThan(without.estimate!);
    expect(withTarget.weight).toBeGreaterThanOrEqual(without.weight);
  });
});
