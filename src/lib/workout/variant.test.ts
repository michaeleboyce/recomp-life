import { describe, expect, it } from "vitest";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { roundToStep } from "@/lib/dbConversion";
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { TRANSFER_PRIORS, asLifted, priorFor, type StrengthSet } from "@/lib/strength";
import type { EquipmentProfile, LiftState, SetLog, VariantState } from "@/types";
import { EQUIPMENT, makeSets, seedLiftStates } from "./testFixtures";
import {
  CAP_REP_STEP,
  HARDER_HOME_VARIANT,
  anchorVariant,
  chooseHomeVariant,
  evaluateVariant,
  homeOptionsFor,
  homeStepsEarned,
  seedVariantState,
  seedVariantWeight,
  targetStrengthSets,
  totalLoad,
  variantKey,
  variantScheme,
  withHandSetWeight,
  type EvaluateVariantInput,
  type VariantSeedInput,
} from "./variant";

const NOW = new Date("2026-11-15T18:00:00Z");
const squat = (overrides: Partial<LiftState> = {}): LiftState => ({
  ...seedLiftStates().find((ls) => ls.exerciseId === "squat")!,
  ...overrides,
});

function variant(overrides: Partial<VariantState> = {}): VariantState {
  return {
    ...seedVariantState({
      liftId: "squat",
      exerciseId: "bulgarian_split_squat",
      tier: "T1",
      liftState: squat(),
      equipment: EQUIPMENT,
    }),
    ...overrides,
  };
}

/** Working sets of a home squat at a weight: every set hits `reps`, or the last misses. */
function homeSets(count: number, reps: number, weight: number, lastReps = reps): SetLog[] {
  const sets = makeSets("squat", "T1", count, reps, {
    weight,
    location: "home",
    isSubstituted: true,
    substituteExerciseId: "bulgarian_split_squat",
  });
  const last = sets[count - 1];
  sets[count - 1] = {
    ...last,
    isAMRAP: true,
    actualReps: lastReps,
    status: lastReps >= reps ? "completed" : "failed",
  };
  return sets;
}

function evaluate(state: VariantState, sets: SetLog[], extra: Partial<EvaluateVariantInput> = {}) {
  return evaluateVariant({
    state,
    sets,
    partial: false,
    heavier: null,
    equipment: EQUIPMENT,
    liftState: squat(),
    variantStates: [state],
    now: NOW,
    ...extra,
  });
}

describe("variant ids, loads and schemes", () => {
  it("names a variant by lift, exercise performed and tier", () => {
    expect(variantKey("squat", "bulgarian_split_squat", "T1")).toBe("squat|bulgarian_split_squat|T1");
  });

  it("counts two dumbbells for a per-hand exercise and one for goblet squat", () => {
    expect(totalLoad(true, 80)).toBe(160);
    expect(totalLoad(false, 80)).toBe(80);
    expect(variant().perHand).toBe(true);
    expect(seedVariantState({ liftId: "squat", exerciseId: "goblet_squat", tier: "T1", liftState: squat(), equipment: EQUIPMENT }).perHand).toBe(false);
  });

  it("prescribes the stage's scheme plus the reps the cap policy added", () => {
    expect(variantScheme(variant())).toEqual({ sets: 5, reps: 3 });
    expect(variantScheme(variant({ extraReps: 1 }))).toEqual({ sets: 5, reps: 4 });
    expect(variantScheme({ tier: "T2", stage: "3x10", extraReps: 2 })).toEqual({ sets: 3, reps: 12 });
    expect(variantScheme({ tier: "T3", stage: null, extraReps: 0 }, { sets: 3, reps: 15 })).toEqual({ sets: 3, reps: 15 });
  });

  it("adds one stage's reps at the cap: 1 for T1, 2 for T2, none for T3", () => {
    expect(CAP_REP_STEP).toEqual({ T1: 1, T2: 2, T3: 0 });
  });

  it("every harder variant is in the same lift's home chain", () => {
    for (const [from, to] of Object.entries(HARDER_HOME_VARIANT)) {
      const lift = Object.keys(HOME_SUBSTITUTE_CHAINS).find((id) => homeOptionsFor(id).includes(from));
      expect(lift, from).toBeDefined();
      expect(homeOptionsFor(lift!), `${from} -> ${to}`).toContain(to);
    }
  });
});

