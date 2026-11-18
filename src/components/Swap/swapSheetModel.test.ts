import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { recommendSwapSets, recommendSwaps, type SwapPrescription } from "@/lib/swap";
import {
  SWAP_RECOMMENDED_COUNT,
  confirmLabel,
  everyTimeOption,
  historyText,
  pairView,
  partsTotal,
  picked,
  pointsText,
  prescriptionText,
  swapSections,
  toggleSelection,
} from "./swapSheetModel";

const NOW = new Date(2026, 10, 18, 9, 0, 0);
const p = (over: Partial<SwapPrescription> = {}): SwapPrescription => ({
  weight: 45,
  sets: 3,
  reps: 10,
  isAMRAP: false,
  basis: "history",
  note: "",
  ...over,
});

describe("prescriptionText", () => {
  it("reads weight × sets × reps, per hand where the exercise is", () => {
    expect(prescriptionText("lat_pulldown", p(), "accessory")).toBe("45 lbs × 3 × 10");
    expect(prescriptionText("db_bench", p({ weight: 40 }), "T2")).toBe("40 lbs a hand × 3 × 10");
  });
  it("marks a program lift's AMRAP, never an accessory's", () => {
    expect(prescriptionText("db_bench", p({ isAMRAP: true }), "T2")).toBe("45 lbs a hand × 3 × 10+");
    expect(prescriptionText("lat_pulldown", p({ isAMRAP: true }), "accessory")).toBe("45 lbs × 3 × 10");
  });
  it("says BW for bodyweight work and asks for a weight when none is known", () => {
    expect(prescriptionText("push_up", p({ weight: 0, basis: "none" }), "accessory")).toBe("BW × 3 × 10");
    expect(prescriptionText("lat_pulldown", p({ weight: 0, basis: "none" }), "accessory")).toBe("Set your weight · 3 × 10");
  });
});

describe("historyText", () => {
  it("counts sessions and says how long ago, noting imported history", () => {
    const lastDone = new Date(2026, 10, 1, 9);
    expect(historyText({ timesDone: 14, lastDone, imported: false }, NOW)).toBe("Done 14 times, last 2 weeks ago");
    expect(historyText({ timesDone: 1, lastDone, imported: true }, NOW)).toBe("Done 1 time, last 2 weeks ago, imported");
    expect(historyText(undefined, NOW)).toBe("Not done before");
  });
});

describe("sections, parts and picks", () => {
  const ctx = { location: "gym" as const, equipment: DEFAULT_USER_PROFILE.settings.equipment, now: NOW };
  const list = recommendSwaps("bench", { ...ctx, slot: { tier: "T2", sets: 3, reps: 10, isAMRAP: true, weight: 135 } });

  it("shows the best few first and keeps every other one", () => {
    const { recommended, rest } = swapSections(list);
    expect(recommended).toHaveLength(SWAP_RECOMMENDED_COUNT);
    expect([...recommended, ...rest]).toEqual(list);
  });

  it("adds the parts up to the score", () => {
    for (const c of list) expect(partsTotal(c)).toBe(c.score);
    expect(pointsText(15)).toBe("+15");
    expect(pointsText(-8)).toBe("−8");
    expect(pointsText(0)).toBe("0");
  });

  it("picks one at a time by default and several in 'Pick more than one'", () => {
    expect(toggleSelection([], "a", false)).toEqual(["a"]);
    expect(toggleSelection(["a"], "b", false)).toEqual(["b"]);
    expect(toggleSelection(["a"], "a", false)).toEqual([]);
    expect(toggleSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a", true)).toEqual(["b"]);
    const two = picked([list[1].exerciseId, list[0].exerciseId], list);
    expect(two.map((c) => c.exerciseId)).toEqual([list[1].exerciseId, list[0].exerciseId]);
    expect(confirmLabel([])).toBe("Pick an exercise");
    expect(confirmLabel(two)).toBe("Swap in 2 exercises");
  });

  it("names what each member of a pair covers", () => {
    const sets = recommendSwapSets("bench", ctx, { force: true });
    expect(sets.length).toBeGreaterThan(0);
    const view = pairView(sets[0]);
    expect(view.members).toHaveLength(2);
    expect(view.members[0].covers).toMatch(/^Covers /);
  });
});

describe("everyTimeOption", () => {
  it("for an accessory, blocks the original and prefers the replacement at this location", () => {
    const option = everyTimeOption("accessory", "face_pulls", ["lateral_raises"], "gym");
    expect(option.label).toBe("Every time at the gym");
    expect(option.writes).toEqual([
      { scope: "gym", exerciseId: "face_pulls", preference: "blocked" },
      { scope: "gym", exerciseId: "lateral_raises", preference: "preferred" },
    ]);
  });

  it("for a program lift, only prefers the replacement and says so", () => {
    const option = everyTimeOption("T1", "squat", ["goblet_squat"], "home");
    expect(option.label).toBe("Suggest first every time at home");
    expect(option.detail).toMatch(/program keeps Barbell Squat/);
    expect(option.writes).toEqual([{ scope: "home", exerciseId: "goblet_squat", preference: "preferred" }]);
  });
});
