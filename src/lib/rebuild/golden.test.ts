// Golden test for the program's core: the lift states, the home exercises' states and
// the per-workout snapshots of both that `rebuildDerived` gives for the demo log at a
// fixed `now`, compared with a recorded file. A difference here means behaviour changed.
// Do not regenerate the file to make this pass; find out why the numbers moved.
//
// Regenerated on purpose on 2026-11-15 for the strength model (home exercises progress
// their own weight, the barbell weight does not move at home) and the demo's new home
// block and drop set; the field-by-field diff is in that commit's message.
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

/** Plain JSON data: dates as local stamps, maps as objects, undefined fields dropped. */
function plain(value: unknown): unknown {
  if (value instanceof Date) return localStamp(value);
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]));
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, plain(item)])
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

  it("the recorded home block is not trivial: a dumbbell step, the cap by reps and a harder variant", () => {
    type Row = { id: string; weight: number; extraReps: number; current: boolean };
    const first = golden.variantSnapshots["demo-workout-01"] as Row[];
    const last = golden.variantStates as Row[];
    const split = (rows: Row[]) => rows.find((row) => row.id === "squat|bulgarian_split_squat|T1")!;
    expect(split(first).weight).toBe(80);
    expect(split(last)).toMatchObject({ weight: 80, extraReps: 1 });
    expect(last.find((row) => row.id === "deadlift|single_leg_db_rdl|T1")).toMatchObject({ current: true });
    expect(last.find((row) => row.id === "deadlift|db_rdl|T1")).toMatchObject({ current: false });
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
