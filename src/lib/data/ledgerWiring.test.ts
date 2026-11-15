// The glass-box ledger through the data layer (G3, G5, G10): what is written when a
// workout starts and finishes, when a weigh-in is logged and when the phase changes,
// and how a stored forecast's status follows the log without the row ever changing.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Switches that make the explain functions or the forecast models throw, to show that
// a bug in either never stops a workout from starting.
const broken = vi.hoisted(() => ({ traces: false, models: false }));
vi.mock("@/lib/trace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trace")>();
  return {
    ...actual,
    buildSessionDecisions: (...args: Parameters<typeof actual.buildSessionDecisions>) => {
      if (broken.traces) throw new Error("trace bug");
      return actual.buildSessionDecisions(...args);
    },
  };
});
vi.mock("@/lib/forecast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forecast")>();
  return {
    ...actual,
    makeSessionForecasts: (...args: Parameters<typeof actual.makeSessionForecasts>) => {
      if (broken.models) throw new Error("model bug");
      return actual.makeSessionForecasts(...args);
    },
  };
});

import { planForSession } from "@/components/ActiveWorkout/activeWorkoutLogic";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { isRuleId } from "@/lib/evidence";
import {
  BODYWEIGHT_MODEL,
  BODYWEIGHT_SUBJECT,
  horizonSlot,
  scoreForecasts,
  sessionForecastId,
} from "@/lib/forecast";
import { getRestSeconds } from "@/lib/restTimes";
import { findStoredDecision, replayTrace } from "@/lib/trace";
import { substituteModification } from "@/lib/workout/buildPlan";
import { createSetLog } from "@/lib/workout/logSet";
import type { WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { Forecast, ForecastStatus, Tier, WorkoutSession } from "@/types";
import { listCoachEvents } from "./coachEvents";
import { readSettings } from "./derived";
import { writeSessionForecasts } from "./forecasts";
import { commitLogChange, softDelete } from "./logEdits";
import { logBodyweight, phaseChangeEvent, updateSettings } from "./records";
import { clearDb, makeSet, makeWorkout, runSession } from "./testUtils";
import {
  appendSet,
  discardWorkout,
  finishWorkout,
  startWorkout,
  type StartWorkoutInput,
} from "./workouts";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const FIRST = new Date("2026-03-02T09:00:00Z").getTime();
const ROTATION = ["A1", "B1", "A2", "B2"];
const setNow = (date: Date) => {
  vi.setSystemTime(date);
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
  await clearDb();
  await initializeDatabase();
});

