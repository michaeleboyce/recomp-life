import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import { createSetLog } from "@/lib/workout/logSet";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import type { SetLog } from "@/types";
import {
  DROP_SET_LIGHTER_BY,
  attachDrops,
  buildDropSet,
  dropChainOf,
  dropSetWeight,
  exerciseForLog,
  nextSetView,
  roleLabel,
  screenPlan,
  setChipsFor,
  spotKey,
  spotWeightsOf,
  weightStepFor,
} from "./setPlan";

const EQUIPMENT = DEFAULT_USER_PROFILE.settings.equipment;

function entry(overrides: Partial<WorkoutExerciseState> = {}): WorkoutExerciseState {
  return {
    exerciseId: "squat",
    tier: "T1",
    targetSets: 5,
    targetReps: 3,
    weight: 190,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 0,
    ...overrides,
  };
}

/** A ramp of two sets before the 5x3 at 190. */
const RAMP = [
  { weight: 150, reps: 3, role: "ramp" as const },
  { weight: 170, reps: 3, role: "ramp" as const },
  { weight: 190, reps: 3 },
  { weight: 190, reps: 3 },
  { weight: 190, reps: 3 },
  { weight: 190, reps: 3 },
  { weight: 190, reps: 3 },
];

let n = 0;
function set(overrides: Partial<SetLog> = {}): SetLog {
  n += 1;
  return {
    id: `s${n}`,
    clientId: `c${n}`,
    exerciseId: "squat",
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 190,
    isAMRAP: false,
    completedAt: new Date(2026, 10, 16, 10, 0, n),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...overrides,
  };
}

describe("weightStepFor", () => {
  it("is two of the smallest plate for a barbell lift at the gym", () => {
    expect(weightStepFor("squat", "gym", EQUIPMENT)).toBe(5);
    expect(weightStepFor("squat", "gym", { ...EQUIPMENT, availablePlates: [45, 25, 10, 1.25] })).toBe(2.5);
  });

  it("is the dumbbell step for a dumbbell exercise, anywhere", () => {
    const equipment = { ...EQUIPMENT, dumbbellIncrementLbs: 2.5 };
    expect(weightStepFor("db_bench", "home", equipment)).toBe(2.5);
    expect(weightStepFor("db_bench", "gym", equipment)).toBe(2.5);
  });

  it("is 5 lb for a cable or machine exercise", () => {
    expect(weightStepFor("lat_pulldown", "gym", EQUIPMENT)).toBe(5);
  });
});

describe("dropSetWeight", () => {
  it(`is about ${DROP_SET_LIGHTER_BY * 100}% lighter, rounded to a load the plates make`, () => {
    // 190 x 0.8 = 152 -> 150.
    expect(dropSetWeight(190, "squat", "gym", EQUIPMENT)).toBe(150);
    // 205 x 0.8 = 164 -> 165.
    expect(dropSetWeight(205, "squat", "gym", EQUIPMENT)).toBe(165);
  });

  it("rounds to the dumbbell step at home", () => {
    // 45 x 0.8 = 36 -> 35.
    expect(dropSetWeight(45, "db_bench", "home", EQUIPMENT)).toBe(35);
    expect(dropSetWeight(45, "db_bench", "home", { ...EQUIPMENT, dumbbellIncrementLbs: 2.5 })).toBe(35);
  });

  it("is always lighter than the set it continues while a lighter load exists", () => {
    // 10 x 0.8 = 8 -> 10 by rounding: one step lighter instead.
    expect(dropSetWeight(10, "db_bench", "home", EQUIPMENT)).toBe(5);
    // 50 on the bar: 40 is below the bar, so the bar alone.
    expect(dropSetWeight(50, "squat", "gym", EQUIPMENT)).toBe(45);
  });

  it("never goes below the bar or below nothing", () => {
    expect(dropSetWeight(45, "squat", "gym", EQUIPMENT)).toBe(45);
    expect(dropSetWeight(5, "db_bench", "home", EQUIPMENT)).toBe(0);
    expect(dropSetWeight(0, "push_up", "home", EQUIPMENT)).toBe(0);
  });
});

