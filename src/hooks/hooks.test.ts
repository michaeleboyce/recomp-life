import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import {
  useActivities,
  useBodyweightLog,
  useCompletedWorkouts,
  useE1RMs,
  useLiftAdjustments,
  useLiftStates,
  usePainEntries,
  useProfile,
  useRuns,
  useSettings,
  useUnfinishedWorkout,
  useWorkout,
} from "./index";
import {
  clearDb,
  makeE1RM,
  makeLiftState,
  makeProfile,
  makeWorkout,
} from "@/lib/data/testUtils";
import type { ActivityLog, PainSorenessEntry, RunLog } from "@/types";

const HOUR = 60 * 60 * 1000;

/**
 * A date as rows synced before the date fix hold it: an ISO string. IndexedDB orders
 * every Date before every string, so an index on such a field is not chronological.
 */
const iso = (date: string | number) => new Date(date).toISOString() as unknown as Date;

beforeEach(clearDb);

/** Waits until the hook has finished its first query (left `undefined`). */
async function loaded<T>(hook: () => T) {
  const r = renderHook(hook);
  await waitFor(() => expect(r.result.current).not.toBeUndefined());
  return r;
}

describe("useProfile / useSettings", () => {
  it("return undefined while loading", () => {
    expect(renderHook(() => useProfile()).result.current).toBeUndefined();
    expect(renderHook(() => useSettings()).result.current).toBeUndefined();
  });

  it("return null once loaded when there is no profile", async () => {
    expect((await loaded(() => useProfile())).result.current).toBeNull();
    expect((await loaded(() => useSettings())).result.current).toBeNull();
  });

  it("return the profile and its settings, and stay live", async () => {
    const profile = makeProfile();
    await db.userProfile.put(profile);
    const p = await loaded(() => useProfile());
    const s = await loaded(() => useSettings());
    expect(p.result.current).toEqual(profile);
    expect(s.result.current).toEqual(profile.settings);

    await act(() =>
      db.userProfile.update(profile.id, { settings: { ...profile.settings, showRPE: false } })
    );
    await waitFor(() => expect(s.result.current?.showRPE).toBe(false));
  });
});

describe("useLiftStates", () => {
  it("returns every lift state", async () => {
    await db.liftStates.bulkPut([
      makeLiftState({ exerciseId: "squat" }),
      makeLiftState({ exerciseId: "bench" }),
    ]);
    const r = await loaded(() => useLiftStates());
    expect(r.result.current!.map((l) => l.exerciseId).sort()).toEqual(["bench", "squat"]);
  });
});

describe("useWorkout", () => {
  it("returns null when no id is given", async () => {
    expect((await loaded(() => useWorkout(undefined))).result.current).toBeNull();
    expect((await loaded(() => useWorkout(null))).result.current).toBeNull();
  });

  it("returns null for an unknown id and the workout for a known one", async () => {
    const w = makeWorkout({ id: "w1" });
    await db.workouts.put(w);
    expect((await loaded(() => useWorkout("nope"))).result.current).toBeNull();
    expect((await loaded(() => useWorkout("w1"))).result.current).toEqual(w);
  });

  it("follows a change of id", async () => {
    await db.workouts.bulkPut([makeWorkout({ id: "w1" }), makeWorkout({ id: "w2" })]);
    const r = renderHook(({ id }) => useWorkout(id), { initialProps: { id: "w1" } });
    await waitFor(() => expect(r.result.current?.id).toBe("w1"));
    r.rerender({ id: "w2" });
    await waitFor(() => expect(r.result.current?.id).toBe("w2"));
  });
});