/** One barbell T1 squat session with a last set of `reps` at `weight`, as strength evidence. */
function barbellSquat(weight: number, reps: number, date = "2026-11-01T18:00:00Z"): StrengthSet[] {
  return [
    { id: "s1", sessionId: "w1", exerciseId: "squat", weight, perHand: false, reps: 3, role: "working", tier: "T1", isAMRAP: false, date },
    { id: "s2", sessionId: "w1", exerciseId: "squat", weight, perHand: false, reps, role: "working", tier: "T1", isAMRAP: true, date },
  ];
}

describe("seeding (H3): the pooled estimate through the exercise's starting ratio", () => {
  const seed = (exerciseId: string, barbellWeight: number, extra: Partial<VariantSeedInput> = {}) =>
    seedVariantWeight({ liftId: "squat", exerciseId, tier: "T1", barbellWeight, targetReps: 3, equipment: EQUIPMENT, ...extra });

  it("with no estimate it equals the barbell weight times the starting ratio, rounded to the dumbbell step and capped", () => {
    // 0.5 x 190 = 95 in all, 47.5 a hand, rounded to 5: 50.
    expect(seed("bulgarian_split_squat", 190)).toEqual({ weight: 50, source: "ratio", ratio: 0.5 });
    // 0.45 x 190 = 85.5 in one dumbbell, rounded to 85: more than the heaviest (80).
    expect(seed("goblet_squat", 190)).toEqual({ weight: 80, cappedFrom: 85, source: "ratio", ratio: 0.45 });
    const fine = { ...EQUIPMENT, dumbbellIncrementLbs: 2.5 };
    // 0.83 x 145 = 120.35, 60.2 a hand, rounded to 2.5: 60.
    expect(seedVariantWeight({ liftId: "bench", exerciseId: "db_bench", tier: "T1", barbellWeight: 145, targetReps: 3, equipment: fine }).weight).toBe(60);

    for (const [liftId, table] of Object.entries(TRANSFER_PRIORS)) {
      for (const [exerciseId, prior] of Object.entries(table)) {
        for (const weight of [60, 95, 145, 190, 245]) {
          const wanted = roundToStep(asLifted(prior.ratio * weight, exerciseId), EQUIPMENT.dumbbellIncrementLbs);
          const got = seedVariantWeight({ liftId, exerciseId, tier: "T2", barbellWeight: weight, targetReps: 10, equipment: EQUIPMENT });
          expect(got.weight, `${exerciseId} ${weight}`).toBe(Math.min(wanted, EQUIPMENT.maxDumbbellWeight));
          expect(got.source).toBe("ratio");
        }
      }
    }
  });

  it("with an estimate it is the heaviest weight the estimate allows for the stage's reps, rounded down and capped", () => {
    // 200 x 8: estimated max round(200 x (1 + 8/30)) = 253. Split squat: 253 x 0.5 = 126.5,
    // for 3 reps / 1.1 = 115 in all, 57.5 a hand, rounded down: 55.
    const sets = barbellSquat(200, 8);
    expect(seed("bulgarian_split_squat", 200, { strengthSets: sets })).toEqual({
      weight: 55,
      source: "estimate",
      ratio: 0.5,
      estimate: 253,
    });
    // For 10 reps (T2): 126.5 / (1 + 10/30) = 94.9 in all, 47.4 a hand: 45.
    expect(seed("bulgarian_split_squat", 200, { strengthSets: sets, targetReps: 10, tier: "T2" }).weight).toBe(45);
    // Goblet squat: 253 x 0.45 / 1.1 = 103.5 in one dumbbell, capped at 80.
    expect(seed("goblet_squat", 200, { strengthSets: sets })).toMatchObject({ weight: 80, cappedFrom: 100, source: "estimate" });
    // No set that gives an estimate: back to the ratio and the barbell weight.
    expect(seed("bulgarian_split_squat", 200, { strengthSets: [] }).source).toBe("ratio");
  });

  it("an exercise with no starting ratio keeps the flat conversion", () => {
    const pulldown = EXERCISES.lat_pulldown.dumbbellAlternative!;
    expect(priorFor("lat_pulldown", pulldown)).toBeNull();
    expect(seedVariantWeight({ liftId: "lat_pulldown", exerciseId: pulldown, tier: "T3", barbellWeight: 100, targetReps: 15, equipment: EQUIPMENT }).source).toBe("conversion");
  });

  it("chooseHomeVariant with no variant states picks the conversion's exercise at its seed", () => {
    for (const liftId of ["squat", "bench", "deadlift", "ohp", "lat_pulldown"]) {
      for (const weight of [60, 95, 145, 190, 210, 245, 300]) {
        for (const equipment of [EQUIPMENT, { ...EQUIPMENT, maxDumbbellWeight: 50 }]) {
          const liftState = { ...squat(), exerciseId: liftId, t1Weight: weight, t2Weight: weight, t3Weight: weight };
          const exercise = EXERCISES[liftId];
          const expected = adaptExerciseForHome(exercise, weight, equipment, EXERCISES[exercise.dumbbellAlternative!]);
          const choice = chooseHomeVariant({ liftId, tier: "T1", liftState, variantStates: [], equipment })!;
          const exerciseId = expected.adaptedExercise.id;
          const seeded = seedVariantWeight({ liftId, exerciseId, tier: "T1", barbellWeight: weight, targetReps: 3, equipment });
          expect(choice.state.exerciseId, `${liftId} ${weight}`).toBe(exerciseId);
          expect(choice.weight, `${liftId} ${weight}`).toBe(seeded.weight);
          expect(choice.seeded).toBe(true);
          expect(choice.cappedFrom).toBe(seeded.cappedFrom);
          expect(choice.state.seed.source).toBe(seeded.source);
        }
      }
    }
  });

  it("chooseHomeVariant seeds from the strength sets it is given", () => {
    const choice = chooseHomeVariant({ liftId: "squat", tier: "T1", liftState: squat({ t1Weight: 200 }), variantStates: [], equipment: EQUIPMENT, strengthSets: barbellSquat(200, 8) })!;
    expect(choice).toMatchObject({ weight: 55, seeded: true });
    expect(choice.state.seed).toEqual({ source: "estimate", barbellWeight: 200, ratio: 0.5, estimate: 253, targetReps: 3 });
  });

  it("a first variant takes the program lift's stage and fail count", () => {
    const seeded = seedVariantState({
      liftId: "squat",
      exerciseId: "bulgarian_split_squat",
      tier: "T1",
      liftState: squat({ t1Stage: "6x2", t1FailCount: 1 }),
      equipment: EQUIPMENT,
    });
    expect(seeded).toMatchObject({ stage: "6x2", failCount: 1, extraReps: 0, current: false, passesSinceGym: 0 });
    expect(seeded.seed).toEqual({ source: "ratio", barbellWeight: 190, ratio: 0.5 });
    expect(seeded.gymPassesSinceHome).toBeUndefined();
  });

  it("is null for a lift that works at home", () => {
    const row = { ...squat(), exerciseId: "db_row", t3Weight: 35 };
    expect(chooseHomeVariant({ liftId: "db_row", tier: "T3", liftState: row, variantStates: [], equipment: EQUIPMENT })).toBeNull();
  });
});

