import { describe, expect, it } from "vitest";
import type { NextSetPlan, PlannedSet } from "@/types";
import {
  applyNextSetPlans,
  consumeNextSetPlans,
  nextSetPlanEdits,
  nextSetPlanKey,
  withNextSetPlan,
} from "./nextSetPlans";
import { applyPlanEdits } from "./planEdits";
import { makeEntry, makeSet } from "./testFixtures";
import type { WorkoutPlan } from "./types";

const SETS: PlannedSet[] = [
  { weight: 190, reps: 3 },
  { weight: 200, reps: 3 },
  { weight: 200, reps: 3 },
  { weight: 205, reps: 3 },
  { weight: 170, reps: 5, role: "backoff" },
];

function planOf(exerciseId: string, liftId: string, tier: NextSetPlan["tier"], sets = SETS): NextSetPlan {
  return {
    exerciseId,
    liftId,
    tier,
    sets,
    planSets: sets.map((s) => ({ ...s, weight: 190 })),
    createdAt: "2026-11-17T09:00:00.000Z",
  };
}

const PLAN: WorkoutPlan = [
  makeEntry({ exerciseId: "squat", tier: "warmup" as never, isWarmUp: true, weight: 95, targetSets: 1 }),
  makeEntry({ exerciseId: "squat", tier: "T1" }),
  makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, weight: 100, isAMRAP: false }),
  makeEntry({ exerciseId: "lat_pulldown", tier: "T3", targetSets: 3, targetReps: 15, weight: 80 }),
];

describe("nextSetPlanKey", () => {
  it("joins the exercise performed and the tier", () => {
    expect(nextSetPlanKey("bulgarian_split_squat", "T1")).toBe("bulgarian_split_squat|T1");
  });
});

describe("applyNextSetPlans", () => {
  it("leaves the plan as it is without set plans", () => {
    expect(applyNextSetPlans(PLAN, undefined)).toEqual(PLAN);
    expect(applyNextSetPlans(PLAN, {})).toEqual(PLAN);
  });

  it("gives the matching entry the plan's sets, as a setWeights edit does", () => {
    const plans = { [nextSetPlanKey("squat", "T1")]: planOf("squat", "squat", "T1") };
    const out = applyNextSetPlans(PLAN, plans);
    const squat = out.find((e) => e.exerciseId === "squat" && e.tier === "T1")!;
    expect(squat.perSet).toEqual(SETS);
    expect(squat.targetSets).toBe(5);
    expect(squat.weight).toBe(205);
    expect(squat.targetReps).toBe(3);
    expect(out).toEqual(
      applyPlanEdits(PLAN, [{ kind: "setWeights", exerciseId: "squat", tier: "T1", sets: SETS }])
    );
    // The warm-up and the other entries are untouched; the input is not changed.
    expect(out[0]).toEqual(PLAN[0]);
    expect(out[2]).toEqual(PLAN[2]);
    expect(PLAN[1].perSet).toBeUndefined();
  });

  it("matches on tier: a squat plan at T1 does not touch squat at T2", () => {
    const plan: WorkoutPlan = [makeEntry({ exerciseId: "squat", tier: "T2", targetSets: 3, targetReps: 10 })];
    const plans = { [nextSetPlanKey("squat", "T1")]: planOf("squat", "squat", "T1") };
    expect(applyNextSetPlans(plan, plans)).toEqual(plan);
  });

  it("matches the exercise performed: a home exercise, not the lift it stands in for", () => {
    const home: WorkoutPlan = [
      makeEntry({ exerciseId: "squat", substituteExerciseId: "bulgarian_split_squat", tier: "T1", weight: 50 }),
    ];
    const bssSets = [{ weight: 50, reps: 3 }, { weight: 55, reps: 3 }];
    const squatOnly = { [nextSetPlanKey("squat", "T1")]: planOf("squat", "squat", "T1") };
    expect(applyNextSetPlans(home, squatOnly)).toEqual(home);

    const bss = { [nextSetPlanKey("bulgarian_split_squat", "T1")]: planOf("bulgarian_split_squat", "squat", "T1", bssSets) };
    const out = applyNextSetPlans(home, bss);
    expect(out[0].perSet).toEqual(bssSets);
    expect(out[0].weight).toBe(55);
    expect(out[0].targetSets).toBe(2);
    // The barbell squat at the gym does not take the split squat's sets.
    expect(applyNextSetPlans([makeEntry()], bss)).toEqual([makeEntry()]);
  });

  it("ignores a plan with no sets", () => {
    const plans = { [nextSetPlanKey("squat", "T1")]: planOf("squat", "squat", "T1", []) };
    expect(applyNextSetPlans(PLAN, plans)).toEqual(PLAN);
  });
});