afterEach(() => {
  broken.traces = false;
  broken.models = false;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A session forecast row for a workout, as a caller other than `startWorkout` might hold one. */
const rowFor = (workoutId: string): Forecast => {
  const id = sessionForecastId(workoutId, "sessionLength");
  return {
    id,
    clientId: id,
    slot: id,
    kind: "sessionLength",
    workoutId,
    madeAt: new Date(FIRST),
    dueAt: new Date(FIRST + 60 * MINUTE),
    event: { type: "durationSeconds" },
    prediction: { point: 3000, low: 2500, high: 3500, unit: "s" },
    basis: "prior",
    inputs: {},
    modelVersion: "test",
    synced: false,
  };
};

/** Finished sessions in rotation, two days apart, each T1 last set two reps over target. */
async function history(count: number): Promise<Date> {
  for (let i = 0; i < count; i += 1) {
    await runSession(
      {
        templateId: ROTATION[i % ROTATION.length],
        startedAt: new Date(FIRST + i * 2 * DAY),
        lastReps: { T1: 5 },
      },
      setNow
    );
  }
  return new Date(FIRST + count * 2 * DAY);
}

async function start(
  at: Date,
  input: Partial<StartWorkoutInput> = {}
): Promise<{ id: string; session: WorkoutSession; plan: WorkoutPlan }> {
  setNow(at);
  const id = await startWorkout({
    templateId: "A1",
    location: "gym",
    includeWarmUps: false,
    selectedAccessories: [],
    ...input,
  });
  const session = (await db.workouts.get(id))!;
  const plan = planForSession({
    session,
    template: WORKOUT_TEMPLATES[session.templateId],
    liftStates: await db.liftStates.toArray(),
    equipment: (await readSettings()).equipment,
  });
  return { id, session, plan };
}

/** Logs every set of the plan a minute apart and returns the time of the last one. */
async function logSets(
  session: WorkoutSession,
  plan: WorkoutPlan,
  options: { lastReps?: Partial<Record<Tier, number>>; weight?: Partial<Record<Tier, number>> } = {}
): Promise<Date> {
  let time = new Date(session.startedAt).getTime();
  let count = 0;
  for (const entry of plan) {
    for (let i = 0; i < entry.targetSets; i += 1) {
      time += MINUTE;
      count += 1;
      setNow(new Date(time));
      const isLast = i === entry.targetSets - 1;
      await appendSet(
        session.id,
        createSetLog({
          exercise: {
            ...entry,
            weight: options.weight?.[entry.tier] ?? entry.weight,
            completedSets: i,
          },
          actualReps: (isLast ? options.lastReps?.[entry.tier] : undefined) ?? entry.targetReps,
          rpe: null,
          location: session.location,
          autoRegulated: false,
          now: new Date(time),
          id: `${session.id}:set-${count}`,
          clientId: `${session.id}:set-${count}`,
        })
      );
    }
  }
  return new Date(time);
}

async function finish(session: WorkoutSession, lastSetAt: Date): Promise<Date> {
  const completedAt = new Date(lastSetAt.getTime() + MINUTE);
  setNow(completedAt);
  await finishWorkout(session.id, {
    completedAt,
    totalDurationSeconds: Math.floor(
      (completedAt.getTime() - new Date(session.startedAt).getTime()) / 1000
    ),
    endedEarly: false,
  });
  return completedAt;
}

const byId = (rows: Forecast[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

async function sessionRows(workoutId: string): Promise<Forecast[]> {
  return byId(await db.forecasts.where("workoutId").equals(workoutId).toArray());
}

/** The derived status of every stored forecast, by id, as things stand now. */
async function statuses(): Promise<Map<string, ForecastStatus>> {
  const scored = scoreForecasts(
    await db.forecasts.toArray(),
    { workouts: await db.workouts.toArray(), bodyweight: await db.bodyweight.toArray() },
    new Date()
  );
  return new Map(scored.map((item) => [item.forecast.id, item.status]));
}

describe("startWorkout", () => {
  it("saves the decisions on the workout and the session's forecasts, once", async () => {
    const at = await history(4);
    const { id, session, plan } = await start(at);

    // Weight and rest for each planned lift, ending at the numbers the session runs.
    expect(session.decisions).toHaveLength(plan.length * 2);
    for (const entry of plan) {
      const weight = findStoredDecision(session.decisions, "weight", entry.exerciseId, entry.tier)!;
      const rest = findStoredDecision(session.decisions, "rest", entry.exerciseId, entry.tier)!;
      expect(weight.result).toBe(entry.weight);
      expect(replayTrace(weight)).toBe(entry.weight);
      expect(rest.result).toBe(getRestSeconds(entry.tier, (await readSettings()).trainingPhase));
    }

    const rows = await sessionRows(id);
    expect(rows.map((row) => row.id)).toEqual(
      [
        sessionForecastId(id, "amrapReps", "squat", "T1"),
        sessionForecastId(id, "liftPass", "squat", "T1"),
        sessionForecastId(id, "newBest", "squat", "T1"),
        sessionForecastId(id, "sessionLength"),
      ].sort()
    );
    const t1 = plan.find((entry) => entry.tier === "T1")!;
    for (const row of rows) {
      expect(row.workoutId).toBe(id);
      expect(row.madeAt).toEqual(session.startedAt);
      expect(row).toMatchObject({ synced: false, deletedAt: null });
      if (row.exerciseId) expect(row.event.weight).toBe(t1.weight);
    }
    expect((await statuses()).get(sessionForecastId(id, "sessionLength"))).toEqual({
      state: "open",
    });

    // The row was written once, with its decisions in it.
    expect(session.updatedAt).toBe(at.getTime());

    // Writing the same forecasts again, even with other numbers, adds and changes nothing.
    const again = rows.map((row) => ({ ...row, prediction: { ...row.prediction, point: -1 } }));
    expect(await writeSessionForecasts(id, again)).toBe(0);
    expect(await sessionRows(id)).toEqual(rows);
    expect(await db.workouts.get(id)).toEqual(session);
  });

  it("forecasts from the data as it stood before the workout", async () => {
    const at = await history(4);
    const { id } = await start(at);
    const rows = await sessionRows(id);
    const reps = rows.find((row) => row.kind === "amrapReps")!;
    // One earlier squat session, so the model stood on one result.
    expect(reps.basis).toBe("persistence");
    expect(reps.inputs.sampleSize).toBe(1);
    expect(reps.prediction.pmf!.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 9);
    const newBest = rows.find((row) => row.kind === "newBest")!;
    expect(newBest.prediction.probability).toBeGreaterThan(0);
    expect(newBest.prediction.probability).toBeLessThan(1);
    // The event is the best estimated max that stood before the workout.
    const best = Math.max(
      ...(await db.estimated1RMs.where("exerciseId").equals("squat").toArray()).map(
        (row) => row.estimated1RM
      )
    );
    expect(newBest.event).toEqual({ type: "e1rmAbove", weight: newBest.event.weight, level: best });
    expect(newBest.inputs.repsNeeded).toBeGreaterThan(1);
  });

  it("explains and forecasts the plan the session runs: a home substitute and a weight edit", async () => {
    const at = await history(4);
    const settings = await readSettings();
    const squat = (await db.liftStates.get("squat"))!;
    const { id, session, plan } = await start(at, {
      location: "home",
      modifications: [substituteModification("squat", "goblet_squat", squat.t1Weight, 50)],
      planEdits: [{ kind: "weight", exerciseId: "bench", tier: "T2", weight: 45 }],
    });
    expect(settings.equipment.maxDumbbellWeight).toBeGreaterThan(0);

    const t1 = plan.find((entry) => entry.tier === "T1")!;
    expect(t1.substituteExerciseId).toBe("goblet_squat");
    const reps = (await sessionRows(id)).find((row) => row.kind === "amrapReps")!;
    expect(reps.event.weight).toBe(t1.weight);
    expect(reps.inputs.performedExerciseId).toBe("goblet_squat");
    // A substitute's sets never count toward the lift's best, so there is no new-best row.
    expect((await sessionRows(id)).some((row) => row.kind === "newBest")).toBe(false);

    const weight = findStoredDecision(session.decisions, "weight", "squat", "T1")!;
    expect(weight.result).toBe(t1.weight);
    const edited = findStoredDecision(session.decisions, "weight", "bench", "T2")!;
    expect(edited.result).toBe(45);
    expect(replayTrace(edited)).toBe(45);
  });

  it("keeps the saved decisions small: the workout row is re-sent on every set", async () => {
    const at = await history(8);
    const { session } = await start(at, {
      includeWarmUps: true,
      selectedAccessories: ["face_pulls", "lateral_raises"],
    });
    // Five lifts (three program lifts, two accessories), weight and rest for each;
    // warm-up entries are not saved. About 8 kB today: fail before it doubles.
    expect(session.decisions).toHaveLength(10);
    expect(JSON.stringify(session.decisions).length).toBeLessThan(12_000);
  });

  it("writes no session forecast for a workout that has a set, is finished, deleted or missing", async () => {
    await db.workouts.bulkPut([
      makeWorkout({ id: "resumed", sets: [makeSet({ id: "s1" })] }),
      makeWorkout({ id: "done", completedAt: new Date("2026-11-10T10:00:00Z") }),
      makeWorkout({ id: "gone", deletedAt: 5 }),
      makeWorkout({ id: "fresh" }),
    ]);
    for (const id of ["resumed", "done", "gone", "no-such-workout"]) {
      expect(await writeSessionForecasts(id, [rowFor(id)]), id).toBe(0);
    }
    expect(await db.forecasts.count()).toBe(0);

    // An untouched workout gets its own rows, and only its own.
    expect(await writeSessionForecasts("fresh", [rowFor("fresh"), rowFor("resumed")])).toBe(1);
    expect((await db.forecasts.toArray()).map((row) => row.workoutId)).toEqual(["fresh"]);
  });

  it("starts the workout all the same when the forecasts cannot be written, and never makes them later", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const bulkAdd = vi.spyOn(db.forecasts, "bulkAdd").mockRejectedValue(new Error("disk full"));
    const { id, session, plan } = await start(new Date(FIRST));
    expect(session.completedAt).toBeNull();
    expect(await db.forecasts.count()).toBe(0);
    // The decisions are on the workout row, so they are saved all the same.
    expect(session.decisions!.length).toBeGreaterThan(0);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/forecasts/), expect.any(Error));

    // The disk recovers and a set is logged: it is too late for a forecast now.
    bulkAdd.mockRestore();
    await logSets(session, plan.slice(0, 1));
    expect(await writeSessionForecasts(id, [rowFor(id)])).toBe(0);
    expect(await db.forecasts.count()).toBe(0);
  });

  it("starts the workout all the same when the plan cannot be explained", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    broken.traces = true;
    const { id, session } = await start(new Date(FIRST));
    expect(session).toMatchObject({ id, completedAt: null, sets: [] });
    expect(session.decisions).toBeUndefined();
    // The forecasts do not depend on the traces.
    expect((await sessionRows(id)).length).toBeGreaterThan(0);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Explaining/), expect.any(Error));
  });

  it("starts the workout all the same when the forecasts cannot be made", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    broken.models = true;
    const { id, session } = await start(new Date(FIRST));
    expect(session).toMatchObject({ id, completedAt: null, sets: [] });
    expect(session.decisions!.length).toBeGreaterThan(0);
    expect(await sessionRows(id)).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Forecasting/), expect.any(Error));
  });

  it("starts the workout all the same when the records cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.forecasts, "toArray").mockRejectedValue(new Error("blocked"));
    const { id, session } = await start(new Date(FIRST), {
      readiness: { sleepHours: "7+", stressLevel: "good" },
    });
    expect(session).toMatchObject({ id, completedAt: null, sets: [] });
    expect(session.prescribed!.length).toBe(3);
    expect(session.decisions).toBeUndefined();
    expect(await db.readinessLogs.where("sessionId").equals(id).count()).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Reading/), expect.any(Error));
  });

  it("stores nothing in the ledger for an unknown template", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await startWorkout({
      templateId: "nope",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: [],
    });
    expect((await db.workouts.get(id))!.decisions).toBeUndefined();
    expect(await sessionRows(id)).toEqual([]);
    // Nothing to explain or forecast is not a failure.
    expect(error).not.toHaveBeenCalled();
  });
});