describe("useCompletedWorkouts", () => {
  it("returns only completed workouts, newest first", async () => {
    await db.workouts.bulkPut([
      makeWorkout({ id: "old", startedAt: new Date("2026-11-01"), completedAt: new Date("2026-11-01") }),
      makeWorkout({ id: "open", startedAt: new Date("2026-11-09"), completedAt: null }),
      makeWorkout({ id: "new", startedAt: new Date("2026-11-08"), completedAt: new Date("2026-11-08") }),
    ]);
    const r = await loaded(() => useCompletedWorkouts());
    expect(r.result.current!.map((w) => w.id)).toEqual(["new", "old"]);
  });

  it("orders by time when some rows hold ISO strings", async () => {
    await db.workouts.bulkPut([
      makeWorkout({ id: "string-old", startedAt: iso("2026-11-01"), completedAt: iso("2026-11-01") }),
      makeWorkout({ id: "date-new", startedAt: new Date("2026-11-08"), completedAt: new Date("2026-11-08") }),
      makeWorkout({ id: "string-mid", startedAt: iso("2026-11-05"), completedAt: iso("2026-11-05") }),
      makeWorkout({ id: "date-older", startedAt: new Date("2026-11-03"), completedAt: new Date("2026-11-03") }),
    ]);
    const r = await loaded(() => useCompletedWorkouts());
    expect(r.result.current!.map((w) => w.id)).toEqual([
      "date-new",
      "string-mid",
      "date-older",
      "string-old",
    ]);
  });

  it("treats a missing completedAt like null: not completed", async () => {
    const noField = makeWorkout({ id: "no-field", startedAt: new Date("2026-11-09") });
    delete (noField as { completedAt?: unknown }).completedAt;
    await db.workouts.bulkPut([
      noField,
      makeWorkout({ id: "done", startedAt: new Date("2026-11-08"), completedAt: new Date("2026-11-08") }),
    ]);
    const r = await loaded(() => useCompletedWorkouts());
    expect(r.result.current!.map((w) => w.id)).toEqual(["done"]);
  });
});

describe("useUnfinishedWorkout", () => {
  it("returns null when nothing is unfinished", async () => {
    await db.workouts.put(makeWorkout({ completedAt: new Date() }));
    expect((await loaded(() => useUnfinishedWorkout())).result.current).toBeNull();
  });

  it("returns the most recent unfinished workout from the last 24 hours", async () => {
    const now = Date.now();
    await db.workouts.bulkPut([
      makeWorkout({ id: "stale", startedAt: new Date(now - 30 * HOUR), completedAt: null }),
      makeWorkout({ id: "older", startedAt: new Date(now - 5 * HOUR), completedAt: null }),
      makeWorkout({ id: "recent", startedAt: new Date(now - 1 * HOUR), completedAt: null }),
      makeWorkout({ id: "done", startedAt: new Date(now - 0.5 * HOUR), completedAt: new Date() }),
    ]);
    const r = await loaded(() => useUnfinishedWorkout());
    expect(r.result.current!.id).toBe("recent");
  });

  it("picks the most recent by time when some rows hold ISO strings", async () => {
    const now = Date.now();
    await db.workouts.bulkPut([
      makeWorkout({ id: "string-older", startedAt: iso(now - 5 * HOUR), completedAt: null }),
      makeWorkout({ id: "date-recent", startedAt: new Date(now - 1 * HOUR), completedAt: null }),
    ]);
    expect((await loaded(() => useUnfinishedWorkout())).result.current!.id).toBe("date-recent");

    await db.workouts.put(
      makeWorkout({ id: "string-newest", startedAt: iso(now - 0.5 * HOUR), completedAt: null })
    );
    await db.workouts.put(
      makeWorkout({ id: "date-middle", startedAt: new Date(now - 0.75 * HOUR), completedAt: null })
    );
    const r = renderHook(() => useUnfinishedWorkout());
    await waitFor(() => expect(r.result.current?.id).toBe("string-newest"));
  });

  it("treats a missing completedAt as unfinished", async () => {
    const noField = makeWorkout({ id: "no-field", startedAt: new Date(Date.now() - HOUR) });
    delete (noField as { completedAt?: unknown }).completedAt;
    await db.workouts.put(noField);
    expect((await loaded(() => useUnfinishedWorkout())).result.current!.id).toBe("no-field");
  });

  it("ignores stale sessions and does not delete them", async () => {
    await db.workouts.put(
      makeWorkout({ id: "stale", startedAt: new Date(Date.now() - 25 * HOUR), completedAt: null })
    );
    expect((await loaded(() => useUnfinishedWorkout())).result.current).toBeNull();
    expect(await db.workouts.get("stale")).toBeDefined();
  });
});

