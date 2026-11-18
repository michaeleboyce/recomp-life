// Golden test for the program's core: the lift states, the home exercises' states and
// the per-workout snapshots of both that `rebuildDerived` gives for the demo log at a
// fixed `now`, compared with a recorded file. A difference here means behaviour changed.
// Do not regenerate the file to make this pass; find out why the numbers moved.
//
// Regenerated on purpose on 2026-11-15 for the strength model (home exercises progress
// their own weight, the barbell weight does not move at home) and the demo's new home
// block and drop set; the field-by-field diff is in that commit's message. Regenerated
// on purpose again on 2026-11-16 for seeding from the strength estimate (H3) and
// re-entry (H6); see that commit's message. Regenerated on purpose on 2026-11-17 for F6
// (a first home weight follows the exercise's own recent history): only seed fields
// changed (two T2 seeds are now "history" with the session they came from, two seeds
// gained `lastDone`); no weight, stage or lift state moved. Regenerated on purpose on
// 2026-11-18 for the T3 threshold sized to the step: only `t3Weight` (db_row,
// lat_pulldown) and the T3 home exercise's `weight` and `passesSinceGym` changed, each
// because a T3 last set between its new threshold and 24 now goes up.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { rebuildDerived } from "./fold";

const NOW = new Date(2026, 10, 14, 12, 0, 0);
const GOLDEN_PATH = path.resolve(__dirname, "__fixtures__/demo-rebuild.golden.json");

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock time, so the file reads the same in every time zone. */
function localStamp(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Fields that hold a time as epoch milliseconds; recorded as local stamps like dates. */
const TIME_KEYS = new Set(["at", "lastDone"]);

/** Plain JSON data: dates and times as local stamps, maps as objects, undefined fields dropped. */
function plain(value: unknown, key?: string): unknown {
  if (value instanceof Date) return localStamp(value);
  if (typeof value === "number" && key !== undefined && TIME_KEYS.has(key)) return localStamp(new Date(value));
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([k, item]) => [k, plain(item)]));
  }
  if (Array.isArray(value)) return value.map((item) => plain(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([k, item]) => [k, plain(item, k)])
    );
  }
  return value;
}

describe("rebuildDerived: golden result for the demo log", () => {
  const data = generateDemoData(NOW);
  const rebuilt = rebuildDerived({
    workouts: data.workouts,
    adjustments: data.liftAdjustments,
    settings: DEFAULT_USER_PROFILE.settings,
  });
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")) as {
    now: string;
    liftStates: unknown[];
    snapshots: Record<string, unknown[]>;
    variantStates: unknown[];
    variantSnapshots: Record<string, unknown[]>;
  };

  it("was recorded for the same now", () => {
    expect(localStamp(NOW)).toBe(golden.now);
  });

  it("gives the recorded lift states", () => {
    expect(plain(rebuilt.liftStates)).toEqual(golden.liftStates);
  });

  it("gives the recorded snapshot after every workout", () => {
    expect([...rebuilt.snapshots.keys()]).toEqual(Object.keys(golden.snapshots));
    expect(Object.keys(golden.snapshots)).toHaveLength(data.workouts.length);
    for (const [workoutId, states] of rebuilt.snapshots) {
      expect(plain(states), workoutId).toEqual(golden.snapshots[workoutId]);
    }
  });

  it("gives the recorded home exercises' states, and their snapshot after every workout", () => {
    expect(plain(rebuilt.variantStates)).toEqual(golden.variantStates);
    expect([...rebuilt.variantSnapshots.keys()]).toEqual(Object.keys(golden.variantSnapshots));
    for (const [workoutId, states] of rebuilt.variantSnapshots) {
      expect(plain(states), workoutId).toEqual(golden.variantSnapshots[workoutId]);
    }
  });

  // Regenerated on purpose on 2026-11-16 (H3, H6): the demo plans as the Ready screen
  // does, so a first home weight is the exercise's starting ratio (from the strength
  // estimate once there is one) and the first gym session after the block takes its
  // re-entry weight; gym passes then earn the home exercises steps for their next home
  // session. The cap policy is covered by the fold and variant tests.
  it("the recorded home block is not trivial: dumbbell steps, a seed from its own history, steps the gym earned", () => {
    type Row = {
      id: string;
      weight: number;
      current: boolean;
      passesSinceGym: number;
      gymPassesSinceHome?: number;
      seed: { source: string };
    };
    const first = golden.variantSnapshots["demo-workout-01"] as Row[];
    const lastHome = golden.variantSnapshots["demo-workout-08"] as Row[];
    const last = golden.variantStates as Row[];
    const split = (rows: Row[], tier = "T1") => rows.find((row) => row.id === `squat|bulgarian_split_squat|${tier}`)!;
    expect(split(first)).toMatchObject({ weight: 55, seed: { source: "ratio" } });
    expect(split(lastHome)).toMatchObject({ weight: 60, passesSinceGym: 2 });
    // F6: the T2 split squat starts from the exercise's own T1 sessions, not the squat's estimate.
    expect(split(lastHome, "T2").seed.source).toBe("history");
    expect(split(last)).toMatchObject({ weight: 60, current: true, passesSinceGym: 0 });
    expect(split(last).gymPassesSinceHome).toBeGreaterThan(0);
    const squatAfterBlock = (golden.snapshots["demo-workout-09"] as Array<{ exerciseId: string; t1Weight: number }>).find(
      (row) => row.exerciseId === "squat"
    )!;
    // Re-entry put the bar at 210 (190 plus two home steps) and the gym pass added 10.
    expect(squatAfterBlock.t1Weight).toBe(220);
  });

  it("the recorded log is not trivial: a pass, a stage change and a T3 increase all occur", () => {
    type Row = { exerciseId: string; t1Weight: number; t2Stage: string; t3Weight: number };
    const first = golden.snapshots["demo-workout-01"] as Row[];
    const last = golden.liftStates as Row[];
    const startOf = (id: string) => first.find((row) => row.exerciseId === id)!;
    expect(last.some((row) => row.t1Weight > startOf(row.exerciseId).t1Weight)).toBe(true);
    expect(last.some((row) => row.t2Stage !== "3x10")).toBe(true);
    expect(last.some((row) => row.t3Weight > startOf(row.exerciseId).t3Weight)).toBe(true);
  });
});