describe("a stored forecast follows the log and never changes", () => {
  it("finish resolves it, an edit moves the outcome, a delete voids it: the rows stay byte-identical", async () => {
    const at = await history(4);
    const { id, session, plan } = await start(at);
    const rows = await sessionRows(id);
    const bytes = JSON.stringify(rows);
    const repsId = sessionForecastId(id, "amrapReps", "squat", "T1");
    const passId = sessionForecastId(id, "liftPass", "squat", "T1");
    const lengthId = sessionForecastId(id, "sessionLength");
    const unchanged = async () => {
      const now = await sessionRows(id);
      expect(now).toEqual(rows);
      expect(JSON.stringify(now)).toBe(bytes);
    };

    const lastSetAt = await logSets(session, plan, { lastReps: { T1: 6 } });
    let now = await statuses();
    for (const row of rows) expect(now.get(row.id)).toEqual({ state: "open" });
    await unchanged();

    await finish(session, lastSetAt);
    now = await statuses();
    expect(now.get(repsId)).toMatchObject({ state: "resolved", value: 6 });
    expect(now.get(passId)).toMatchObject({ state: "resolved", hit: true });
    expect(now.get(lengthId)).toMatchObject({
      state: "resolved",
      value: (await db.workouts.get(id))!.totalDurationSeconds,
    });
    await unchanged();

    // Editing the last set changes the outcome on the next read, not the row.
    const lastSet = (await db.workouts.get(id))!.sets.find(
      (set) => set.exerciseId === "squat" && set.isAMRAP
    )!;
    await commitLogChange({
      kind: "editSet",
      workoutId: id,
      setId: lastSet.id,
      patch: { actualReps: 2 },
    });
    now = await statuses();
    expect(now.get(repsId)).toMatchObject({ state: "resolved", value: 2 });
    expect(now.get(passId)).toMatchObject({ state: "resolved", hit: false });
    await unchanged();

    // Deleting the workout voids every forecast made for it.
    await softDelete("workouts", id);
    now = await statuses();
    for (const row of rows) {
      expect(now.get(row.id)).toEqual({ state: "void", reason: "workout-deleted" });
    }
    await unchanged();
  });

  it("discarding an unfinished workout voids its forecasts", async () => {
    const { id } = await start(new Date(FIRST));
    const rows = await sessionRows(id);
    expect(rows.length).toBeGreaterThan(0);
    await discardWorkout(id);
    const now = await statuses();
    for (const row of rows) {
      expect(now.get(row.id)).toEqual({ state: "void", reason: "workout-deleted" });
    }
    expect(await sessionRows(id)).toEqual(rows);
  });

  it("lifting a different weight from the forecast's voids it instead of scoring a miss", async () => {
    const at = await history(4);
    const { id, session, plan } = await start(at);
    const rows = await sessionRows(id);
    const t1 = plan.find((entry) => entry.tier === "T1")!;

    const lastSetAt = await logSets(session, plan, { weight: { T1: t1.weight + 10 } });
    await finish(session, lastSetAt);

    const now = await statuses();
    for (const kind of ["amrapReps", "liftPass", "newBest"] as const) {
      expect(now.get(sessionForecastId(id, kind, "squat", "T1"))).toEqual({
        state: "void",
        reason: "weight-changed",
      });
    }
    // The session's length is still scored: the override was about the weight.
    expect(now.get(sessionForecastId(id, "sessionLength"))).toMatchObject({ state: "resolved" });
    expect(await sessionRows(id)).toEqual(rows);
  });
});

