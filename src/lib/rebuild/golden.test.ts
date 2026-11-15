// Golden test for the program's core: the lift states and the per-workout snapshots
// that `rebuildDerived` gives for the demo log at a fixed `now`, compared with a file
// recorded before the progression code was restructured to return its outcomes.
// A difference here means behaviour changed. Do not regenerate the file to make this
// pass; find out why the numbers moved.
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