describe("screenPlan", () => {
  const base: WorkoutPlan = [entry({ perSet: RAMP, targetSets: 7 }), entry({ exerciseId: "bench", tier: "T2", weight: 100, targetSets: 3, targetReps: 10, isAMRAP: false })];

  it("does not count drop sets as sets of the entry", () => {
    const first = set();
    const sets = [
      first,
      set({ role: "drop", dropOf: first.id, weight: 150, actualReps: 5 }),
      set({ role: "drop", weight: 120, actualReps: 4 }),
    ];
    expect(screenPlan(base, sets)[0].completedSets).toBe(1);
  });

  it("keeps a per-set entry's working weight whatever the last set weighed", () => {
    const sets = [set({ weight: 150, role: "ramp" }), set({ weight: 170, role: "ramp" })];
    const plan = screenPlan(base, sets);
    expect(plan[0].completedSets).toBe(2);
    expect(plan[0].weight).toBe(190);
  });

  it("resumes a uniform entry at the weight of its last set that was not a drop, as before", () => {
    const top = set({ exerciseId: "bench", tier: "T2", weight: 95, targetReps: 10, actualReps: 10 });
    const sets = [top, set({ exerciseId: "bench", tier: "T2", role: "drop", dropOf: top.id, weight: 75 })];
    expect(screenPlan(base, sets)[1]).toMatchObject({ completedSets: 1, weight: 95 });
  });

  describe("with weights changed on the spot", () => {
    const bench = (weight: number) =>
      set({ exerciseId: "bench", tier: "T2", weight, targetReps: 10, actualReps: 10 });

    it("does not carry a set's changed weight on to the sets after it", () => {
      const sets = [bench(110)];
      expect(screenPlan(base, sets, { [spotKey(1, 0)]: 110 })[1]).toMatchObject({ completedSets: 1, weight: 100 });
    });

    it("goes back to the last set logged at its own weight", () => {
      const sets = [bench(95), bench(110)];
      expect(screenPlan(base, sets, { [spotKey(1, 1)]: 110 })[1].weight).toBe(95);
    });

    it("carries on a weight corrected after it was logged, as before", () => {
      const sets = [bench(105)];
      expect(screenPlan(base, sets, { [spotKey(1, 0)]: 110 })[1].weight).toBe(105);
    });

    it("leaves a per-set entry alone", () => {
      const sets = [set({ weight: 155, role: "ramp" })];
      expect(screenPlan(base, sets, { [spotKey(0, 0)]: 155 })[0].weight).toBe(190);
    });
  });
});

describe("spotWeightsOf", () => {
  it("picks one entry's changed weights by set index", () => {
    const weights = { [spotKey(0, 2)]: 150, [spotKey(1, 0)]: 90, [spotKey(1, 3)]: 95 };
    expect(spotWeightsOf(weights, 1)).toEqual({ 0: 90, 3: 95 });
    expect(spotWeightsOf(weights, 4)).toEqual({});
  });
});

describe("nextSetView", () => {
  it("is the entry itself without per-set weights or a change", () => {
    const plain = entry();
    expect(nextSetView(plain, null)).toBe(plain);
  });

  it("shows the next set's own weight and rep target", () => {
    const view = nextSetView(entry({ perSet: [{ weight: 150, reps: 5, role: "ramp" }, ...RAMP.slice(2)], targetSets: 6 }), null);
    expect(view).toMatchObject({ weight: 150, targetReps: 5 });
  });

  it("shows a weight changed on the spot", () => {
    expect(nextSetView(entry(), 185).weight).toBe(185);
    expect(nextSetView(entry({ perSet: RAMP, targetSets: 7, completedSets: 1 }), 165).weight).toBe(165);
  });
});

describe("exerciseForLog", () => {
  it("puts a changed weight on the next set of a per-set entry and keeps the entry's working weight", () => {
    const planned = entry({ perSet: RAMP, targetSets: 7, completedSets: 1 });
    const exercise = exerciseForLog(planned, 165);
    expect(exercise.weight).toBe(190);
    expect(exercise.perSet?.[1]).toEqual({ weight: 165, reps: 3, role: "ramp" });
    expect(exercise.perSet?.[0]).toEqual(RAMP[0]);
  });

  it("changes a uniform entry's weight", () => {
    expect(exerciseForLog(entry(), 185).weight).toBe(185);
    const plain = entry();
    expect(exerciseForLog(plain, null)).toBe(plain);
  });

  it("moves a home substitute's barbell-equivalent weight with a weight changed on the spot", () => {
    // Bulgarian split squat at 50 a hand standing in for a 205 squat; changed to 40 on the spot.
    const home = entry({ substituteExerciseId: "bulgarian_split_squat", weight: 50, originalWeight: 205 });
    const changed = exerciseForLog(home, 40);
    expect(changed.weight).toBe(40);
    expect(changed.originalWeight).toBe(164);
    // The same as a weight edit in the Log or before the workout (applyPlanEdits) gives.
    expect(applyPlanEdits([home], [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 40 }])[0].originalWeight).toBe(
      changed.originalWeight
    );
    // And the set logged from it carries that weight, as a per-set change does.
    const logged = createSetLog({ exercise: changed, actualReps: 3, rpe: null, location: "home", autoRegulated: false, now: new Date(), id: "s", clientId: "s" });
    expect(logged.originalWeight).toBe(164);
    const perSet = exerciseForLog({ ...home, perSet: [{ weight: 50, reps: 3 }, { weight: 50, reps: 3 }], targetSets: 2 }, 40);
    expect(
      createSetLog({ exercise: perSet, actualReps: 3, rpe: null, location: "home", autoRegulated: false, now: new Date(), id: "p", clientId: "p" })
        .originalWeight
    ).toBe(164);
  });
});

