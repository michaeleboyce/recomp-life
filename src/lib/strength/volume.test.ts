import { describe, it, expect } from "vitest";
import { DROP_SETS } from "./coefficients";
import { muscleVolume, volumeCredits } from "./volume";
import { set } from "./testHelpers";

const working = (id: string, exerciseId = "squat") => set({ id, exerciseId, sessionId: "w", isAMRAP: false });
const drop = (id: string, dropOf: string | undefined, exerciseId = "squat") =>
  set({ id, exerciseId, sessionId: "w", role: "drop", dropOf, isAMRAP: true });

describe("volumeCredits", () => {
  it("counts working, ramp and back-off sets as one set and warm-ups as none", () => {
    const credits = volumeCredits([
      working("a"),
      set({ id: "r", role: "ramp" }),
      set({ id: "b", role: "backoff" }),
      set({ id: "w", role: "warmup" }),
    ]);
    expect(credits.get("a")).toBe(1);
    expect(credits.get("r")).toBe(1);
    expect(credits.get("b")).toBe(1);
    expect(credits.get("w")).toBe(0);
  });

  it(`counts a drop as ${DROP_SETS.volumeCredit} of a set`, () => {
    const credits = volumeCredits([working("a"), drop("d1", "a")]);
    expect(credits.get("d1")).toBe(DROP_SETS.volumeCredit);
  });

  it(`adds at most ${DROP_SETS.maxExtraSetsPerWorkingSet} set for the drops after one set`, () => {
    const sets = [working("a"), drop("d1", "a"), drop("d2", "d1"), drop("d3", "d2"), drop("d4", "a")];
    const credits = volumeCredits(sets);
    const dropTotal = ["d1", "d2", "d3", "d4"].reduce((s, id) => s + credits.get(id)!, 0);
    expect(dropTotal).toBe(DROP_SETS.maxExtraSetsPerWorkingSet);
    expect(credits.get("d1")).toBe(0.5);
    expect(credits.get("d2")).toBe(0.5);
    expect(credits.get("d3")).toBe(0);
    expect(credits.get("d4")).toBe(0);
  });

  it("caps each working set's drops separately", () => {
    const sets = [working("a"), working("b"), drop("da1", "a"), drop("da2", "da1"), drop("db1", "b")];
    const credits = volumeCredits(sets);
    expect(credits.get("da1")! + credits.get("da2")!).toBe(1);
    expect(credits.get("db1")).toBe(0.5);
  });

  it("caps drops with no known parent per exercise and session", () => {
    const sets = [drop("x1", undefined), drop("x2", "missing"), drop("x3", undefined)];
    const credits = volumeCredits(sets);
    expect(credits.get("x1")! + credits.get("x2")! + credits.get("x3")!).toBe(1);
  });
});

describe("muscleVolume", () => {
  it("credits primary muscles fully and secondary muscles half, drops included", () => {
    const sets = [working("a"), working("b"), drop("d1", "a")];
    const volume = muscleVolume(sets);
    // Squat: primary quads, glutes; secondary adductors, lower back.
    expect(volume.quads).toBe(2.5);
    expect(volume.glutes).toBe(2.5);
    expect(volume.adductors).toBe(1.25);
    expect(volume.lower_back).toBe(1.25);
    expect(volume.abs).toBeUndefined();
  });

  it("H13: three drops after one working set add one set, not three", () => {
    const sets = [working("a"), drop("d1", "a"), drop("d2", "d1"), drop("d3", "d2")];
    expect(muscleVolume(sets).quads).toBe(2);
  });
});