describe("useBodyweightLog", () => {
  it("returns entries oldest first", async () => {
    await db.bodyweight.bulkPut([
      { id: "b2", clientId: "b2", date: new Date("2026-11-02"), weight: 225, timeOfDay: "morning", synced: false },
      { id: "b1", clientId: "b1", date: new Date("2026-11-01"), weight: 226, timeOfDay: "morning", synced: false },
    ]);
    const r = await loaded(() => useBodyweightLog());
    expect(r.result.current!.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("orders by time when some rows hold ISO strings", async () => {
    await db.bodyweight.bulkPut([
      { id: "s1", clientId: "s1", date: iso("2026-11-01"), weight: 226, timeOfDay: "morning", synced: true },
      { id: "d2", clientId: "d2", date: new Date("2026-11-02"), weight: 225, timeOfDay: "morning", synced: false },
      { id: "s3", clientId: "s3", date: iso("2026-11-03"), weight: 224, timeOfDay: "morning", synced: true },
      { id: "d4", clientId: "d4", date: new Date("2026-11-04"), weight: 223, timeOfDay: "morning", synced: false },
    ]);
    const r = await loaded(() => useBodyweightLog());
    expect(r.result.current!.map((b) => b.id)).toEqual(["s1", "d2", "s3", "d4"]);
  });
});

describe("usePainEntries", () => {
  it("returns entries newest first", async () => {
    const entry = (id: string, date: string): PainSorenessEntry => ({
      id, clientId: id, date: new Date(date), region: "neck", sensation: "pain", severity: 2, synced: false,
    });
    await db.painEntries.bulkPut([entry("p1", "2026-11-01"), entry("p2", "2026-11-05")]);
    const r = await loaded(() => usePainEntries());
    expect(r.result.current!.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("orders by time when some rows hold ISO strings", async () => {
    const entry = (id: string, date: Date): PainSorenessEntry => ({
      id, clientId: id, date, region: "neck", sensation: "pain", severity: 2, synced: false,
    });
    await db.painEntries.bulkPut([
      entry("s1", iso("2026-11-01")),
      entry("d2", new Date("2026-11-02")),
      entry("s3", iso("2026-11-03")),
    ]);
    const r = await loaded(() => usePainEntries());
    expect(r.result.current!.map((p) => p.id)).toEqual(["s3", "d2", "s1"]);
  });
});

describe("useE1RMs", () => {
  beforeEach(async () => {
    await db.estimated1RMs.bulkPut([
      makeE1RM({ id: "s2", exerciseId: "squat", date: new Date("2026-11-05") }),
      makeE1RM({ id: "b1", exerciseId: "bench", date: new Date("2026-11-03") }),
      makeE1RM({ id: "s1", exerciseId: "squat", date: new Date("2026-11-01") }),
    ]);
  });

  it("returns all rows oldest first when no exercise is given", async () => {
    const r = await loaded(() => useE1RMs());
    expect(r.result.current!.map((e) => e.id)).toEqual(["s1", "b1", "s2"]);
  });

  it("returns one exercise's rows oldest first", async () => {
    const r = await loaded(() => useE1RMs("squat"));
    expect(r.result.current!.map((e) => e.id)).toEqual(["s1", "s2"]);
  });

  it("orders by time when some rows hold ISO strings", async () => {
    await db.estimated1RMs.bulkPut([
      makeE1RM({ id: "s0", exerciseId: "squat", date: iso("2026-10-30") }),
      makeE1RM({ id: "s1b", exerciseId: "squat", date: iso("2026-11-02") }),
      makeE1RM({ id: "b0", exerciseId: "bench", date: iso("2026-11-04") }),
    ]);
    const all = await loaded(() => useE1RMs());
    expect(all.result.current!.map((e) => e.id)).toEqual(["s0", "s1", "s1b", "b1", "b0", "s2"]);
    const squat = await loaded(() => useE1RMs("squat"));
    expect(squat.result.current!.map((e) => e.id)).toEqual(["s0", "s1", "s1b", "s2"]);
  });
});

describe("useRuns", () => {
  it("returns runs newest first", async () => {
    const run = (id: string, date: string): RunLog => ({
      id, clientId: id, date: new Date(date), durationMinutes: 20, distanceMiles: null,
      type: "outdoor", category: "easy", notes: "", perceivedEffort: 2, synced: false,
    });
    await db.runs.bulkPut([run("r1", "2026-11-01"), run("r2", "2026-11-04")]);
    const r = await loaded(() => useRuns());
    expect(r.result.current!.map((x) => x.id)).toEqual(["r2", "r1"]);
  });

  it("orders by time when some rows hold ISO strings", async () => {
    const run = (id: string, date: Date): RunLog => ({
      id, clientId: id, date, durationMinutes: 20, distanceMiles: null,
      type: "outdoor", category: "easy", notes: "", perceivedEffort: 2, synced: false,
    });
    await db.runs.bulkPut([
      run("s1", iso("2026-11-01")),
      run("d2", new Date("2026-11-02")),
      run("s3", iso("2026-11-03")),
    ]);
    const r = await loaded(() => useRuns());
    expect(r.result.current!.map((x) => x.id)).toEqual(["s3", "d2", "s1"]);
  });
});

describe("useActivities", () => {
  it("returns activities newest first", async () => {
    const activity = (id: string, date: string): ActivityLog => ({
      id, clientId: id, date: new Date(date), kind: "yoga", durationMinutes: 30, style: "flow",
      distanceMiles: null, notes: "", perceivedEffort: 2, synced: false,
    });
    await db.activities.bulkPut([activity("a1", "2026-11-01"), activity("a2", "2026-11-04")]);
    const r = await loaded(() => useActivities());
    expect(r.result.current!.map((x) => x.id)).toEqual(["a2", "a1"]);
  });
});

describe("soft-deleted rows", () => {
  it("are hidden by every log hook", async () => {
    const deletedAt = Date.now();
    await db.workouts.bulkPut([
      makeWorkout({ id: "live", completedAt: new Date() }),
      makeWorkout({ id: "gone", completedAt: new Date(), deletedAt }),
    ]);
    await db.runs.bulkPut([
      { id: "r-live", clientId: "r-live", date: new Date(), durationMinutes: 20, distanceMiles: null,
        type: "outdoor", category: "easy", notes: "", perceivedEffort: 2, synced: false },
      { id: "r-gone", clientId: "r-gone", date: new Date(), durationMinutes: 20, distanceMiles: null,
        type: "outdoor", category: "easy", notes: "", perceivedEffort: 2, synced: false, deletedAt },
    ]);
    await db.bodyweight.bulkPut([
      { id: "b-live", clientId: "b-live", date: new Date(), weight: 200, timeOfDay: "morning", synced: false },
      { id: "b-gone", clientId: "b-gone", date: new Date(), weight: 201, timeOfDay: "morning", synced: false, deletedAt },
    ]);

    const workouts = await loaded(() => useCompletedWorkouts());
    expect(workouts.result.current!.map((w) => w.id)).toEqual(["live"]);
    const gone = await loaded(() => useWorkout("gone"));
    expect(gone.result.current).toBeNull();
    const runs = await loaded(() => useRuns());
    expect(runs.result.current!.map((r) => r.id)).toEqual(["r-live"]);
    const weights = await loaded(() => useBodyweightLog());
    expect(weights.result.current!.map((b) => b.id)).toEqual(["b-live"]);
  });

  it("a row whose deletedAt is cleared is visible again", async () => {
    await db.workouts.put(makeWorkout({ id: "w", completedAt: new Date(), deletedAt: null }));
    const workouts = await loaded(() => useCompletedWorkouts());
    expect(workouts.result.current!.map((w) => w.id)).toEqual(["w"]);
  });
});

describe("useLiftAdjustments", () => {
  it("returns one lift's adjustments newest first, without deleted ones", async () => {
    const adjustment = (id: string, exerciseId: string, at: string, deletedAt: number | null = null) => ({
      id, clientId: id, exerciseId, at: new Date(at), source: "manual" as const,
      set: { t1Weight: 200 }, updatedAt: 1, deletedAt, synced: false,
    });
    await db.liftAdjustments.bulkPut([
      adjustment("a1", "squat", "2026-11-01"),
      adjustment("a2", "squat", "2026-11-05"),
      adjustment("a3", "squat", "2026-11-06", 123),
      adjustment("a4", "bench", "2026-11-07"),
    ]);
    const r = await loaded(() => useLiftAdjustments("squat"));
    expect(r.result.current!.map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});
