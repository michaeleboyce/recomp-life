import { describe, expect, it } from "vitest";
import type { PlanEdit, PlannedSet } from "@/types";
import {
  RAMP_UP_FRACTIONS,
  addBackOffSet,
  addEdit,
  editedKeys,
  plannedSetsOf,
  rampUpSets,
  removeEdit,
  schemeEdit,
  setWeightsEdit,
  swapEdit,
  weightEdit,
  withEdits,
  workingSetNumbers,
} from "./editList";

const NEW_ACC = { sets: 3, reps: 12, weight: 25, isAMRAP: false };

describe("scheme and weight edits", () => {
  it("replace an earlier edit of the same kind for the same entry", () => {
    let edits: PlanEdit[] = [];
    edits = schemeEdit(edits, "squat", "T1", 4, 3);
    edits = schemeEdit(edits, "squat", "T1", 5, 3);
    edits = weightEdit(edits, "squat", "T1", 200);
    edits = weightEdit(edits, "squat", "T1", 205);
    expect(edits).toEqual([
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 5, reps: 3 },
      { kind: "weight", exerciseId: "squat", tier: "T1", weight: 205 },
    ]);
  });

  it("keep other entries apart and clamp weight at 0 and sets and reps at 1", () => {
    let edits = weightEdit([], "squat", "T1", -5);
    edits = schemeEdit(edits, "bench", "T2", 0, 0);
    expect(edits).toContainEqual({ kind: "weight", exerciseId: "squat", tier: "T1", weight: 0 });
    expect(edits).toContainEqual({ kind: "scheme", exerciseId: "bench", tier: "T2", sets: 1, reps: 1 });
  });

  it("change an added exercise in place", () => {
    let edits = addEdit([], "face_pulls", NEW_ACC);
    edits = schemeEdit(edits, "face_pulls", "accessory", 4, 15);
    edits = weightEdit(edits, "face_pulls", "accessory", 35);
    expect(edits).toEqual([
      { kind: "add", exerciseId: "face_pulls", sets: 4, reps: 15, weight: 35, isAMRAP: false },
    ]);
  });
});

describe("remove", () => {
  it("drops an added exercise's add edit", () => {
    const edits = removeEdit(addEdit([], "face_pulls", NEW_ACC), "face_pulls", "accessory");
    expect(edits).toEqual([]);
  });

  it("drops earlier scheme and weight edits for the entry and records the removal", () => {
    let edits = schemeEdit([], "squat", "T2", 4, 8);
    edits = weightEdit(edits, "squat", "T2", 100);
    edits = removeEdit(edits, "squat", "T2");
    expect(edits).toEqual([{ kind: "remove", exerciseId: "squat", tier: "T2" }]);
  });

  it("turns removing a swapped-in exercise into removing the original", () => {
    let edits = swapEdit([], "lat_pulldown", "T3", "face_pulls");
    edits = weightEdit(edits, "face_pulls", "T3", 40);
    edits = removeEdit(edits, "face_pulls", "T3");
    expect(edits).toEqual([{ kind: "remove", exerciseId: "lat_pulldown", tier: "T3" }]);
  });
});

describe("swap", () => {
  it("records the swap", () => {
    expect(swapEdit([], "lat_pulldown", "T3", "face_pulls")).toEqual([
      { kind: "swap", exerciseId: "lat_pulldown", tier: "T3", replacementId: "face_pulls" },
    ]);
  });

  it("swapping a swapped-in exercise again replaces the swap and forgets the old weight", () => {
    let edits = swapEdit([], "lat_pulldown", "T3", "face_pulls");
    edits = weightEdit(edits, "face_pulls", "T3", 40);
    edits = schemeEdit(edits, "face_pulls", "T3", 4, 15);
    edits = swapEdit(edits, "face_pulls", "T3", "bicep_curls");
    expect(edits).toEqual([
      { kind: "swap", exerciseId: "lat_pulldown", tier: "T3", replacementId: "bicep_curls" },
      { kind: "scheme", exerciseId: "bicep_curls", tier: "T3", sets: 4, reps: 15 },
    ]);
  });

  it("swapping back to the original drops the swap", () => {
    let edits = swapEdit([], "lat_pulldown", "T3", "face_pulls");
    edits = swapEdit(edits, "face_pulls", "T3", "lat_pulldown");
    expect(edits).toEqual([]);
  });

  it("drops the entry's own weight edit when it is swapped", () => {
    let edits = weightEdit([], "lat_pulldown", "T3", 90);
    edits = swapEdit(edits, "lat_pulldown", "T3", "face_pulls");
    expect(edits).toEqual([
      { kind: "swap", exerciseId: "lat_pulldown", tier: "T3", replacementId: "face_pulls" },
    ]);
  });

  it("swaps an added exercise by rewriting its add at the new exercise's default weight", () => {
    let edits = addEdit([], "face_pulls", NEW_ACC);
    edits = swapEdit(edits, "face_pulls", "accessory", "bicep_curls");
    expect(edits).toEqual([
      { kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 12, weight: 25, isAMRAP: false },
    ]);
  });
});

