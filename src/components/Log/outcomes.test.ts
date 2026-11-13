import { describe, expect, it } from "vitest";
import { set, workout } from "@/components/LogEdit/testFixtures";
import { emptyLiftState } from "@/lib/rebuild";
import type { LiftState, PrescribedEntry, SetLog } from "@/types";
import { describeOutcomes } from "./outcomes";

const state = (exerciseId: string, overrides: Partial<LiftState> = {}): LiftState => ({
  ...emptyLiftState(exerciseId),
  ...overrides,
});

const PRESCRIBED: PrescribedEntry[] = [
  { exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" },
  { exerciseId: "bench", tier: "T2", weight: 135, sets: 3, reps: 10, stage: "3x10" },
  { exerciseId: "lat_pulldown", tier: "T3", weight: 90, sets: 3, reps: 15 },
];

const sets = (exerciseId: string, tier: SetLog["tier"], count: number, targetReps: number, last?: number) =>
  Array.from({ length: count }, (_, i) =>
    set({
      id: `${exerciseId}-${i}`,
      exerciseId,
      tier,
      setNumber: i + 1,
      targetReps,
      actualReps: i === count - 1 && last !== undefined ? last : targetReps,
    })
  );

const session = (all: SetLog[]) => workout({ prescribed: PRESCRIBED, sets: all });
const text = (outcomes: ReturnType<typeof describeOutcomes>) => outcomes.map((o) => `${o.exerciseId} ${o.text}`);

describe("describeOutcomes", () => {
  it("passed T1 and T2, T3 last set reached the target", () => {
    const after = [
      state("squat", { t1Weight: 195, t1Stage: "5x3" }),
      state("bench", { t2Weight: 140, t2Stage: "3x10" }),
      state("lat_pulldown", { t3Weight: 95 }),
    ];
    const s = session([...sets("squat", "T1", 5, 3), ...sets("bench", "T2", 3, 10), ...sets("lat_pulldown", "T3", 3, 15, 26)]);
    expect(text(describeOutcomes(s, after, undefined))).toEqual([
      "squat passed: next 195 lbs 5x3",
      "bench passed: next 140 lbs 3x10",
      "lat_pulldown last set reached 25: next 95 lbs",
    ]);
  });

  it("missed T1 moves stage; T3 short of the target stays", () => {
    const after = [
      state("squat", { t1Weight: 190, t1Stage: "6x2" }),
      state("bench", { t2Weight: 135, t2Stage: "3x10" }),
      state("lat_pulldown", { t3Weight: 90 }),
    ];
    const s = session([...sets("squat", "T1", 5, 3, 1), ...sets("bench", "T2", 2, 10), ...sets("lat_pulldown", "T3", 3, 15, 18)]);
    const outcomes = describeOutcomes(s, after, undefined);
    expect(text(outcomes)).toEqual([
      "squat missed: moves to 6x2 at 190 lbs",
      "bench partly done: no change",
      "lat_pulldown stays at 90 lbs (last set 18 of 25 reps)",
    ]);
    expect(outcomes.map((o) => o.kind)).toEqual(["missed", "partial", "t3Same"]);
  });

  it("a miss at the last stage is a reset, and a T3 raised by total reps says so", () => {
    const prescribed: PrescribedEntry[] = [
      { exerciseId: "squat", tier: "T1", weight: 200, sets: 10, reps: 1, stage: "10x1" },
      { exerciseId: "lat_pulldown", tier: "T3", weight: 90, sets: 3, reps: 15 },
    ];
    const after = [state("squat", { t1Weight: 170, t1Stage: "5x3" }), state("lat_pulldown", { t3Weight: 95 })];
    const s = workout({
      prescribed,
      sets: [...sets("squat", "T1", 10, 1, 0), ...sets("lat_pulldown", "T3", 3, 20, 20)],
    });
    expect(text(describeOutcomes(s, after, undefined))).toEqual([
      "squat missed: resets to 170 lbs 5x3",
      "lat_pulldown sets totalled 50+ reps: next 95 lbs",
    ]);
  });

  it("pain freezes and a skipped lift is not done", () => {
    const after = [state("squat", { t1Weight: 190, t1Stage: "5x3" }), state("lat_pulldown", { t3Weight: 90 })];
    const s = session(sets("squat", "T1", 5, 3).map((x, i) => (i === 0 ? { ...x, status: "skipped_pain" as const } : x)));
    expect(text(describeOutcomes(s, after, undefined))).toEqual([
      "squat held: no change",
      "lat_pulldown not done: stays at 90 lbs",
    ]);
  });

  it("falls back to the previous snapshot when the session has no stored prescription", () => {
    const before = [state("squat", { t1Weight: 190, t1Stage: "5x3" })];
    const after = [state("squat", { t1Weight: 195, t1Stage: "5x3" })];
    const s = workout({ sets: sets("squat", "T1", 5, 3) });
    expect(text(describeOutcomes(s, after, before))).toEqual(["squat passed: next 195 lbs 5x3"]);
  });

  it("says nothing without a snapshot", () => {
    expect(describeOutcomes(session(sets("squat", "T1", 5, 3)), undefined, undefined)).toEqual([]);
  });
});
