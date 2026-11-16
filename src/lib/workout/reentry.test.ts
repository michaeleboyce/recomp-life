import { describe, expect, it } from "vitest";
import { rebuildDerived } from "@/lib/rebuild";
import {
  FAIL,
  rebuildInput,
  runSession,
  sortedVariants,
  startSim,
  stateOf,
  variantOf,
} from "@/lib/rebuild/testHelpers";
import {
  barbellReentryWeight,
  homeReentryWeight,
  learnTransferRatio,
  pooledLiftEstimate,
  type StrengthSet,
} from "@/lib/strength";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, VariantState } from "@/types";
import { buildWorkoutPlan, describeNextWorkout } from "./buildPlan";
import { markReentries, reentryKey, resolveReentry } from "./reentry";
import { planWorkoutStart } from "./startPlan";
import { strengthSetsOf } from "./strength";
import { EQUIPMENT, seedLiftStates } from "./testFixtures";
import { seedVariantState } from "./variant";

const DAY = 86_400_000;
const at = (day: number) => new Date(Date.UTC(2026, 9, 1) + day * DAY);

const squat = (overrides: Partial<LiftState> = {}): LiftState => ({
  ...seedLiftStates().find((ls) => ls.exerciseId === "squat")!,
  ...overrides,
});

function split(overrides: Partial<VariantState> = {}): VariantState {
  return {
    ...seedVariantState({ liftId: "squat", exerciseId: "bulgarian_split_squat", tier: "T1", liftState: squat(), equipment: EQUIPMENT }),
    current: true,
    ...overrides,
  };
}

/** A T1 session of `exerciseId` whose last set is `reps` at `weight`. */
function t1Session(sessionId: string, exerciseId: string, weight: number, reps: number, day: number, perHand = false): StrengthSet[] {
  const date = at(day);
  return [
    { id: `${sessionId}-1`, sessionId, exerciseId, weight, perHand, reps: 3, role: "working", tier: "T1", isAMRAP: false, date },
    { id: `${sessionId}-2`, sessionId, exerciseId, weight, perHand, reps, role: "working", tier: "T1", isAMRAP: true, date },
  ];
}

describe("resolveReentry at the gym (H6)", () => {
  const liftStates = [squat({ t1Weight: 190, t1LastWorkoutDate: at(0) })];

  it("takes the smaller of the last weight plus the home steps and what the estimate allows", () => {
    const variants = [split({ weight: 55, lastSessionDate: at(10), passesSinceGym: 2 })];
    const sets = [...t1Session("gym", "squat", 190, 8, 0), ...t1Session("home", "bulgarian_split_squat", 55, 8, 10, true)];
    const resolved = resolveReentry({ liftStates, variantStates: variants, location: "gym", equipment: EQUIPMENT, strengthSets: sets });

    const estimate = pooledLiftEstimate("squat", sets)!.value;
    const expected = barbellReentryWeight({
      lastWeight: 190,
      stepsEarned: 2,
      stepLbs: EQUIPMENT.gymBarbellIncrementLbs * 2,
      estimate,
      targetReps: 3,
      equipment: EQUIPMENT,
    })!;
    expect(stateOf(resolved.liftStates, "squat").t1Weight).toBe(expected.weight);
    expect(resolved.reentries.get(reentryKey("squat", "T1"))).toEqual({
      rule: expected.rule,
      weight: expected.weight,
      fromSteps: 210,
      fromEstimate: expected.fromEstimate,
      stepsEarned: 2,
      targetReps: 3,
      location: "gym",
      lastWeight: 190,
      estimate,
    });
  });

  it("lets a low estimate decide, and with no estimate the steps alone", () => {
    const variants = [split({ weight: 40, lastSessionDate: at(10), passesSinceGym: 3 })];
    // A barbell estimate of round(150 x 1.1) = 165 allows 150 for 3 reps.
    const low = resolveReentry({ liftStates, variantStates: variants, location: "gym", equipment: EQUIPMENT, strengthSets: t1Session("gym", "squat", 150, 3, 0) });
    expect(low.reentries.get("squat|T1")).toMatchObject({ rule: "estimate", weight: 150, fromSteps: 220 });
    const none = resolveReentry({ liftStates, variantStates: variants, location: "gym", equipment: EQUIPMENT });
    expect(none.reentries.get("squat|T1")).toMatchObject({ rule: "steps", weight: 220, fromEstimate: null, estimate: null });
  });

  it("changes nothing when the barbell lift was done after the last home session", () => {
    const variants = [split({ weight: 55, lastSessionDate: at(-3), passesSinceGym: 2 })];
    const resolved = resolveReentry({ liftStates, variantStates: variants, location: "gym", equipment: EQUIPMENT });
    expect(resolved.reentries.size).toBe(0);
    expect(resolved.liftStates).toEqual(liftStates);
  });
});