describe("finishWorkout", () => {
  /**
   * Sixteen sessions (four T1 days for every lift, enough to project), the last on
   * Wednesday 1 April 2026. Returns the Monday after: the first session of a new week.
   */
  async function newWeek(): Promise<Date> {
    await history(16);
    return new Date(FIRST + 35 * DAY);
  }
  const e1rmRows = () => db.forecasts.where("kind").equals("e1rm4w").toArray();

  it("writes the estimated-max forecast for the lifts just trained, one per lift per week", async () => {
    const at = await newWeek();
    const before = await e1rmRows();
    expect(before.length).toBeGreaterThan(0);

    const { session, plan } = await start(at);
    const completedAt = await finish(session, await logSets(session, plan, { lastReps: { T1: 5 } }));

    // A1 trains squat, bench and a T3 lift; the T3 lift has no estimated max to project.
    const after = await e1rmRows();
    const added = after.filter((row) => !before.some((old) => old.id === row.id));
    expect(added.map((row) => row.exerciseId).sort()).toEqual(["bench", "squat"]);
    for (const row of added) {
      expect(row).toMatchObject({
        slot: horizonSlot("e1rm4w", row.exerciseId!, completedAt),
        synced: false,
        deletedAt: null,
      });
      expect(row.workoutId).toBeUndefined();
      expect(row.madeAt).toEqual(completedAt);
      expect(row.dueAt.getTime()).toBeGreaterThan(completedAt.getTime());
      expect(row.id).not.toBe(row.slot);
    }

    // One row per slot: every lift, every week, at most once.
    const slots = after.map((row) => row.slot);
    expect(new Set(slots).size).toBe(slots.length);
    // Finishing a workout says nothing new about bodyweight.
    expect(await db.forecasts.where("kind").equals("bodyweight4w").count()).toBe(0);
  });

  it("adds no second row when the same lift is trained again in the same week", async () => {
    const first = await start(await newWeek());
    const done = await finish(first.session, await logSets(first.session, first.plan));
    const rows = await e1rmRows();

    // A second squat day an hour later, in the same ISO week.
    const again = await start(new Date(done.getTime() + 60 * MINUTE));
    const doneAgain = await finish(again.session, await logSets(again.session, again.plan));
    expect(horizonSlot("e1rm4w", "squat", doneAgain)).toBe(horizonSlot("e1rm4w", "squat", done));
    expect(await e1rmRows()).toEqual(rows);
  });

  it("finishes the workout all the same when the forecasts cannot be written", async () => {
    const at = await newWeek();
    const { id, session, plan } = await start(at);
    const lastSetAt = await logSets(session, plan);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.forecasts, "bulkAdd").mockRejectedValue(new Error("disk full"));

    const completedAt = new Date(lastSetAt.getTime() + MINUTE);
    const liftStates = await finishWorkout(id, {
      completedAt,
      totalDurationSeconds: 1800,
      endedEarly: false,
    });
    expect(liftStates.length).toBeGreaterThan(0);
    expect((await db.workouts.get(id))!.completedAt).toEqual(completedAt);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/finished workout/), expect.any(Error));
  });
});