describe("add", () => {
  it("replaces an earlier add of the same exercise", () => {
    let edits = addEdit([], "face_pulls", NEW_ACC);
    edits = addEdit(edits, "face_pulls", { ...NEW_ACC, sets: 2 });
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ sets: 2 });
  });
});

describe("editedKeys", () => {
  it("lists the entries the edits touch, naming swaps by their replacement", () => {
    let edits = swapEdit([], "lat_pulldown", "T3", "face_pulls");
    edits = weightEdit(edits, "squat", "T1", 200);
    expect([...editedKeys(edits)].sort()).toEqual(["face_pulls|T3", "squat|T1"]);
  });
});

describe("per-set weights", () => {
  const FIVE_BY_THREE: PlannedSet[] = Array.from({ length: 5 }, () => ({ weight: 190, reps: 3 }));

  it("set every set of an entry, replacing an earlier per-set edit, keeping roles other than work", () => {
    let edits = setWeightsEdit([], "squat", "T1", FIVE_BY_THREE);
    edits = setWeightsEdit(edits, "squat", "T1", [
      { weight: 150, reps: 3, role: "ramp" },
      { weight: 190, reps: 3, role: "work" },
      { weight: -5, reps: 0, role: "backoff" },
    ]);
    expect(edits).toEqual([
      {
        kind: "setWeights",
        exerciseId: "squat",
        tier: "T1",
        sets: [
          { weight: 150, reps: 3, role: "ramp" },
          { weight: 190, reps: 3 },
          { weight: 0, reps: 1, role: "backoff" },
        ],
      },
    ]);
  });

  it("go back to the entry's sets, reps and weight when cleared", () => {
    let edits = schemeEdit([], "squat", "T1", 4, 3);
    edits = setWeightsEdit(edits, "squat", "T1", FIVE_BY_THREE);
    expect(setWeightsEdit(edits, "squat", "T1", null)).toEqual([
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 4, reps: 3 },
    ]);
  });

  it("are dropped by a later scheme or weight edit, a removal or a swap of the entry", () => {
    const perSet = setWeightsEdit([], "squat", "T1", FIVE_BY_THREE);
    expect(schemeEdit(perSet, "squat", "T1", 5, 3)).toEqual([
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 5, reps: 3 },
    ]);
    expect(weightEdit(perSet, "squat", "T1", 185)).toEqual([
      { kind: "weight", exerciseId: "squat", tier: "T1", weight: 185 },
    ]);
    expect(removeEdit(perSet, "squat", "T1")).toEqual([{ kind: "remove", exerciseId: "squat", tier: "T1" }]);
    expect(swapEdit(perSet, "squat", "T1", "leg_press")).toEqual([
      { kind: "swap", exerciseId: "squat", tier: "T1", replacementId: "leg_press" },
    ]);
    const swapped = setWeightsEdit(swapEdit([], "squat", "T1", "leg_press"), "leg_press", "T1", FIVE_BY_THREE);
    expect(swapEdit(swapped, "leg_press", "T1", "pendulum_squat")).toEqual([
      { kind: "swap", exerciseId: "squat", tier: "T1", replacementId: "pendulum_squat" },
    ]);
  });

  it("count as an edit of their entry", () => {
    expect(editedKeys(setWeightsEdit([], "squat", "T1", FIVE_BY_THREE))).toEqual(new Set(["squat|T1"]));
  });
});