describe("resolveReentry at home (H6)", () => {
  const liftStates = [squat({ t1Weight: 210, t1LastWorkoutDate: at(20) })];

  it("takes the smaller of the home weight plus the gym steps and what the estimate allows through the ratio", () => {
    const variants = [split({ weight: 55, lastSessionDate: at(10), gymPassesSinceHome: 2 })];
    const sets = [...t1Session("home", "bulgarian_split_squat", 55, 8, 10, true), ...t1Session("gym", "squat", 210, 6, 20)];
    const resolved = resolveReentry({ liftStates, variantStates: variants, location: "home", equipment: EQUIPMENT, strengthSets: sets });

    const ratio = learnTransferRatio("squat", "bulgarian_split_squat", sets)!.ratio;
    const estimate = pooledLiftEstimate("squat", sets)!.value;
    const expected = homeReentryWeight({
      lastWeight: 55,
      stepsEarned: 2,
      estimate,
      ratio,
      exerciseId: "bulgarian_split_squat",
      targetReps: 3,
      equipment: EQUIPMENT,
    })!;
    expect(variantOf(resolved.variantStates, "squat|bulgarian_split_squat|T1").weight).toBe(expected.weight);
    expect(resolved.reentries.get("squat|T1")).toMatchObject({
      rule: expected.rule,
      weight: expected.weight,
      fromSteps: 65,
      location: "home",
      lastWeight: 55,
      stepsEarned: 2,
      ratio,
      exerciseId: "bulgarian_split_squat",
    });
    // The plan at home is planned at it, and the entry says why.
    const plan = buildWorkoutPlan({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: resolved.liftStates,
      location: "home",
      equipment: EQUIPMENT,
      includeWarmUps: false,
      selectedAccessories: [],
      variantStates: resolved.variantStates,
      reentries: resolved.reentries,
    });
    const entry = plan.find((e) => e.exerciseId === "squat" && e.tier === "T1")!;
    expect(entry).toMatchObject({ substituteExerciseId: "bulgarian_split_squat", weight: expected.weight });
    expect(entry.reentry?.rule).toBe(expected.rule);
  });

  it("stops at the heaviest dumbbell", () => {
    const variants = [split({ weight: 80, lastSessionDate: at(10), gymPassesSinceHome: 3 })];
    const resolved = resolveReentry({ liftStates, variantStates: variants, location: "home", equipment: EQUIPMENT });
    expect(resolved.reentries.get("squat|T1")).toMatchObject({ rule: "cap", weight: 80, fromSteps: 95 });
  });

  it("leaves a home exercise never used to its seed, and one done since the gym alone", () => {
    const never = resolveReentry({ liftStates, variantStates: [], location: "home", equipment: EQUIPMENT });
    expect(never.reentries.size).toBe(0);
    const since = resolveReentry({
      liftStates,
      variantStates: [split({ weight: 55, lastSessionDate: at(25) })],
      location: "home",
      equipment: EQUIPMENT,
    });
    expect(since.reentries.size).toBe(0);
  });
});

