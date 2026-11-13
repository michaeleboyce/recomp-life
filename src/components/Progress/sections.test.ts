import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { barbellToBothHands, barbellToDumbbell } from "@/lib/dbConversion";
import { EXERCISES } from "@/lib/exercises";
import type { LiftState } from "@/types";
import { DEFAULT_MAX_DUMBBELL, gymDebtItems, recoveryRows } from "./sections";

const HOUR = 3_600_000;
const state = (id: string, over: Partial<LiftState> = {}): LiftState => ({
  ...(INITIAL_LIFT_STATES[id] as LiftState),
  exerciseId: id,
  ...over,
});

describe("gymDebtItems", () => {
  it("lists barbell lifts whose home substitute needs more than the heaviest dumbbell", () => {
    const items = gymDebtItems(
      [state("squat", { t1Weight: 225 }), state("bench", { t1Weight: 90 }), state("lat_pulldown", { t1Weight: 300 })],
      50
    );
    // Squat goes to a goblet squat: one dumbbell at the real conversion, not half the bar.
    expect(items).toEqual([
      expect.objectContaining({
        exerciseId: "squat",
        t1Weight: 225,
        dbEquivalent: barbellToBothHands(225),
        overage: barbellToBothHands(225) - 50,
        perHand: false,
        dbLabel: `${barbellToBothHands(225)} lbs`,
      }),
    ]);
  });

  it("uses the per-hand conversion for a per-hand substitute", () => {
    const [bench] = gymDebtItems([state("bench", { t1Weight: 200 })], 50);
    expect(bench).toEqual(
      expect.objectContaining({
        dbEquivalent: barbellToDumbbell(200),
        overage: barbellToDumbbell(200) - 50,
        perHand: true,
        dbLabel: `${barbellToDumbbell(200)} lbs/hand`,
      })
    );
  });

  it("does not list a lift that Configure can still load at home, even when half the bar is over the limit", () => {
    // 120 lb bench: half the bar is 60, over a 50 lb limit, but the real conversion is 50 per hand.
    expect(barbellToDumbbell(120)).toBe(50);
    expect(gymDebtItems([state("bench", { t1Weight: 120 })], 50)).toEqual([]);
  });

  it("agrees with the Configure screen's adaptation for every lift and weight", () => {
    const lifts = ["squat", "bench", "deadlift", "ohp"];
    for (const max of [25, 50, 80]) {
      const equipment = { ...DEFAULT_USER_PROFILE.settings.equipment, maxDumbbellWeight: max };
      for (const id of lifts) {
        for (let weight = 45; weight <= 405; weight += 5) {
          const exercise = EXERCISES[id];
          const { adaptationStatus } = adaptExerciseForHome(
            exercise,
            weight,
            equipment,
            exercise.dumbbellAlternative ? EXERCISES[exercise.dumbbellAlternative] : undefined
          );
          const waiting = adaptationStatus === "exceeds" || adaptationStatus === "no_substitute";
          const listed = gymDebtItems([state(id, { t1Weight: weight })], max).length === 1;
          expect(listed, `${id} at ${weight} with ${max} lb dumbbells is ${adaptationStatus}`).toBe(waiting);
        }
      }
    }
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