describe("per-set quick fills", () => {
  const working: PlannedSet[] = Array.from({ length: 5 }, () => ({ weight: 190, reps: 3 }));

  it("ramp up to the working weight with lighter sets first, rounded to the step", () => {
    const ramped = rampUpSets(working, 5);
    expect(ramped.slice(0, RAMP_UP_FRACTIONS.length)).toEqual([
      { weight: 150, reps: 3, role: "ramp" },
      { weight: 170, reps: 3, role: "ramp" },
    ]);
    expect(ramped.slice(RAMP_UP_FRACTIONS.length)).toEqual(working);
    // Again: the ramp is replaced, not doubled.
    expect(rampUpSets(ramped, 5)).toEqual(ramped);
  });

  it("leaves out a ramp set that would not be lighter, or would be below the lightest load", () => {
    // 10 x 0.8 = 8 -> 10 and 10 x 0.9 = 9 -> 10: neither is lighter.
    expect(rampUpSets([{ weight: 10, reps: 10 }], 5)).toEqual([{ weight: 10, reps: 10 }]);
    // 50 x 0.8 = 40 is below the 45 lb bar; 50 x 0.9 = 45 is the bar.
    expect(rampUpSets([{ weight: 50, reps: 5 }], 5, 45)).toEqual([
      { weight: 45, reps: 5, role: "ramp" },
      { weight: 50, reps: 5 },
    ]);
  });

  it("add a back-off set after, lighter than the working weight", () => {
    expect(addBackOffSet(working, 5).at(-1)).toEqual({ weight: 150, reps: 3, role: "backoff" });
    expect(addBackOffSet(addBackOffSet(working, 5), 5)).toHaveLength(7);
  });

  it("number the working sets", () => {
    expect(workingSetNumbers(rampUpSets(working, 5))).toEqual([3, 4, 5, 6, 7]);
    expect(workingSetNumbers(addBackOffSet(working, 5))).toEqual([1, 2, 3, 4, 5]);
  });

  it("start from the entry's own sets", () => {
    expect(plannedSetsOf({ targetSets: 3, targetReps: 10, weight: 100 })).toEqual([
      { weight: 100, reps: 10 },
      { weight: 100, reps: 10 },
      { weight: 100, reps: 10 },
    ]);
    const perSet = [{ weight: 80, reps: 10, role: "ramp" as const }, { weight: 100, reps: 10 }];
    expect(plannedSetsOf({ targetSets: 2, targetReps: 10, weight: 100, perSet })).toEqual(perSet);
  });
});

describe("withEdits", () => {
  it("lays a swap's edits on the list through the same functions, keeping it minimal", () => {
    const swap: PlanEdit[] = [
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "db_bench" },
      { kind: "weight", exerciseId: "db_bench", tier: "T2", weight: 50 },
      { kind: "add", exerciseId: "push_up", sets: 3, reps: 15, weight: 0, isAMRAP: true },
    ];
    expect(withEdits([], swap)).toEqual(swap);
    // Swapping the replacement again re-points the one swap and drops its weight.
    const again = withEdits(withEdits([], swap), [
      { kind: "swap", exerciseId: "db_bench", tier: "T2", replacementId: "db_floor_press" },
      { kind: "weight", exerciseId: "db_floor_press", tier: "T2", weight: 45 },
    ]);
    expect(again).toEqual([
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "db_floor_press" },
      { kind: "add", exerciseId: "push_up", sets: 3, reps: 15, weight: 0, isAMRAP: true },
      { kind: "weight", exerciseId: "db_floor_press", tier: "T2", weight: 45 },
    ]);
  });

  it("handles scheme, remove and per-set edits too", () => {
    const list = withEdits([], [
      { kind: "scheme", exerciseId: "face_pulls", tier: "accessory", sets: 3, reps: 15 },
      { kind: "remove", exerciseId: "squat", tier: "T1" },
      { kind: "setWeights", exerciseId: "bench", tier: "T2", sets: [{ weight: 100, reps: 10 }] },
    ]);
    expect(list.map((e) => e.kind)).toEqual(["scheme", "remove", "setWeights"]);
  });
});