describe("nextSetPlanEdits", () => {
  it("names each entry as it stands: the template lift id and tier", () => {
    const home: WorkoutPlan = [
      makeEntry({ exerciseId: "squat", substituteExerciseId: "bulgarian_split_squat", tier: "T1", weight: 50 }),
      makeEntry({ exerciseId: "lat_pulldown", tier: "T3", targetSets: 3, targetReps: 15, weight: 80 }),
    ];
    const bssSets = [{ weight: 50, reps: 3 }];
    const t3Sets = [{ weight: 80, reps: 15 }, { weight: 85, reps: 15 }, { weight: 85, reps: 15 }];
    const plans = {
      [nextSetPlanKey("bulgarian_split_squat", "T1")]: planOf("bulgarian_split_squat", "squat", "T1", bssSets),
      [nextSetPlanKey("lat_pulldown", "T3")]: planOf("lat_pulldown", "lat_pulldown", "T3", t3Sets),
      [nextSetPlanKey("ohp", "T1")]: planOf("ohp", "ohp", "T1"),
    };
    expect(nextSetPlanEdits(home, plans)).toEqual([
      { kind: "setWeights", exerciseId: "squat", tier: "T1", sets: bssSets },
      { kind: "setWeights", exerciseId: "lat_pulldown", tier: "T3", sets: t3Sets },
    ]);
    expect(nextSetPlanEdits(home, undefined)).toEqual([]);
  });

  it("ignores a set plan it cannot use: no sets, no working set, or a weight or reps that are not numbers", () => {
    // Settings travel as JSON, so a NaN weight comes back as null.
    const broken: Array<PlannedSet[] | undefined> = [
      undefined,
      [],
      [{ weight: 170, reps: 5, role: "backoff" }],
      [{ weight: null as unknown as number, reps: 3 }],
      [{ weight: -5, reps: 3 }],
      [{ weight: 200, reps: 0 }],
      [{ weight: 200, reps: Number.NaN }],
    ];
    for (const sets of broken) {
      const plan = { ...planOf("squat", "squat", "T1"), sets: sets as PlannedSet[] };
      expect(nextSetPlanEdits(PLAN, { [nextSetPlanKey("squat", "T1")]: plan })).toEqual([]);
    }
  });

  it("gives copies of the sets", () => {
    const plans = { [nextSetPlanKey("squat", "T1")]: planOf("squat", "squat", "T1") };
    const [edit] = nextSetPlanEdits(PLAN, plans);
    expect(edit.kind === "setWeights" && edit.sets).not.toBe(SETS);
  });
});

describe("consumeNextSetPlans", () => {
  const plans = {
    [nextSetPlanKey("squat", "T1")]: planOf("squat", "squat", "T1"),
    [nextSetPlanKey("bulgarian_split_squat", "T1")]: planOf("bulgarian_split_squat", "squat", "T1"),
    [nextSetPlanKey("lat_pulldown", "T3")]: planOf("lat_pulldown", "lat_pulldown", "T3"),
  };

  it("uses up the plans the session logged, exercise and tier", () => {
    const left = consumeNextSetPlans(plans, { sets: [makeSet("squat", "T1")] });
    expect(Object.keys(left).sort()).toEqual(["bulgarian_split_squat|T1", "lat_pulldown|T3"]);
  });

  it("matches the exercise performed at home", () => {
    const left = consumeNextSetPlans(plans, {
      sets: [makeSet("squat", "T1", { substituteExerciseId: "bulgarian_split_squat", isSubstituted: true })],
    });
    expect(Object.keys(left).sort()).toEqual(["lat_pulldown|T3", "squat|T1"]);
  });

  it("keeps a plan when only warm-ups or another tier were logged", () => {
    const left = consumeNextSetPlans(plans, {
      sets: [makeSet("squat", "warmup"), makeSet("squat", "T2"), makeSet("lat_pulldown", "accessory")],
    });
    expect(left).toEqual(plans);
  });

  it("copies, and handles no plans or no sets", () => {
    expect(consumeNextSetPlans(undefined, { sets: [makeSet("squat", "T1")] })).toEqual({});
    const same = consumeNextSetPlans(plans, { sets: [] });
    expect(same).toEqual(plans);
    expect(same).not.toBe(plans);
    expect(consumeNextSetPlans(plans, {} as never)).toEqual(plans);
  });
});

describe("withNextSetPlan", () => {
  it("sets, replaces and removes one plan by key", () => {
    const key = nextSetPlanKey("squat", "T1");
    const plan = planOf("squat", "squat", "T1");
    const added = withNextSetPlan(undefined, key, plan);
    expect(added).toEqual({ [key]: plan });
    const other = planOf("ohp", "ohp", "T1");
    const both = withNextSetPlan(added, "ohp|T1", other);
    expect(Object.keys(both).sort()).toEqual(["ohp|T1", "squat|T1"]);
    const removed = withNextSetPlan(both, key, null);
    expect(removed).toEqual({ "ohp|T1": other });
    expect(both[key]).toBe(plan);
  });
});
