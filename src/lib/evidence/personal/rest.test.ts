import { describe, expect, it } from "vitest";
import { getRestSeconds } from "@/lib/restTimes";
import { makeSession, makeSet } from "@/lib/workout/testFixtures";
import type { SetLog, Tier, WorkoutSession } from "@/types";
import {
  MAX_SET_GAP_SECONDS,
  PERSONAL_MIN_GROUP_SIZE,
  SET_DURATION_ALLOWANCE_SECONDS,
  SHORT_REST_MARGIN_SECONDS,
} from "./constants";
import { restLengthEvidence, restPairs } from "./rest";
import { emptyLog } from "./testHelpers";

const START = new Date("2026-10-01T17:00:00Z").getTime();
const NOW = new Date("2026-11-15T12:00:00Z");
const T1_PLANNED = getRestSeconds("T1", { mode: "maintaining" }); // 180
const T2_PLANNED = getRestSeconds("T2", { mode: "maintaining" }); // 120

interface SetSpec {
  /** Seconds after the workout start the set was logged. */
  at: number;
  reps?: number;
  target?: number;
  tier?: Tier;
  exerciseId?: string;
  status?: SetLog["status"];
  isAMRAP?: boolean;
}

let workoutCounter = 0;

/** A finished workout with the given sets, in the maintaining phase. */
function workout(specs: SetSpec[], overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  workoutCounter += 1;
  const id = `w${workoutCounter}`;
  const startMs = START + workoutCounter * 2 * 3600_000;
  const numbers = new Map<string, number>();
  const sets = specs.map((spec, i) => {
    const tier = spec.tier ?? "T1";
    const exerciseId = spec.exerciseId ?? "squat";
    const key = `${exerciseId}|${tier}`;
    numbers.set(key, (numbers.get(key) ?? 0) + 1);
    const target = spec.target ?? 3;
    const reps = spec.reps ?? target;
    return makeSet(exerciseId, tier, {
      id: `${id}-s${i}`,
      setNumber: numbers.get(key)!,
      targetReps: target,
      actualReps: reps,
      isAMRAP: spec.isAMRAP ?? false,
      completedAt: new Date(startMs + spec.at * 1000),
      status: spec.status ?? (reps >= target ? "completed" : "failed"),
    });
  });
  return makeSession({
    id,
    clientId: id,
    startedAt: new Date(startMs),
    completedAt: new Date(startMs + 3600_000),
    sets,
    completionContext: {
      phaseMode: "maintaining",
      gymBarbellIncrementLbs: 5,
      dumbbellIncrementLbs: 5,
    },
    ...overrides,
  });
}

/** Gap between logging two sets that gives `rest` seconds of rest. */
const gapFor = (rest: number) => rest + SET_DURATION_ALLOWANCE_SECONDS;

describe("restPairs", () => {
  it("reads rest as the gap between two sets of the same lift less the allowance for the set", () => {
    const w = workout([
      { at: 0 },
      { at: gapFor(150) },
      { at: gapFor(150) + gapFor(200) },
    ]);
    const pairs = restPairs([w], NOW);
    expect(pairs.map((p) => p.restSeconds)).toEqual([150, 200]);
    expect(pairs.every((p) => p.plannedSeconds === T1_PLANNED)).toBe(true);
  });

  it("leaves out the first set of each lift, warm-ups and lighter tiers", () => {
    const w = workout([
      { at: 0, tier: "warmup", target: 5 },
      { at: 60, tier: "warmup", target: 3 },
      { at: 200 }, // first T1 set: no rest before it is known
      { at: 200 + gapFor(180) },
      { at: 1000, tier: "T2", exerciseId: "bench", target: 10 }, // first T2 set
      { at: 1000 + gapFor(120), tier: "T2", exerciseId: "bench", target: 10 },
      { at: 1500, tier: "T3", exerciseId: "lat_pulldown", target: 15 },
      { at: 1500 + gapFor(90), tier: "T3", exerciseId: "lat_pulldown", target: 15 },
    ]);
    const pairs = restPairs([w], NOW);
    expect(pairs.map((p) => [p.tier, p.exerciseId])).toEqual([
      ["T1", "squat"],
      ["T2", "bench"],
    ]);
  });

  it("leaves out gaps over the limit and gaps too short to have done the set", () => {
    const w = workout([
      { at: 0 },
      { at: MAX_SET_GAP_SECONDS + 1 }, // a break
      { at: MAX_SET_GAP_SECONDS + 1 + SET_DURATION_ALLOWANCE_SECONDS }, // logged after the fact
      { at: MAX_SET_GAP_SECONDS + 1 + SET_DURATION_ALLOWANCE_SECONDS + gapFor(170) },
    ]);
    expect(restPairs([w], NOW).map((p) => p.restSeconds)).toEqual([170]);
  });

  it("counts a rest as short when it is the margin or more under the plan", () => {
    const shortest = T1_PLANNED - SHORT_REST_MARGIN_SECONDS;
    const w = workout([
      { at: 0 },
      { at: gapFor(shortest - 1) },
      { at: gapFor(shortest - 1) + gapFor(shortest) },
    ]);
    expect(restPairs([w], NOW).map((p) => p.short)).toEqual([true, false]);
  });

  it("plans the rest by the phase the workout was finished in", () => {
    const w = workout([{ at: 0 }, { at: gapFor(170) }], {
      completionContext: { phaseMode: "cutting", gymBarbellIncrementLbs: 5, dumbbellIncrementLbs: 5 },
    });
    const [pair] = restPairs([w], NOW);
    expect(pair.plannedSeconds).toBe(getRestSeconds("T1", { mode: "cutting" }));
    expect(pair.short).toBe(true); // 170 < 210 - 30
  });

  it("measures the next set's shortfall; reps above the target count as none", () => {
    const w = workout([
      { at: 0 },
      { at: gapFor(150), reps: 1 },
      { at: gapFor(150) * 2, reps: 8, isAMRAP: true },
    ]);
    expect(restPairs([w], NOW).map((p) => p.shortfall)).toEqual([-2, 0]);
  });

  it("leaves out sets skipped or lightened for a reason, and a load drop", () => {
    const w = workout([
      { at: 0 },
      { at: gapFor(150), status: "skipped_pain", reps: 0 },
      { at: gapFor(150) * 2 },
      { at: gapFor(150) * 3, status: "autoregulated_load_drop" },
      { at: gapFor(150) * 4 },
    ]);
    expect(restPairs([w], NOW)).toHaveLength(0);
  });

  it("reads only finished, live workouts finished by now", () => {
    const sets: SetSpec[] = [{ at: 0 }, { at: gapFor(150) }];
    const unfinished = workout(sets, { completedAt: null });
    const deleted = workout(sets, { deletedAt: 1 });
    const later = workout(sets, { completedAt: new Date(NOW.getTime() + 1000) });
    expect(restPairs([unfinished, deleted, later], NOW)).toHaveLength(0);
  });
});