describe("chooseHomeVariant with home history", () => {
  it("plans the current variant at its own weight, not the barbell conversion", () => {
    const current = variant({ weight: 80, current: true });
    const choice = chooseHomeVariant({ liftId: "squat", tier: "T1", liftState: squat({ t1Weight: 135 }), variantStates: [current], equipment: EQUIPMENT })!;
    // 135 would convert to 55 a hand; the split squat's own weight is 80.
    expect(choice.state.id).toBe(current.id);
    expect(choice.weight).toBe(80);
    expect(choice.seeded).toBe(false);
  });

  it("caps a weight above a lowered heaviest dumbbell and says so", () => {
    const current = variant({ weight: 80, current: true });
    const choice = chooseHomeVariant({ liftId: "squat", tier: "T1", liftState: squat(), variantStates: [current], equipment: { ...EQUIPMENT, maxDumbbellWeight: 70 } })!;
    expect(choice).toMatchObject({ weight: 70, cappedFrom: 80 });
  });

  it("an override among the conversion's alternatives wins over the current variant", () => {
    const current = variant({ weight: 80, current: true });
    const choice = chooseHomeVariant({ liftId: "squat", tier: "T1", liftState: squat(), variantStates: [current], equipment: EQUIPMENT, overrideId: "goblet_squat" })!;
    expect(choice.state.exerciseId).toBe("goblet_squat");
  });
});

