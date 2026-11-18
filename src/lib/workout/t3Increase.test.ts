import { describe, expect, it } from "vitest";
import { T3_INCREASE_REPS_MAX } from "@/lib/progression";
import type { EquipmentProfile, ProgressionOutcome, SetLog, VariantOutcome } from "@/types";
import {
  homeT3Increase,
  liftT3Increase,
  t3GoesUpSentence,
  t3IncreaseForEntry,
  t3IncreaseOfOutcome,
  t3IncreaseOfVariantOutcome,
  t3MoveUpHint,
  t3NextTimeAfterSet,
  t3NextTimeText,
} from "./t3Increase";

const EQUIPMENT: Pick<EquipmentProfile, "dumbbellIncrementLbs" | "maxDumbbellWeight"> = {
  dumbbellIncrementLbs: 5,
  maxDumbbellWeight: 60,
};

describe("the threshold of a T3 weight", () => {
  it("a lift state steps 5 lb: a 120 lb machine asks 18, a 25 lb dumbbell 24", () => {
    expect(liftT3Increase(120)).toEqual({ weight: 120, nextWeight: 125, targetReps: 15, threshold: 18 });
    expect(liftT3Increase(25).threshold).toBe(24);
  });

  it("at home steps the dumbbell increment up to the heaviest dumbbell", () => {
    expect(homeT3Increase(50, 15, EQUIPMENT)).toMatchObject({ nextWeight: 55, threshold: 20 });
    expect(homeT3Increase(50, 15, { ...EQUIPMENT, dumbbellIncrementLbs: 2.5 })).toMatchObject({
      nextWeight: 52.5,
      threshold: T3_INCREASE_REPS_MAX - 7,
    });
    // Capped at the heaviest dumbbell: 57.5 → 60 is a smaller step.
    expect(homeT3Increase(57.5, 15, EQUIPMENT).nextWeight).toBe(60);
  });

  it("at the heaviest dumbbell there is no next weight: the maximum", () => {
    expect(homeT3Increase(60, 15, EQUIPMENT)).toEqual({
      weight: 60,
      nextWeight: null,
      targetReps: 15,
      threshold: T3_INCREASE_REPS_MAX,
    });
  });

  it("a plan entry with a home substitute reads the dumbbells; one without, the lift's step", () => {
    expect(t3IncreaseForEntry({ weight: 50, targetReps: 15, substituteExerciseId: "db_row" }, EQUIPMENT).nextWeight).toBe(55);
    expect(t3IncreaseForEntry({ weight: 50, targetReps: 15 }, { ...EQUIPMENT, dumbbellIncrementLbs: 10 }).nextWeight).toBe(55);
  });
});

describe("the threshold a finished session used", () => {
  const outcome = (kind: ProgressionOutcome["kind"], from: number, to: number, reason?: ProgressionOutcome["reason"]): ProgressionOutcome => ({
    exerciseId: "lat_pulldown",
    tier: "T3",
    kind,
    ...(reason ? { reason } : {}),
    from: { weight: from },
    to: { weight: to },
    ruleId: "t3-progression",
  });

  it("reads the weight lifted from the outcome", () => {
    expect(t3IncreaseOfOutcome(outcome("t3Up", 50, 55, "lastSet"))).toMatchObject({ weight: 50, threshold: 20 });
    expect(t3IncreaseOfOutcome(outcome("t3Same", 50, 50, "lastSet"))).toMatchObject({ weight: 50, threshold: 20 });
    // Done heavier and passed: from is the prescribed weight, the step was from 60.
    expect(t3IncreaseOfOutcome(outcome("t3Up", 50, 65, "lastSet"))).toMatchObject({ weight: 60 });
  });

  it("a home exercise's outcome reads the dumbbells", () => {
    const point = (weight: number) => ({ exerciseId: "db_row", weight, perHand: true, reps: 15 });
    const variant = (kind: VariantOutcome["kind"], from: number, to: number): VariantOutcome => ({
      variantId: "v",
      liftId: "lat_pulldown",
      exerciseId: "db_row",
      tier: "T3",
      kind,
      from: point(from),
      to: point(to),
      ruleId: "t3-progression",
    });
    expect(t3IncreaseOfVariantOutcome(variant("t3Up", 50, 55), EQUIPMENT)).toMatchObject({ weight: 50, threshold: 20 });
    expect(t3IncreaseOfVariantOutcome(variant("t3Same", 50, 50), EQUIPMENT)).toMatchObject({ weight: 50, threshold: 20 });
    expect(t3IncreaseOfVariantOutcome(variant("t3Same", 60, 60), EQUIPMENT)?.threshold).toBe(T3_INCREASE_REPS_MAX);
  });
});