describe("a weight set by hand has the final say", () => {
  // A barbell squat session that puts the estimate well under the home weights below.
  const gymSets = t1Session("gym", "squat", 205, 3, 5);

  it("at home: a split squat weight set by hand after the barbell session is planned as set", () => {
    const liftStates = [squat({ t1Weight: 245, t1LastWorkoutDate: at(5) })];
    const before = split({ weight: 65, lastSessionDate: at(0), gymPassesSinceHome: 0 });
    const input = { liftStates, location: "home" as const, equipment: EQUIPMENT, strengthSets: gymSets };
    // Without the hand-set date the estimate would take it lower.
    const bounded = resolveReentry({ ...input, variantStates: [before] }).reentries.get(reentryKey("squat", "T1"))!;
    expect(bounded.weight).toBeLessThan(65);

    const resolved = resolveReentry({ ...input, variantStates: [{ ...before, setByHandAt: at(6) }] });
    expect(variantOf(resolved.variantStates, "squat|bulgarian_split_squat|T1").weight).toBe(65);
    expect(resolved.reentries.get(reentryKey("squat", "T1"))).toMatchObject({
      rule: "hand",
      weight: 65,
      location: "home",
      exerciseId: "bulgarian_split_squat",
      setByHandAt: at(6),
    });
  });

  it("at the gym: a barbell weight set by hand after the last home session is planned as set", () => {
    const variants = [split({ weight: 55, lastSessionDate: at(10), passesSinceGym: 2 })];
    const sets = [...t1Session("gym", "squat", 190, 8, 0), ...t1Session("home", "bulgarian_split_squat", 55, 8, 10, true)];
    const liftStates = [squat({ t1Weight: 200, t1LastWorkoutDate: at(0), t1SetByHandAt: at(11) })];
    const resolved = resolveReentry({ liftStates, variantStates: variants, location: "gym", equipment: EQUIPMENT, strengthSets: sets });
    expect(stateOf(resolved.liftStates, "squat").t1Weight).toBe(200);
    expect(resolved.reentries.get(reentryKey("squat", "T1"))).toMatchObject({
      rule: "hand",
      weight: 200,
      location: "gym",
      setByHandAt: at(11),
    });
  });

  it("a later session at the other location brings re-entry back", () => {
    // Set by hand on day 11, then a home session on day 12: back at the gym, re-entry decides again.
    const variants = [split({ weight: 55, lastSessionDate: at(12), passesSinceGym: 2 })];
    const liftStates = [squat({ t1Weight: 190, t1LastWorkoutDate: at(0), t1SetByHandAt: at(11) })];
    const gym = resolveReentry({ liftStates, variantStates: variants, location: "gym", equipment: EQUIPMENT });
    expect(gym.reentries.get(reentryKey("squat", "T1"))).toMatchObject({ rule: "steps", weight: 210 });

    // At home: set by hand on day 6, the barbell done again on day 8.
    const home = resolveReentry({
      liftStates: [squat({ t1Weight: 245, t1LastWorkoutDate: at(8) })],
      variantStates: [split({ weight: 65, lastSessionDate: at(0), setByHandAt: at(6) })],
      location: "home",
      equipment: EQUIPMENT,
      strengthSets: gymSets,
    });
    expect(home.reentries.get(reentryKey("squat", "T1"))?.rule).not.toBe("hand");
  });

  it("the demo at home: the split squat set to five more by hand is what the next home workout plans", () => {
    const now = new Date();
    const demo = generateDemoData(now);
    const settings = DEFAULT_USER_PROFILE.settings;
    const input = { workouts: demo.workouts, adjustments: demo.liftAdjustments, settings };
    const completed = demo.workouts.filter((w) => w.completedAt);
    const nextHomeSquat = (rebuilt: ReturnType<typeof rebuildDerived>) =>
      describeNextWorkout({
        completedWorkouts: completed,
        templates: WORKOUT_TEMPLATES,
        liftStates: rebuilt.liftStates,
        plan: {
          location: "home",
          equipment: settings.equipment,
          includeWarmUps: false,
          selectedAccessories: [],
          variantStates: rebuilt.variantStates,
          strengthSets: strengthSetsOf(completed),
        },
        reentry: true,
      }).plan.find((e) => e.exerciseId === "squat" && !e.isWarmUp)!;
    const before = rebuildDerived(input);
    const planned = nextHomeSquat(before);
    expect(planned).toMatchObject({ tier: "T1", substituteExerciseId: "bulgarian_split_squat" });
    // The demo's next home squat re-enters after barbell sessions, bounded by the estimate.
    expect(planned.reentry?.location).toBe("home");

    const target = planned.weight + settings.equipment.dumbbellIncrementLbs;
    const hand = {
      id: "hand",
      clientId: "hand",
      exerciseId: "squat",
      at: now,
      source: "manual" as const,
      set: { t1Weight: target },
      variant: { exerciseId: "bulgarian_split_squat", tier: "T1" as const },
      synced: false,
    };
    const after = rebuildDerived({ ...input, adjustments: [...input.adjustments, hand] });
    const next = nextHomeSquat(after);
    expect(next.weight).toBe(target);
    expect(next.reentry).toMatchObject({ rule: "hand", location: "home" });
    // The barbell squat is untouched.
    expect(stateOf(after.liftStates, "squat").t1Weight).toBe(stateOf(before.liftStates, "squat").t1Weight);
  });
});