describe("logBodyweight", () => {
  const weighIn = (at: Date, weight: number) =>
    logBodyweight({ date: at, weight, timeOfDay: "morning" }, at);

  it("writes the bodyweight forecast once there are enough weigh-ins, at most one a week", async () => {
    // Every third day from Monday 2 March 2026: the sixth is Tuesday 17 March, then
    // the Wednesday of that week and the Monday of the next.
    const days = [0, 3, 6, 9, 12, 15, 16, 21];
    const dates = days.map((day) => new Date(FIRST + day * DAY));
    for (const [i, at] of dates.slice(0, BODYWEIGHT_MODEL.minEntries - 1).entries()) {
      await weighIn(at, 200 - i * 0.4);
    }
    expect(await db.forecasts.count()).toBe(0);

    const sixth = dates[BODYWEIGHT_MODEL.minEntries - 1];
    await weighIn(sixth, 198);
    const rows = await db.forecasts.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "bodyweight4w",
      slot: horizonSlot("bodyweight4w", BODYWEIGHT_SUBJECT, sixth),
      event: { type: "bodyweightMean", windowDays: BODYWEIGHT_MODEL.outcomeWindowDays },
    });
    expect(rows[0].madeAt).toEqual(sixth);
    expect(rows[0].dueAt.getTime()).toBe(sixth.getTime() + BODYWEIGHT_MODEL.horizonDays * DAY);

    // A second weigh-in in the same week adds no row and leaves the first as it was.
    await weighIn(dates[6], 197.8);
    expect(await db.forecasts.toArray()).toEqual(rows);

    // The next week gets its own.
    await weighIn(dates[7], 197.5);
    expect((await db.forecasts.toArray()).map((row) => row.slot).sort()).toEqual(
      [rows[0].slot, horizonSlot("bodyweight4w", BODYWEIGHT_SUBJECT, dates[7])].sort()
    );
  });

  it("saves the weigh-in all the same when the forecast cannot be written", async () => {
    for (let i = 0; i < BODYWEIGHT_MODEL.minEntries; i += 1) {
      await db.bodyweight.add({
        id: `bw-${i}`,
        clientId: `bw-${i}`,
        date: new Date(FIRST + i * 3 * DAY),
        weight: 200 - i * 0.3,
        timeOfDay: "morning",
        synced: false,
      });
    }
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.forecasts, "bulkAdd").mockRejectedValue(new Error("disk full"));
    const at = new Date(FIRST + BODYWEIGHT_MODEL.minEntries * 3 * DAY);
    const id = await logBodyweight({ date: at, weight: 198, timeOfDay: "morning" }, at);
    expect(await db.bodyweight.get(id)).toMatchObject({ weight: 198 });
    expect(await db.forecasts.count()).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/bodyweight/), expect.any(Error));
  });
});

