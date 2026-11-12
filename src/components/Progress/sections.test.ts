import { describe, expect, it } from "vitest";
import { INITIAL_LIFT_STATES } from "@/db/seed";
import type { LiftState } from "@/types";
import { DEFAULT_MAX_DUMBBELL, gymDebtItems, recoveryRows } from "./sections";

const HOUR = 3_600_000;
const state = (id: string, over: Partial<LiftState> = {}): LiftState => ({
  ...(INITIAL_LIFT_STATES[id] as LiftState),
  exerciseId: id,
  ...over,
});

describe("gymDebtItems", () => {
  it("lists barbell lifts whose T1 weight halved exceeds the heaviest dumbbell", () => {
    const items = gymDebtItems(
      [state("squat", { t1Weight: 225 }), state("bench", { t1Weight: 90 }), state("lat_pulldown", { t1Weight: 300 })],
      50
    );
    expect(items).toEqual([
      expect.objectContaining({ exerciseId: "squat", t1Weight: 225, dbEquivalent: 113, overage: 63 }),
    ]);
  });

  it("defaults the dumbbell limit like the old Program page", () => {
    expect(DEFAULT_MAX_DUMBBELL).toBe(50);
    expect(gymDebtItems([], 50)).toEqual([]);
  });
});

describe("recoveryRows", () => {
  const now = new Date(2026, 10, 11, 12);

  it("is empty when no main lift has been trained", () => {
    expect(recoveryRows([state("squat"), state("bench")], now, { mode: "maintaining" })).toEqual([]);
  });

  it("gives each trained main lift its status and days since", () => {
    const rows = recoveryRows(
      [
        state("squat", { t1LastWorkoutDate: new Date(now.getTime() - 10 * HOUR) }),
        state("bench", { t2LastWorkoutDate: new Date(now.getTime() - 80 * HOUR) }),
        state("deadlift"),
      ],
      now,
      { mode: "maintaining" }
    );
    expect(rows.map((r) => [r.exerciseId, r.status, r.detail])).toEqual([
      ["squat", "recovering", "Recovering, today"],
      ["bench", "primed", "Primed, 3 days ago"],
      ["deadlift", "detraining", "Not trained yet"],
    ]);
  });
});