describe("evaluateVariant: GZCLP in dumbbell steps", () => {
  it("a pass adds one dumbbell step and counts a step earned at home", () => {
    const { state, outcome } = evaluate(variant({ weight: 70 }), homeSets(5, 3, 70, 6));
    expect(state).toMatchObject({ weight: 75, stage: "5x3", failCount: 0, current: true, passesSinceGym: 1, lastSessionDate: NOW, recentLastSetReps: [6] });
    expect(outcome).toMatchObject({ kind: "passed", from: { weight: 70, reps: 3 }, to: { weight: 75, reps: 3 }, ruleId: "gzclp-progression" });
    expect(outcome.cap).toBeUndefined();
  });

  it("uses the equipment's step and stops at the heaviest dumbbell", () => {
    const fine = { ...EQUIPMENT, dumbbellIncrementLbs: 2.5 };
    expect(evaluate(variant({ weight: 70 }), homeSets(5, 3, 70), { equipment: fine }).state.weight).toBe(72.5);
    expect(evaluate(variant({ weight: 77.5 }), homeSets(5, 3, 77.5)).state.weight).toBe(80);
  });

  it("a miss moves one stage down; after the last stage it resets to 85%, rounded to the dumbbell step", () => {
    const down = evaluate(variant({ weight: 75 }), homeSets(5, 3, 75, 2));
    expect(down.state).toMatchObject({ weight: 75, stage: "6x2", failCount: 1, passesSinceGym: 0 });
    expect(down.outcome.kind).toBe("stageDown");

    const fine = { ...EQUIPMENT, dumbbellIncrementLbs: 2.5 };
    const reset = evaluate(variant({ weight: 80, stage: "10x1", failCount: 2 }), homeSets(10, 1, 80, 0), { equipment: fine });
    // 80 * 0.85 = 68: 67.5 with 2.5 lb dumbbells (70 if it were rounded to 5).
    expect(reset.state).toMatchObject({ weight: 67.5, stage: "5x3", failCount: 0, lastResetWeight: 80 });
    expect(reset.outcome.kind).toBe("reset");
  });

  it("a pain skip holds; stopping part-way is partial; a miss done heavier holds", () => {
    const sets = homeSets(5, 3, 75);
    sets[1] = { ...sets[1], status: "skipped_pain" };
    expect(evaluate(variant({ weight: 75 }), sets).outcome).toMatchObject({ kind: "held", reason: "pain" });
    expect(evaluate(variant({ weight: 75 }), homeSets(2, 3, 75), { partial: true }).state.weight).toBe(75);
    expect(evaluate(variant({ weight: 75 }), homeSets(2, 3, 75), { partial: true }).outcome.kind).toBe("partial");
    const heavyMiss = evaluate(variant({ weight: 75 }), homeSets(5, 3, 80, 2), { heavier: 80 });
    expect(heavyMiss.outcome).toMatchObject({ kind: "held", reason: "heavier" });
    expect(heavyMiss.state.weight).toBe(75);
  });

  it("a pass done heavier builds from the heavier weight", () => {
    const { state, outcome } = evaluate(variant({ weight: 70 }), homeSets(5, 3, 75), { heavier: 75 });
    expect(state.weight).toBe(80);
    expect(outcome).toMatchObject({ kind: "passed", reason: "heavier", from: { weight: 70 } });
  });
});

