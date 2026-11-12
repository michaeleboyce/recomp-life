import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import {
  useBodyweightLog,
  useCompletedWorkouts,
  useE1RMs,
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
import type { PainSorenessEntry, RunLog } from "@/types";

const HOUR = 60 * 60 * 1000;

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
});
