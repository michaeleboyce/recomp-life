import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { resolveReentry, reentryKey } from "@/lib/workout/reentry";
import { seedVariantState, variantKey } from "@/lib/workout/variant";
import type { LiftState, VariantState } from "@/types";
import { DEFAULT_MAX_DUMBBELL, gymDebtItems, recoveryRows } from "./sections";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const equipment = { ...DEFAULT_USER_PROFILE.settings.equipment, maxDumbbellWeight: 80 };
const state = (id: string, over: Partial<LiftState> = {}): LiftState => ({
  ...(INITIAL_LIFT_STATES[id] as LiftState),
  exerciseId: id,
  ...over,
});
const variant = (liftId: string, exerciseId: string, over: Partial<VariantState> = {}): VariantState => ({
  ...seedVariantState({ liftId, exerciseId, tier: "T1", liftState: state(liftId), equipment }),
  current: true,
  ...over,
});

describe("gymDebtItems", () => {
  it("lists a lift trained at home at the heaviest dumbbell, with the weight it starts at back at the gym", () => {
    const liftStates = [
      state("squat", { t1Weight: 245, t1LastWorkoutDate: new Date(2026, 10, 1) }),
      state("bench", { t1Weight: 145 }),
    ];
    const variantStates = [
      variant("squat", "bulgarian_split_squat", {
        weight: 80,
        lastSessionDate: new Date(2026, 10, 8),
        passesSinceGym: 2,
      }),
      variant("bench", "db_bench", { weight: 50, lastSessionDate: new Date(2026, 10, 8) }),
    ];
    const items = gymDebtItems({ liftStates, variantStates, equipment });
    // Bench at home is 50 a hand, under the 80 lb dumbbell: it is not waiting for anything.
    expect(items.map((i) => i.exerciseId)).toEqual(["squat"]);
    const back = resolveReentry({ liftStates, variantStates, location: "gym", equipment }).reentries.get(
      reentryKey("squat", "T1")
    )!;
    // Two passes at home earned two barbell steps.
    expect(back).toMatchObject({ rule: "steps", stepsEarned: 2, lastWeight: 245 });
    expect(back.weight).toBeGreaterThan(245);
    expect(items[0]).toEqual({
      exerciseId: "squat",
      name: "Barbell Squat",
      t1Weight: 245,
      home: { exerciseId: "bulgarian_split_squat", weight: 80, perHand: true },
      gymWeight: back.weight,
      homeLabel: "Trained at home: Bulgarian split squat, 80 lbs a hand",
      gymLabel: `${back.weight} lbs`,
    });
  });

  it("gives the barbell weight as it is when no home session has earned anything", () => {
    const [squat] = gymDebtItems({
      liftStates: [state("squat", { t1Weight: 245 })],
      variantStates: [variant("squat", "goblet_squat", { weight: 80, perHand: false, id: variantKey("squat", "goblet_squat", "T1") })],
      equipment,
    });
    expect(squat).toMatchObject({
      home: { exerciseId: "goblet_squat", weight: 80, perHand: false },
      gymWeight: 245,
      homeLabel: "Trained at home: Goblet squat, 80 lbs",
    });
  });

  it("lists nothing when every lift fits the dumbbells", () => {
    expect(gymDebtItems({ liftStates: [state("squat"), state("bench")], variantStates: [], equipment })).toEqual([]);
    expect(gymDebtItems({ liftStates: [], variantStates: [], equipment })).toEqual([]);
  });

  it("defaults the dumbbell limit like the old Program page", () => {
    expect(DEFAULT_MAX_DUMBBELL).toBe(50);
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

  it("counts a lift trained at home as trained", () => {
    const rows = recoveryRows(
      [state("squat", { t1LastWorkoutDate: new Date(now.getTime() - 20 * DAY) }), state("bench")],
      now,
      { mode: "maintaining" },
      [
        variant("squat", "bulgarian_split_squat", { lastSessionDate: new Date(now.getTime() - 10 * HOUR) }),
        variant("bench", "db_bench", { lastSessionDate: new Date(now.getTime() - 80 * HOUR) }),
      ]
    );
    expect(rows.map((r) => [r.exerciseId, r.status, r.detail])).toEqual([
      ["squat", "recovering", "Recovering, today"],
      ["bench", "primed", "Primed, 3 days ago"],
    ]);
  });
});
