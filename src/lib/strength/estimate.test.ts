import { describe, it, expect } from "vitest";
import { calculateE1RM } from "@/lib/e1rm";
import { DROP_SETS } from "./coefficients";
import {
  externalLoad,
  isEstimateSet,
  latestEstimate,
  loadingOf,
  sessionEstimates,
  setEstimate,
} from "./estimate";
import { day, set, t1Session } from "./testHelpers";

describe("loadingOf and externalLoad", () => {
  it("reads two dumbbells, one dumbbell or other from the exercise catalogue", () => {
    expect(loadingOf("bulgarian_split_squat")).toBe("two-dumbbells");
    expect(loadingOf("db_bench")).toBe("two-dumbbells");
    expect(loadingOf("goblet_squat")).toBe("one-dumbbell");
    expect(loadingOf("squat")).toBe("other");
    expect(loadingOf("not_an_exercise")).toBe("other");
  });

  it("counts a per-hand weight twice for an exercise held with a dumbbell in each hand", () => {
    expect(externalLoad({ exerciseId: "bulgarian_split_squat", weight: 80, perHand: true })).toBe(160);
  });

  it("counts the single dumbbell once for a one-dumbbell exercise, even when flagged per hand", () => {
    expect(externalLoad({ exerciseId: "goblet_squat", weight: 80, perHand: true })).toBe(80);
    expect(externalLoad({ exerciseId: "goblet_squat", weight: 80, perHand: false })).toBe(80);
  });

  it("takes a weight not flagged per hand as the total", () => {
    expect(externalLoad({ exerciseId: "squat", weight: 225, perHand: false })).toBe(225);
    expect(externalLoad({ exerciseId: "db_bench", weight: 120, perHand: false })).toBe(120);
  });

  it("counts an unknown exercise flagged per hand as two dumbbells", () => {
    expect(externalLoad({ exerciseId: "mystery_press", weight: 30, perHand: true })).toBe(60);
  });
});

describe("isEstimateSet", () => {
  it("uses the app's rule: T1 AMRAP sets of 2 to 10 reps", () => {
    expect(isEstimateSet(set({ reps: 5 }))).toBe(true);
    expect(isEstimateSet(set({ reps: 1 }))).toBe(false);
    expect(isEstimateSet(set({ reps: 11 }))).toBe(false);
    expect(isEstimateSet(set({ isAMRAP: false }))).toBe(false);
    expect(isEstimateSet(set({ tier: "T2" }))).toBe(false);
    expect(isEstimateSet(set({ tier: "T3", reps: 8 }))).toBe(false);
  });

  it("counts ramp and back-off sets like working sets", () => {
    expect(isEstimateSet(set({ role: "ramp" }))).toBe(true);
    expect(isEstimateSet(set({ role: "backoff" }))).toBe(true);
  });

  it("never counts a drop or a warm-up", () => {
    expect(isEstimateSet(set({ role: "drop" }))).toBe(false);
    expect(isEstimateSet(set({ role: "warmup" }))).toBe(false);
  });
});

describe("setEstimate", () => {
  it("is calculateE1RM on the total load, with the logged effort", () => {
    const s = set({ exerciseId: "db_bench", weight: 50, perHand: true, reps: 8, rpe: 8 });
    expect(setEstimate(s)).toBe(calculateE1RM(100, 8, 8));
  });
});