describe("setChipsFor", () => {
  it("lists every planned set with its weight, reps and role, the logged ones as logged", () => {
    const planned = entry({ perSet: RAMP, targetSets: 7, completedSets: 2 });
    const first = set({ weight: 150, role: "ramp", actualReps: 3 });
    const sets = [
      first,
      set({ role: "drop", dropOf: first.id, weight: 120 }),
      set({ weight: 170, role: "ramp", actualReps: 4 }),
    ];
    const chips = setChipsFor(planned, sets, {});
    expect(chips.map((c) => [c.state, c.weight, c.reps, c.role])).toEqual([
      ["done", 150, 3, "ramp"],
      ["done", 170, 4, "ramp"],
      ["current", 190, 3, "work"],
      ["todo", 190, 3, "work"],
      ["todo", 190, 3, "work"],
      ["todo", 190, 3, "work"],
      ["todo", 190, 3, "work"],
    ]);
    expect(chips[0].drops).toBe(1);
    expect(chips.at(-1)?.isAMRAP).toBe(true);
    expect(chips.slice(0, -1).every((c) => !c.isAMRAP)).toBe(true);
  });

  it("shows a weight changed on the spot on the current set", () => {
    const chips = setChipsFor(entry({ completedSets: 1 }), [set()], { 1: 180 });
    expect(chips.map((c) => c.weight)).toEqual([190, 180, 190, 190, 190]);
  });

  it("shows each set still to come at its own changed weight, with the plan's beside it", () => {
    const chips = setChipsFor(entry({ completedSets: 1 }), [set()], { 0: 150, 3: 200 });
    expect(chips.map((c) => [c.weight, c.planWeight, c.changed])).toEqual([
      [190, 190, false],
      [190, 190, false],
      [190, 190, false],
      [200, 190, true],
      [190, 190, false],
    ]);
  });
});

describe("buildDropSet", () => {
  it("continues the set before it: same exercise, tier and number, role drop, no AMRAP, its own reps", () => {
    const parent = set({ setNumber: 5, isAMRAP: true, targetReps: 3, actualReps: 6, substituteExerciseId: undefined });
    const drop = buildDropSet({
      parent,
      weight: 150,
      actualReps: 5,
      rpe: null,
      now: new Date(2026, 10, 16, 11),
      id: "d1",
      clientId: "dc1",
    });
    expect(drop).toMatchObject({
      id: "d1",
      clientId: "dc1",
      exerciseId: "squat",
      tier: "T1",
      setNumber: 5,
      weight: 150,
      actualReps: 5,
      targetReps: 5,
      isAMRAP: false,
      status: "completed",
      role: "drop",
      dropOf: parent.id,
      location: "gym",
      restAfterSeconds: 0,
      synced: false,
    });
    expect(drop.rpe).toBeUndefined();
  });

  it("keeps a home substitute and its program weight scaled to the drop", () => {
    const parent = set({
      exerciseId: "bench",
      tier: "T2",
      weight: 40,
      originalWeight: 100,
      isSubstituted: true,
      substituteExerciseId: "db_bench",
      location: "home",
    });
    const drop = buildDropSet({ parent, weight: 30, actualReps: 8, rpe: 10, now: new Date(), id: "d", clientId: "d" });
    expect(drop).toMatchObject({
      substituteExerciseId: "db_bench",
      isSubstituted: true,
      originalWeight: 75,
      location: "home",
      rpe: 10,
    });
  });

  it("marks a drop with no reps as failed", () => {
    const drop = buildDropSet({ parent: set(), weight: 150, actualReps: 0, rpe: null, now: new Date(), id: "d", clientId: "d" });
    expect(drop.status).toBe("failed");
  });
});

describe("attachDrops", () => {
  it("puts each drop under the set it continues, following earlier drops", () => {
    const a = set({ setNumber: 4 });
    const b = set({ setNumber: 5 });
    const d1 = set({ role: "drop", dropOf: b.id, weight: 150 });
    const d2 = set({ role: "drop", dropOf: d1.id, weight: 120 });
    const rows = attachDrops([a, b, d1, d2]);
    expect(rows.map((r) => [r.set.id, r.drops.map((d) => d.id)])).toEqual([
      [a.id, []],
      [b.id, [d1.id, d2.id]],
    ]);
  });

  it("keeps a drop whose set is not in the list as a row of its own", () => {
    const lone = set({ role: "drop", dropOf: "gone" });
    expect(attachDrops([lone]).map((r) => r.set.id)).toEqual([lone.id]);
  });

  it("finds the chain a set belongs to", () => {
    const b = set();
    const d1 = set({ role: "drop", dropOf: b.id });
    const d2 = set({ role: "drop", dropOf: d1.id });
    expect(dropChainOf([b, d1, d2], d1.id)).toEqual({ set: b, drops: [d1, d2] });
    expect(dropChainOf([b, d1, d2], "nope")).toBeNull();
  });
});

describe("roleLabel", () => {
  it("names the sets that are not working sets", () => {
    expect(roleLabel(undefined)).toBeNull();
    expect(roleLabel("work")).toBeNull();
    expect(roleLabel("ramp")).toBe("Ramp");
    expect(roleLabel("backoff")).toBe("Back-off");
    expect(roleLabel("drop")).toBe("Drop");
  });
});