describe("restLengthEvidence", () => {
  /** A T1 lift whose second set followed a rest of `rest` seconds and got `reps` of 3. */
  const pairWorkout = (rest: number, reps: number, tier: Tier = "T1") =>
    workout([
      { at: 0, tier, target: tier === "T1" ? 3 : 10 },
      { at: gapFor(rest), reps, tier, target: tier === "T1" ? 3 : 10 },
    ]);

  it("hides the numbers below the minimum and says how many more are needed", () => {
    const workouts = [
      ...Array.from({ length: 2 }, () => pairWorkout(100, 2)),
      ...Array.from({ length: 7 }, () => pairWorkout(180, 3)),
    ];
    const out = restLengthEvidence({ ...emptyLog(), workouts }, NOW);
    expect(out.result).toBeNull();
    expect(out.exposed.count).toBe(2);
    expect(out.reference.count).toBe(7);
    expect(out.needed).toEqual({ exposed: PERSONAL_MIN_GROUP_SIZE - 2, reference: 0 });
  });

  it("agrees with the research when short rests cost reps", () => {
    const workouts = [
      ...[2, 1, 2, 2, 1, 2].map((reps) => pairWorkout(100, reps)),
      ...[3, 3, 3, 2, 3, 3, 3, 3].map((reps) => pairWorkout(180, reps)),
    ];
    const out = restLengthEvidence({ ...emptyLog(), workouts }, NOW);
    expect(out.exposed.count).toBe(6);
    expect(out.reference.count).toBe(8);
    expect(out.result!.exposedMean).toBeCloseTo(-4 / 3, 10);
    expect(out.result!.referenceMean).toBeCloseTo(-1 / 8, 10);
    expect(out.result!.verdict).toBe("agrees");
  });

  it("compares sets within their own tier", () => {
    // Every T1 set rested short and every T2 set rested fully: nothing like for like.
    const workouts = [
      ...Array.from({ length: 6 }, () => pairWorkout(100, 3, "T1")),
      ...Array.from({ length: 6 }, () => pairWorkout(T2_PLANNED, 8, "T2")),
    ];
    const out = restLengthEvidence({ ...emptyLog(), workouts }, NOW);
    expect(out.exposed.count).toBe(0);
    expect(out.reference.count).toBe(0);
    expect(out.unmatched).toBe(12);
    expect(out.result).toBeNull();
  });

  it("states the allowance, the margin and the gap limit it used", () => {
    const text = restLengthEvidence(emptyLog(), NOW).method.join(" ");
    expect(text).toContain(`${SET_DURATION_ALLOWANCE_SECONDS} seconds`);
    expect(text).toContain(`${SHORT_REST_MARGIN_SECONDS} seconds`);
    expect(text).toContain(`${MAX_SET_GAP_SECONDS / 60} minutes`);
  });
});
