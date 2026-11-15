// What starting a workout costs over a long history, and where that work is done: the
// decisions and forecasts are built from one read of the records before the write
// transaction opens, and reading the history for them is a bounded number of passes.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const counted = vi.hoisted(() => ({
  e1rmsForWorkout: 0,
  /** Whether a database transaction was open each time the ledger was being built. */
  inTransaction: [] as boolean[],
}));
vi.mock("@/lib/rebuild/e1rm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rebuild/e1rm")>();
  return {
    ...actual,
    e1rmsForWorkout: (...args: Parameters<typeof actual.e1rmsForWorkout>) => {
      counted.e1rmsForWorkout += 1;
      return actual.e1rmsForWorkout(...args);
    },
  };
});
vi.mock("@/lib/trace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trace")>();
  const { default: Dexie } = await import("dexie");
  return {
    ...actual,
    buildSessionDecisions: (...args: Parameters<typeof actual.buildSessionDecisions>) => {
      counted.inTransaction.push(Dexie.currentTransaction != null);
      return actual.buildSessionDecisions(...args);
    },
  };
});
vi.mock("@/lib/forecast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forecast")>();
  const { default: Dexie } = await import("dexie");
  return {
    ...actual,
    makeSessionForecasts: (...args: Parameters<typeof actual.makeSessionForecasts>) => {
      counted.inTransaction.push(Dexie.currentTransaction != null);
      return actual.makeSessionForecasts(...args);
    },
  };
});

import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { longHistory, SETTINGS } from "@/lib/forecast/testHelpers";
import { prescribedFor } from "@/lib/workout/planEdits";
import { makeSession, seedLiftStates } from "@/lib/workout/testFixtures";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import {
  forecastSourceFrom,
  sessionStartLedger,
  type LedgerRecords,
} from "./forecasts";
import { clearDb } from "./testUtils";
import { appendSet, startWorkout } from "./workouts";

const WORKOUTS = 600;

beforeEach(() => {
  counted.e1rmsForWorkout = 0;
  counted.inTransaction = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the start of a workout over a long history", () => {
  const data = longHistory(WORKOUTS);
  const liftStates = seedLiftStates();
  const records: LedgerRecords = {
    readAt: data.now,
    workouts: data.workouts,
    bodyweight: data.bodyweight,
    liftStates,
    liftAdjustments: [],
    forecasts: data.forecasts,
    readinessLogs: [],
    runs: [],
    activities: [],
    painEntries: [],
    settings: SETTINGS,
  };

  it("reads each workout's estimated-max results once for the forecast source", () => {
    const source = forecastSourceFrom(records, data.now);
    // Scoring the 3,600 stored forecasts and finding each lift's best share one pass.
    expect(counted.e1rmsForWorkout).toBeLessThanOrEqual(WORKOUTS);
    expect(Object.keys(source.bestE1RMs).sort()).toEqual(["bench", "deadlift", "ohp", "squat"]);
    expect(Object.keys(source.sdScale!)).toHaveLength(6);
    expect(source.workouts).toHaveLength(WORKOUTS);
  });

  it("builds the whole ledger in a few passes over the history", () => {
    const session = makeSession({
      id: "today",
      templateId: "A1",
      startedAt: data.now,
      prescribed: prescribedFor(WORKOUT_TEMPLATES.A1, liftStates),
    });
    const ledger = sessionStartLedger(records, session);
    expect(ledger.decisions!.length).toBeGreaterThan(0);
    // The squat's best in this history is out of reach at today's weight, so there is
    // no new-best row; the other three are made.
    expect(ledger.forecasts.map((row) => row.kind).sort()).toEqual([
      "amrapReps",
      "liftPass",
      "sessionLength",
    ]);
    // One pass for scoring and the bests, one for the rebuild behind the traces. It
    // was one pass for every closed estimated-max forecast: 360,000 here.
    expect(counted.e1rmsForWorkout).toBeLessThanOrEqual(3 * WORKOUTS);
  });
});

describe("startWorkout", () => {
  beforeEach(async () => {
    await clearDb();
    await initializeDatabase();
  });

  it("builds the decisions and the forecasts before the write transaction opens", async () => {
    const id = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: [],
    });
    // Both were built, and no transaction was open while either was.
    expect(counted.inTransaction).toEqual([false, false]);

    // They are still made from the data as it stood before the workout, saved with
    // it, and in the ledger before any set can be logged.
    const session = (await db.workouts.get(id))!;
    expect(session.decisions!.length).toBeGreaterThan(0);
    expect(session.sets).toEqual([]);
    const rows = await db.forecasts.where("workoutId").equals(id).toArray();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.madeAt).toEqual(session.startedAt);
    expect(session.prescribed).toEqual(
      prescribedFor(WORKOUT_TEMPLATES.A1, await db.liftStates.toArray())
    );
    await expect(appendSet("no-such-workout", {} as never)).rejects.toThrow();
  });
});
