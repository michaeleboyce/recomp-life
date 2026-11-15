import { describe, expect, it } from "vitest";
import type { PlanEdit } from "@/types";
import {
  addEdit,
  editedKeys,
  removeEdit,
  schemeEdit,
  swapEdit,
  weightEdit,
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