describe("sessionEstimates", () => {
  it("gives one estimate per session, oldest first, from the AMRAP set", () => {
    const sets = [
      ...t1Session({ sessionId: "b", exerciseId: "squat", weight: 210, amrapReps: 6, day: 3 }),
      ...t1Session({ sessionId: "a", exerciseId: "squat", weight: 200, amrapReps: 8, day: 0 }),
    ];
    const estimates = sessionEstimates(sets, "squat");
    expect(estimates.map((e) => e.sessionId)).toEqual(["a", "b"]);
    expect(estimates[0].estimatedMax).toBe(calculateE1RM(200, 8));
    expect(estimates[1].estimatedMax).toBe(calculateE1RM(210, 6));
    expect(estimates[1].strength).toBe(estimates[1].estimatedMax);
    expect(estimates[1].bestSet).toMatchObject({ weight: 210, load: 210, reps: 6 });
  });

  it("ignores other exercises", () => {
    const sets = t1Session({ sessionId: "a", exerciseId: "bench", weight: 150, amrapReps: 5, day: 0 });
    expect(sessionEstimates(sets, "squat")).toEqual([]);
  });

  it("uses the best of several eligible sets in a session, at each set's own weight", () => {
    const sets = [
      set({ id: "r1", sessionId: "a", role: "ramp", weight: 185, reps: 5, date: day(0, 1) }),
      set({ id: "r2", sessionId: "a", role: "ramp", weight: 205, reps: 5, date: day(0, 2) }),
      set({ id: "b1", sessionId: "a", role: "backoff", weight: 175, reps: 9, date: day(0, 3) }),
    ];
    const [estimate] = sessionEstimates(sets, "squat");
    expect(estimate.estimatedMax).toBe(calculateE1RM(205, 5));
    expect(estimate.bestSet.id).toBe("r2");
  });

  it("counts per-hand dumbbells as the total", () => {
    const sets = t1Session({
      sessionId: "h",
      exerciseId: "bulgarian_split_squat",
      weight: 50,
      perHand: true,
      amrapReps: 8,
      day: 0,
    });
    expect(latestEstimate(sets, "bulgarian_split_squat")?.estimatedMax).toBe(calculateE1RM(100, 8));
  });

  describe("drops", () => {
    const top = set({ id: "top", sessionId: "a", weight: 200, reps: 6, date: day(0, 0) });
    const drop1 = set({
      id: "d1",
      sessionId: "a",
      role: "drop",
      dropOf: "top",
      weight: 160,
      reps: 6,
      isAMRAP: true,
      date: day(0, 1),
    });
    const drop2 = set({
      id: "d2",
      sessionId: "a",
      role: "drop",
      dropOf: "d1",
      weight: 130,
      reps: 5,
      isAMRAP: true,
      date: day(0, 2),
    });

    it("never make the estimated max, even when their own estimate would be higher", () => {
      const bigDrop = { ...drop1, weight: 195, reps: 10 };
      const [estimate] = sessionEstimates([top, bigDrop], "squat");
      expect(estimate.estimatedMax).toBe(calculateE1RM(200, 6));
    });

    it("never create an estimate on their own", () => {
      const orphan = { ...drop1, sessionId: "b", dropOf: "top" };
      expect(sessionEstimates([orphan], "squat")).toEqual([]);
    });

    it("enter the session's strength with the fatigue allowance and a small weight", () => {
      const [estimate] = sessionEstimates([top, drop1], "squat");
      const topValue = calculateE1RM(200, 6)!;
      const dropValue = calculateE1RM(160, 6)! / (1 - DROP_SETS.fatigueDiscount);
      const w = DROP_SETS.evidenceWeight;
      expect(estimate.dropsCounted).toBe(1);
      expect(estimate.strength).toBeCloseTo((topValue + w * dropValue) / (1 + w), 6);
    });

    it("count only the first drop after a set, whichever set later drops point at", () => {
      const viaChain = sessionEstimates([top, drop1, drop2], "squat")[0];
      const viaRoot = sessionEstimates([top, drop1, { ...drop2, dropOf: "top" }], "squat")[0];
      const firstOnly = sessionEstimates([top, drop1], "squat")[0];
      expect(viaChain.dropsCounted).toBe(1);
      expect(viaChain.strength).toBe(firstOnly.strength);
      expect(viaRoot.strength).toBe(firstOnly.strength);
    });

    it("move the session's strength only a small share of the way toward the drop", () => {
      const share = DROP_SETS.evidenceWeight / (1 + DROP_SETS.evidenceWeight);
      for (const reps of [2, 4, 6, 8, 10]) {
        const [estimate] = sessionEstimates([top, { ...drop1, reps }], "squat");
        const corrected = calculateE1RM(160, reps)! / (1 - DROP_SETS.fatigueDiscount);
        const gap = Math.abs(corrected - estimate.estimatedMax);
        expect(Math.abs(estimate.strength - estimate.estimatedMax)).toBeLessThanOrEqual(share * gap + 1e-9);
      }
    });

    it("are left out of strength when their reps are outside the formula's limits", () => {
      const longDrop = { ...drop1, reps: 14 };
      const [estimate] = sessionEstimates([top, longDrop], "squat");
      expect(estimate.dropsCounted).toBe(0);
      expect(estimate.strength).toBe(estimate.estimatedMax);
    });
  });

  it("skips sets with an unreadable date", () => {
    const sets = [set({ date: "not a date" }), set({ sessionId: "w2", date: day(1) })];
    expect(sessionEstimates(sets, "squat").map((e) => e.sessionId)).toEqual(["w2"]);
  });
});

describe("sets with no load", () => {
  it("a set logged at no weight (or an unreadable one) gives no estimate", () => {
    // A T1 AMRAP logged at 0 lb would otherwise say the lifter's max is 0 and drag the
    // pooled estimate, and with it re-entry, down to the empty bar.
    expect(isEstimateSet(set({ weight: 0 }))).toBe(false);
    expect(isEstimateSet(set({ weight: Number.NaN }))).toBe(false);
    expect(isEstimateSet(set({ weight: -10 }))).toBe(false);
    expect(sessionEstimates([set({ weight: 0, sessionId: "w0" })], "squat")).toEqual([]);
  });
});