describe("markReentries", () => {
  it("marks the lift's working entry where it is done as the decision says", () => {
    const plan = buildWorkoutPlan({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: seedLiftStates(),
      location: "gym",
      equipment: EQUIPMENT,
      includeWarmUps: true,
      selectedAccessories: [],
    });
    const reentry = { rule: "steps" as const, weight: 190, fromSteps: 190, fromEstimate: null, stepsEarned: 0, targetReps: 3, location: "gym" as const, lastWeight: 190, estimate: null };
    const marked = markReentries(plan, new Map([["squat|T1", reentry]]));
    expect(marked.filter((e) => e.reentry)).toHaveLength(1);
    expect(marked.find((e) => e.reentry)).toMatchObject({ exerciseId: "squat", tier: "T1", isWarmUp: false });
    // Not where the entry is done as a home exercise.
    expect(markReentries(plan.map((e) => ({ ...e, substituteExerciseId: "goblet_squat" })), new Map([["squat|T1", reentry]])).some((e) => e.reentry)).toBe(false);
  });
});

describe("a scripted three-week home block, then the gym (H6 acceptance)", () => {
  // Twelve home workouts every two days (A1 B1 A2 B2, three times: about three weeks),
  // squat T1 passing on each A1, then A1 at the gym, planned the way the Ready screen plans.
  const sim = startSim();
  for (let i = 0; i < 12; i++) runSession(sim, { location: "home", live: true });
  const before = { liftStates: sim.states, variants: sim.variants, workouts: [...sim.workouts] };
  const gym = planWorkoutStart({
    template: WORKOUT_TEMPLATES[runSessionTemplate(sim)],
    liftStates: sim.states,
    location: "gym",
    equipment: sim.settings.equipment,
    includeWarmUps: false,
    selectedAccessories: [],
    variantStates: sim.variants,
    strengthSets: strengthSetsOf(sim.workouts),
  });

  it("the home block moved the split squat by its own passes and left the barbell squat where it was", () => {
    expect(stateOf(before.liftStates, "squat").t1Weight).toBe(190);
    const splitT1 = variantOf(before.variants, "squat|bulgarian_split_squat|T1");
    expect(splitT1.passesSinceGym).toBe(3);
  });

  it("the first gym session follows the rule exactly", () => {
    const sets = strengthSetsOf(before.workouts);
    const estimate = pooledLiftEstimate("squat", sets)!.value;
    const squatState = stateOf(before.liftStates, "squat");
    const tier = WORKOUT_TEMPLATES[runSessionTemplate(sim)].exercises.find((e) => e.exerciseId === "squat")!.tier as "T1" | "T2";
    const lastWeight = tier === "T1" ? squatState.t1Weight : squatState.t2Weight;
    const steps = before.variants
      .filter((v) => v.liftId === "squat" && v.tier === tier)
      .reduce((sum, v) => sum + v.passesSinceGym, 0);
    const expected = barbellReentryWeight({
      lastWeight,
      stepsEarned: steps,
      stepLbs: EQUIPMENT.gymBarbellIncrementLbs * 2,
      estimate,
      targetReps: tier === "T1" ? 3 : 10,
      equipment: EQUIPMENT,
    })!;
    const entry = gym.plan.find((e) => e.exerciseId === "squat" && !e.isWarmUp)!;
    expect(entry.weight).toBe(expected.weight);
    expect(entry.reentry).toMatchObject({ rule: expected.rule, weight: expected.weight, stepsEarned: steps });
    expect(gym.prescribed.find((p) => p.exerciseId === "squat")!.weight).toBe(expected.weight);
  });

  it("is what the rebuild of the log gives, through the gym session and the next home one", () => {
    runSession(sim, { location: "gym", live: true });
    runSession(sim, { location: "gym", live: true, t2: FAIL });
    runSession(sim, { location: "home", live: true });
    const rebuilt = rebuildDerived(rebuildInput(sim));
    const view = (states: LiftState[]) =>
      states.map((s) => [s.exerciseId, s.t1Weight, s.t1Stage, s.t2Weight, s.t2Stage, s.t3Weight]).sort();
    expect(view(rebuilt.liftStates)).toEqual(view(sim.states));
    const variants = (states: VariantState[]) =>
      sortedVariants(states).map((v) => [v.id, v.weight, v.stage, v.extraReps, v.current, v.passesSinceGym, v.gymPassesSinceHome ?? 0]);
    expect(variants(rebuilt.variantStates)).toEqual(variants(sim.variants));
    // Every lift of every session was credited as planned: none only logged.
    for (const outcomes of rebuilt.outcomes.values()) {
      expect(outcomes.some((o) => o.kind === "loggedOnly")).toBe(false);
    }
    for (const outcomes of rebuilt.variantOutcomes.values()) {
      expect(outcomes.some((o) => o.kind === "loggedOnly")).toBe(false);
    }
  });
});

/** The template the next simulated session will use (the rotation by count). */
function runSessionTemplate(sim: { workouts: unknown[] }): string {
  return ["A1", "B1", "A2", "B2"][sim.workouts.length % 4];
}