describe("evaluateVariant: the cap policy (H2)", () => {
  it("a split squat pass at the heaviest pair progresses by reps: 5x3 -> 5x4", () => {
    const { state, outcome, switchedTo } = evaluate(variant({ weight: 80 }), homeSets(5, 3, 80, 5));
    expect(switchedTo).toBeUndefined();
    expect(state).toMatchObject({ weight: 80, extraReps: 1, passesSinceGym: 1, current: true });
    expect(outcome.cap).toEqual({ policy: "reps", maxDumbbellWeight: 80, repsFrom: 3, repsTo: 4 });
  });

  it("T2 at the cap: 3x10 -> 3x12, judged at 12 reps next time", () => {
    const t2 = variant({ id: variantKey("squat", "bulgarian_split_squat", "T2"), tier: "T2", stage: "3x10", weight: 80 });
    const sets = makeSets("squat", "T2", 3, 10, { weight: 80, substituteExerciseId: "bulgarian_split_squat", isSubstituted: true });
    const first = evaluate(t2, sets);
    expect(variantScheme(first.state)).toEqual({ sets: 3, reps: 12 });
    // Ten reps a set no longer passes at 3x12: one stage down, the extra reps cleared.
    const second = evaluate(first.state, makeSets("squat", "T2", 3, 10, { weight: 80, targetReps: 12, status: "failed" }));
    expect(second.state).toMatchObject({ stage: "3x8", extraReps: 0, failCount: 1 });
  });

  it("goblet squat at the heaviest dumbbell moves to the split squat, never at a lighter total", () => {
    const goblet = variant({ id: variantKey("squat", "goblet_squat", "T1"), exerciseId: "goblet_squat", perHand: false, weight: 80, current: true });
    const sets = homeSets(5, 3, 80).map((s) => ({ ...s, substituteExerciseId: "goblet_squat" }));
    const { state, outcome, switchedTo } = evaluate(goblet, sets, { liftState: squat({ t1Weight: 245 }) });
    expect(state).toMatchObject({ weight: 80, current: false, passesSinceGym: 1 });
    expect(switchedTo).toMatchObject({ exerciseId: "bulgarian_split_squat", current: true, stage: "5x3" });
    expect(totalLoad(true, switchedTo!.weight)).toBeGreaterThanOrEqual(totalLoad(false, 80));
    expect(switchedTo!.seed).toMatchObject({ source: "harderVariant", fromVariantId: goblet.id });
    expect(outcome.cap).toMatchObject({ policy: "harderVariant", to: { exerciseId: "bulgarian_split_squat" } });
  });

  it("a harder variant used before is raised to a total load that is not lighter", () => {
    const goblet = variant({ id: variantKey("squat", "goblet_squat", "T1"), exerciseId: "goblet_squat", perHand: false, weight: 80, current: true });
    const oldSplit = variant({ weight: 30, stage: "6x2", failCount: 1 });
    const sets = homeSets(5, 3, 80).map((s) => ({ ...s, substituteExerciseId: "goblet_squat" }));
    const { switchedTo } = evaluate(goblet, sets, { variantStates: [goblet, oldSplit] });
    // 80 in one dumbbell -> at least 40 a hand; its own stage is kept.
    expect(switchedTo).toMatchObject({ weight: 40, stage: "6x2", current: true });
  });

  it("over thirty home passes of squat the planned total load never goes down", () => {
    let states: VariantState[] = [];
    let lastTotal = 0;
    const liftState = squat({ t1Weight: 245 });
    for (let i = 0; i < 30; i++) {
      const choice = chooseHomeVariant({ liftId: "squat", tier: "T1", liftState, variantStates: states, equipment: EQUIPMENT })!;
      expect(choice.state.exerciseId).not.toBe("goblet_squat");
      const total = totalLoad(choice.state.perHand, choice.weight);
      expect(total).toBeGreaterThanOrEqual(lastTotal);
      lastTotal = total;
      const { reps } = variantScheme(choice.state);
      const sets = homeSets(5, reps, choice.weight).map((s) => ({ ...s, targetReps: reps, substituteExerciseId: choice.state.exerciseId }));
      const evaluation = evaluate({ ...choice.state, weight: choice.weight }, sets, { liftState, variantStates: states });
      const byId = new Map(states.map((v) => [v.id, v]));
      for (const v of byId.values()) if (v.current) byId.set(v.id, { ...v, current: false });
      byId.set(evaluation.state.id, evaluation.state);
      if (evaluation.switchedTo) byId.set(evaluation.switchedTo.id, evaluation.switchedTo);
      states = [...byId.values()];
    }
    expect(homeStepsEarned(states, "squat", "T1")).toBe(30);
  });
});