describe("words", () => {
  it("says the exercise's own number and why", () => {
    expect(t3GoesUpSentence(homeT3Increase(50, 15, EQUIPMENT), "lb")).toBe(
      "Goes up at 20 reps on the last set. At 20 you would be good for 15 at 55 lb."
    );
    expect(t3GoesUpSentence(liftT3Increase(120), "lb")).toBe(
      "Goes up at 18 reps on the last set. At 18 you would be good for 15 at 125 lb."
    );
  });

  it("bodyweight and the heaviest dumbbell say the stock number only", () => {
    expect(t3GoesUpSentence(liftT3Increase(0), "lb")).toBe("Goes up at 25 reps on the last set.");
    expect(t3GoesUpSentence(homeT3Increase(60, 15, EQUIPMENT), "lb a hand")).toBe(
      "At your heaviest dumbbell: 25 reps on the last set adds reps or a harder exercise instead of weight."
    );
  });

  it("during the workout: the number to reach, and what happens next time", () => {
    const at50 = homeT3Increase(50, 15, EQUIPMENT);
    expect(t3MoveUpHint(at50)).toBe("20 to move up");
    expect(t3NextTimeText(at50, 20, "lb")).toBe("20 of 20 on the last set: 55 lb next time");
    expect(t3NextTimeText(at50, 19, "lb")).toBe("19 of 20 on the last set: stays at 50 lb next time");
    expect(t3NextTimeText(homeT3Increase(60, 15, EQUIPMENT), 25, "lb")).toBe(
      "25 of 25 on the last set, at your heaviest dumbbell: more reps or a harder exercise next time"
    );
  });
});

describe("after the last T3 set of a workout", () => {
  const entry = {
    exerciseId: "db_row",
    tier: "T3" as const,
    targetSets: 3,
    targetReps: 15,
    weight: 50,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 3,
  };
  const set = (n: number, reps: number, status: SetLog["status"] = "completed"): SetLog => ({
    id: `s${n}`,
    clientId: `s${n}`,
    exerciseId: "db_row",
    tier: "T3",
    setNumber: n,
    targetReps: 15,
    actualReps: reps,
    weight: 50,
    isAMRAP: n === 3,
    completedAt: new Date(2026, 10, 18, 9, n),
    restAfterSeconds: 0,
    status,
    isSubstituted: false,
    location: "gym",
    synced: false,
  });

  it("logging 19 then 20 on a 50 lb dumbbell row: stays, then goes up", () => {
    const at19 = [set(1, 15), set(2, 15), set(3, 19)];
    expect(t3NextTimeAfterSet(at19[2], [entry], at19, EQUIPMENT)?.text).toBe(
      "19 of 20 on the last set: stays at 50 lbs next time"
    );
    const at20 = [set(1, 15), set(2, 15), set(3, 20)];
    expect(t3NextTimeAfterSet(at20[2], [entry], at20, EQUIPMENT)).toEqual({
      exerciseId: "db_row",
      text: "20 of 20 on the last set: 55 lbs next time",
    });
  });

  it("says nothing before the last set, or when a set was held", () => {
    const two = [set(1, 15), set(2, 15)];
    expect(t3NextTimeAfterSet(two[1], [{ ...entry, completedSets: 2 }], two, EQUIPMENT)).toBeNull();
    const held = [set(1, 15, "skipped_pain"), set(2, 15), set(3, 25)];
    expect(t3NextTimeAfterSet(held[2], [entry], held, EQUIPMENT)).toBeNull();
  });
});
