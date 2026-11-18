import { describe, expect, it } from "vitest";
import { pooledLiftEstimate, type StrengthSet } from "@/lib/strength";
import type { SetLog, WorkoutSession } from "@/types";
import {
  OWN_HISTORY_WINDOW_WEEKS,
  ownHistoryOf,
  pooledEstimateOf,
  strengthSetOf,
  strengthSetsOf,
  transferRatioOf,
} from "./strength";
import { makeSession, makeSet } from "./testFixtures";

const at = new Date("2026-11-10T18:00:00Z");

function set(overrides: Partial<SetLog>): SetLog {
  return makeSet("squat", "T1", { completedAt: at, ...overrides });
}

describe("strengthSetOf", () => {
  it("is the barbell lift as lifted, a working set with no role", () => {
    expect(strengthSetOf(set({ id: "a", weight: 200, actualReps: 5, isAMRAP: true, repsInReserve: "1-2" }), "w1")).toEqual({
      id: "a",
      sessionId: "w1",
      exerciseId: "squat",
      weight: 200,
      perHand: false,
      reps: 5,
      repsInReserve: "1-2",
      role: "working",
      tier: "T1",
      isAMRAP: true,
      date: at,
    });
  });

  it("is the home exercise performed, per hand when it is held with a dumbbell in each hand", () => {
    const split = strengthSetOf(
      set({ id: "b", weight: 55, isSubstituted: true, substituteExerciseId: "bulgarian_split_squat", location: "home" }),
      "w2"
    );
    expect(split).toMatchObject({ exerciseId: "bulgarian_split_squat", weight: 55, perHand: true });
    const goblet = strengthSetOf(set({ id: "c", weight: 60, isSubstituted: true, substituteExerciseId: "goblet_squat" }), "w2");
    expect(goblet).toMatchObject({ exerciseId: "goblet_squat", weight: 60, perHand: false });
  });

  it("keeps the set's role: warm-up, ramp, back-off and drop (with the set it continues)", () => {
    expect(strengthSetOf(set({ tier: "warmup" }), "w").role).toBe("warmup");
    expect(strengthSetOf(set({ role: "work" }), "w").role).toBe("working");
    expect(strengthSetOf(set({ role: "ramp" }), "w").role).toBe("ramp");
    expect(strengthSetOf(set({ role: "backoff" }), "w").role).toBe("backoff");
    expect(strengthSetOf(set({ role: "drop", dropOf: "x" }), "w")).toMatchObject({ role: "drop", dropOf: "x" });
  });
});

describe("strengthSetsOf", () => {
  it("reads the finished, live workouts only", () => {
    const done: WorkoutSession = { ...makeSession({ id: "done", completedAt: at }), sets: [set({ id: "1" })] };
    const open: WorkoutSession = { ...makeSession({ id: "open" }), completedAt: null, sets: [set({ id: "2" })] };
    const gone: WorkoutSession = { ...makeSession({ id: "gone", completedAt: at }), deletedAt: 5, sets: [set({ id: "3" })] };
    expect(strengthSetsOf([done, open, gone]).map((s) => [s.id, s.sessionId])).toEqual([["1", "done"]]);
  });
});

describe("pooledEstimateOf and transferRatioOf", () => {
  it("are the library's answers, worked out once per list of sets", () => {
    const sets = strengthSetsOf([
      { ...makeSession({ id: "w", completedAt: at }), sets: [set({ id: "1", weight: 200, actualReps: 8, isAMRAP: true })] },
    ]);
    const first = pooledEstimateOf(sets, "squat");
    expect(first).toEqual(pooledLiftEstimate("squat", sets));
    expect(pooledEstimateOf(sets, "squat")).toBe(first);
    expect(pooledEstimateOf([], "squat")).toBeNull();
    expect(transferRatioOf(sets, "squat", "bulgarian_split_squat")).toMatchObject({ ratio: 0.5, pairs: 0, basis: "prior" });
  });
});

describe("ownHistoryOf: a home exercise's own recent sets", () => {
  const DAY = 86_400_000;
  const newest = new Date("2026-11-10T18:00:00Z").getTime();
  const s = (id: string, daysAgo: number, extra: Partial<StrengthSet> = {}): StrengthSet => ({
    id,
    sessionId: `w${daysAgo}`,
    exerciseId: "bulgarian_split_squat",
    weight: 25,
    perHand: true,
    reps: 9,
    repsInReserve: null,
    role: "working",
    tier: "T1",
    isAMRAP: true,
    date: new Date(newest - daysAgo * DAY),
    ...extra,
  });
  const barbell = s("bar", 0, { exerciseId: "squat", weight: 200, perHand: false, reps: 8 });

  it("is the latest session's estimate inside the window, the heaviest weight lifted there, and when it was last done", () => {
    const sets = [barbell, s("a", 7), s("b", 20, { weight: 30, reps: 3, tier: "T2", isAMRAP: false })];
    const own = ownHistoryOf(sets, "bulgarian_split_squat");
    // 50 x (1 + 9/30) = 65, from the latest session.
    expect(own.estimate).toMatchObject({ value: 65, basis: "own" });
    expect(own.estimate?.own?.sessionId).toBe("w7");
    expect(own.heaviest).toBe(30);
    expect(own.lastDone).toBe(newest - 7 * DAY);
    expect(ownHistoryOf(sets, "bulgarian_split_squat")).toBe(own);
  });

  it("counts nothing older than the window, which runs back from the newest set of any exercise", () => {
    const days = OWN_HISTORY_WINDOW_WEEKS * 7;
    expect(ownHistoryOf([barbell, s("old", days + 1)], "bulgarian_split_squat")).toEqual({
      estimate: null,
      heaviest: null,
      lastDone: newest - (days + 1) * DAY,
    });
    expect(ownHistoryOf([barbell, s("edge", days)], "bulgarian_split_squat").estimate?.value).toBe(65);
  });

  it("leaves out weights set by hand, warm-ups, drops and sets with no load", () => {
    const sets = [
      barbell,
      s("target", 1, { provisional: true, weight: 60 }),
      s("warm", 2, { role: "warmup", weight: 50 }),
      s("drop", 2, { role: "drop", weight: 45, dropOf: "warm" }),
      s("empty", 2, { weight: 0 }),
    ];
    expect(ownHistoryOf(sets, "bulgarian_split_squat")).toEqual({ estimate: null, heaviest: null, lastDone: null });
    expect(ownHistoryOf([], "bulgarian_split_squat")).toEqual({ estimate: null, heaviest: null, lastDone: null });
  });
});