describe("anchorVariant and homeStepsEarned", () => {
  it("takes a stored home prescription's weight, stage and reps", () => {
    const anchored = anchorVariant(variant({ weight: 75 }), {
      exerciseId: "bulgarian_split_squat",
      weight: 80,
      perHand: true,
      stage: "6x2",
      sets: 6,
      reps: 3,
    });
    expect(anchored).toMatchObject({ weight: 80, stage: "6x2", failCount: 1, extraReps: 1 });
  });

  it("sums the passes of every variant of a lift and tier", () => {
    const equipment: EquipmentProfile = EQUIPMENT;
    const t1 = variant({ passesSinceGym: 2 });
    const goblet = { ...variant({ passesSinceGym: 1 }), id: variantKey("squat", "goblet_squat", "T1"), exerciseId: "goblet_squat" };
    const t2 = { ...variant({ passesSinceGym: 4 }), id: variantKey("squat", "bulgarian_split_squat", "T2"), tier: "T2" as const };
    expect(homeStepsEarned([t1, goblet, t2], "squat", "T1")).toBe(3);
    expect(homeStepsEarned([t1, goblet, t2], "squat", "T2")).toBe(4);
    expect(homeStepsEarned([], "bench", "T1")).toBe(0);
    expect(equipment.dumbbellIncrementLbs).toBe(5);
  });
});

describe("weights set by hand", () => {
  const at = new Date("2026-11-16T12:00:00Z");

  it("withHandSetWeight keeps the plan's weight, and a weight equal to it ends the override", () => {
    const plan = variant({ weight: 60 });
    const set = withHandSetWeight(plan, { ...plan, weight: 70 }, at);
    expect(set).toMatchObject({ weight: 70, plannedWeight: 60, setByHandAt: at });
    expect(withHandSetWeight(set, { ...set, weight: 75 }, at)).toMatchObject({ weight: 75, plannedWeight: 60 });
    const back = withHandSetWeight(set, { ...set, weight: 60 }, at);
    expect(back.plannedWeight).toBeUndefined();
    expect(back.setByHandAt).toBeUndefined();
    const explicit = withHandSetWeight(set, { ...set, weight: 65 }, at, true);
    expect(explicit.plannedWeight).toBeUndefined();
  });

  it("a logged session ends the override", () => {
    const set = variant({ weight: 70, plannedWeight: 60, setByHandAt: at });
    const { state } = evaluateVariant({
      state: set,
      sets: homeSets(5, 3, 70),
      partial: false,
      heavier: null,
      equipment: EQUIPMENT,
      now: NOW,
    } as EvaluateVariantInput);
    expect(state.plannedWeight).toBeUndefined();
  });

  it("targetStrengthSets gives one provisional set per override not lifted yet", () => {
    const states = [
      variant({ weight: 70, plannedWeight: 60, setByHandAt: at }),
      variant({ id: "squat|goblet_squat|T1", exerciseId: "goblet_squat", weight: 50 }),
    ];
    const sets: StrengthSet[] = targetStrengthSets(states);
    expect(sets).toEqual([
      expect.objectContaining({
        exerciseId: "bulgarian_split_squat",
        weight: 70,
        perHand: true,
        reps: variantScheme(states[0]).reps,
        tier: "T1",
        isAMRAP: true,
        date: at,
        provisional: true,
      }),
    ]);
  });
});
