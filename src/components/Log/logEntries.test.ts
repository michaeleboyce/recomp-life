import { describe, expect, it } from "vitest";
import { set, workout } from "@/components/LogEdit/testFixtures";
import type { BodyweightLog, RunLog } from "@/types";
import {
  buildEntries,
  countByDay,
  dayKey,
  dayLabel,
  daysInMonth,
  filterEntries,
  groupByDay,
  shiftMonth,
  workoutResultLine,
} from "./logEntries";

const run = (id: string, date: string): RunLog => ({
  id,
  clientId: id,
  date: new Date(date),
  durationMinutes: 30,
  distanceMiles: 3,
  type: "outdoor",
  category: "easy",
  notes: "",
  perceivedEffort: 2,
  updatedAt: 1,
  deletedAt: null,
  synced: true,
});
const weighIn = (id: string, date: string): BodyweightLog => ({
  id,
  clientId: id,
  date: new Date(date),
  weight: 182.4,
  timeOfDay: "morning",
  updatedAt: 1,
  deletedAt: null,
  synced: true,
});

const sources = {
  workouts: [workout({ id: "w1", startedAt: new Date("2026-11-10T09:00:00") })],
  runs: [run("r1", "2026-11-10T18:00:00"), run("r2", "2026-11-08T07:00:00")],
  weighIns: [weighIn("b1", "2026-11-11T07:00:00"), weighIn("bad", "not a date")],
};

describe("buildEntries", () => {
  it("merges every table newest first and drops unreadable dates", () => {
    expect(buildEntries(sources).map((e) => e.id)).toEqual(["b1", "r1", "w1", "r2"]);
  });
});

describe("filterEntries", () => {
  const entries = buildEntries(sources);
  it("keeps the kinds of a filter", () => {
    expect(filterEntries(entries, "workouts").map((e) => e.id)).toEqual(["w1"]);
    expect(filterEntries(entries, "cardio").map((e) => e.id)).toEqual(["r1", "r2"]);
    expect(filterEntries(entries, "weighIns").map((e) => e.id)).toEqual(["b1"]);
    expect(filterEntries(entries, "all")).toHaveLength(4);
  });
  it("narrows to one local day", () => {
    expect(filterEntries(entries, "all", "2026-11-10").map((e) => e.id)).toEqual(["r1", "w1"]);
    expect(filterEntries(entries, "weighIns", "2026-11-10")).toEqual([]);
  });
});

describe("groupByDay and countByDay", () => {
  it("groups consecutive entries by local day", () => {
    const groups = groupByDay(buildEntries(sources));
    expect(groups.map((g) => [g.key, g.entries.length])).toEqual([
      ["2026-11-11", 1],
      ["2026-11-10", 2],
      ["2026-11-08", 1],
    ]);
    expect(countByDay(buildEntries(sources)).get("2026-11-10")).toBe(2);
  });
});

describe("calendar helpers", () => {
  it("lists a month's days and moves across years", () => {
    expect(daysInMonth({ year: 2026, month: 1 })).toHaveLength(28);
    expect(daysInMonth({ year: 2026, month: 10 }).map(dayKey).at(-1)).toBe("2026-11-30");
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });
  it("labels today, yesterday and other days", () => {
    const now = new Date("2026-11-12T12:00:00");
    expect(dayLabel(new Date("2026-11-12T01:00:00"), now)).toBe("Today");
    expect(dayLabel(new Date("2026-11-11T23:00:00"), now)).toBe("Yesterday");
    expect(dayLabel(new Date("2026-11-08T09:00:00"), now)).toBe("Sun, Nov 8");
    expect(dayLabel(new Date("2025-11-08T09:00:00"), now)).toBe("Sat, Nov 8, 2025");
  });
});

describe("workoutResultLine", () => {
  it("names the T1 and T2 weights and says all targets were hit", () => {
    const w = workout({
      sets: [
        set({ id: "a", weight: 195 }),
        set({ id: "b", exerciseId: "bench", tier: "T2", targetReps: 10, actualReps: 10, weight: 135 }),
      ],
    });
    expect(workoutResultLine(w)).toBe("Squat 195 lbs, Bench Press 135 lbs · all targets hit");
  });
  it("names the lifts that missed reps, T3 included", () => {
    const w = workout({
      sets: [
        set({ id: "a", actualReps: 1, status: "failed" }),
        set({ id: "c", exerciseId: "lat_pulldown", tier: "T3", targetReps: 15, actualReps: 12, weight: 90 }),
      ],
    });
    expect(workoutResultLine(w)).toBe("Squat 205 lbs · missed reps on Squat, Lat Pulldown");
  });
  it("says when nothing was logged", () => {
    expect(workoutResultLine(workout({ sets: [] }))).toBe("no sets logged");
  });
});