describe("updateSettings", () => {
  it("records one coach event when the training phase changes, saying what changes", async () => {
    // A new profile starts out cutting.
    const before = (await readSettings()).trainingPhase;
    expect(before.mode).toBe("cutting");
    const maintaining = { mode: "maintaining" as const };

    await updateSettings({ trainingPhase: maintaining }, 5000);

    const events = await listCoachEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({
      kind: "settingsChange",
      ruleId: "rest-cut-bonus",
      at: new Date(5000),
      synced: false,
      data: {
        setting: "trainingPhase",
        from: "cutting",
        to: "maintaining",
        restT1From: getRestSeconds("T1", before),
        restT1To: getRestSeconds("T1", maintaining),
        restT2From: getRestSeconds("T2", before),
        restT2To: getRestSeconds("T2", maintaining),
        accessoryCapFrom: 3,
        accessoryCapTo: 3,
      },
    });
    expect(isRuleId(event.ruleId!)).toBe(true);
    expect(event.title).toBe("Training phase set to maintaining");
    expect(event.detail).toMatch(
      /Rest after T1 sets goes from 3:30 to 3:00 and after T2 sets goes from 2:30 to 2:00\./
    );
    expect(event.detail).toMatch(/accessory limit stays at 3/);
    expect(event.detail).toMatch(/Forecasts of your last-set reps no longer allow for a cut/);
    expect((await readSettings()).trainingPhase).toEqual(maintaining);

    // Back to cutting is a second change, with its own entry.
    await updateSettings({ trainingPhase: before }, 6000);
    const [latest, ...earlier] = await listCoachEvents();
    expect(earlier).toHaveLength(1);
    expect(latest.title).toBe("Training phase set to cutting");
    expect(latest.detail).toMatch(/Rest after T1 sets goes from 3:00 to 3:30/);
    expect(latest.detail).toMatch(/assume 1% less strength/);
  });

  it("records nothing when the phase stays the same or another setting changes", async () => {
    const phase = (await readSettings()).trainingPhase;
    await updateSettings({ showWarmUps: false });
    await updateSettings({ trainingPhase: { ...phase, proteinGramsPerDay: 170 } });
    expect(await listCoachEvents()).toEqual([]);
  });

  it("names the accessory limit's rule when the rest times do not change", () => {
    const event = phaseChangeEvent({ mode: "maintaining" }, { mode: "bulking" })!;
    expect(event.ruleId).toBe("accessories-in-cut");
    expect(isRuleId(event.ruleId!)).toBe(true);
    expect(event.detail).toMatch(/Rest times stay as they are/);
    expect(event.detail).toMatch(/accessory limit goes from 3 to 4/);
    expect(phaseChangeEvent({ mode: "bulking" }, { mode: "bulking", dailyDeficit: 1 })).toBeNull();
  });

  it("changes nothing when the event cannot be recorded", async () => {
    const before = await readSettings();
    vi.spyOn(db.coachEvents, "add").mockRejectedValue(new Error("disk full"));
    await expect(updateSettings({ trainingPhase: { mode: "bulking" } })).rejects.toThrow();
    expect(await readSettings()).toEqual(before);
  });
});
