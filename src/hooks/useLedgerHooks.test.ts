// The hooks the glass-box screens read: forecasts with their derived status, the
// track record, readiness, decision traces and Today's forecast tiles.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { readLedgerRecords } from "@/lib/data/forecasts";
import { softDelete } from "@/lib/data/logEdits";
import { clearDb, runSession } from "@/lib/data/testUtils";
import { appendSet, finishWorkout, startWorkout } from "@/lib/data/workouts";
import { FORECAST_KIND_IDS, forecastReps, lastT1Sets, sessionForecastId } from "@/lib/forecast";
import { readinessLevelShift } from "@/lib/readiness";
import { getRestSeconds } from "@/lib/restTimes";
import { findStoredDecision, replayTrace } from "@/lib/trace";
import { createSetLog } from "@/lib/workout/logSet";
import {
  useDecisionTrace,
  useForecastSource,
  useNextWorkout,
  useReadinessToday,
  useScoredForecasts,
  useSessionForecasts,
  useStoredDecisions,
  useTodayForecast,
  useTrackRecord,
} from "./index";
import { todayForecastFrom } from "./useTodayForecast";

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
});

afterEach(() => {
  vi.useRealTimers();
});

/** A seeded database with `count` finished sessions, two days apart. The clock is left a day later. */
async function history(count: number): Promise<Date> {
  await initializeDatabase();
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
  const now = new Date(FIRST + (count * 2 - 1) * DAY);
  setNow(now);
  return now;
}

/** Waits until the hook has left `undefined`. */
async function loaded<T>(hook: () => T) {
  const rendered = renderHook(hook);
  await waitFor(() => expect(rendered.result.current).not.toBeUndefined());
  return rendered;
}

describe("on an empty database", () => {
  it("every hook is undefined while loading, then answers without throwing", async () => {
    const hooks = {
      source: renderHook(() => useForecastSource()),
      scored: renderHook(() => useScoredForecasts()),
      session: renderHook(() => useSessionForecasts("no-such-workout")),
      record: renderHook(() => useTrackRecord()),
      readiness: renderHook(() => useReadinessToday()),
      trace: renderHook(() => useDecisionTrace({ exerciseId: "squat", tier: "T1" })),
      stored: renderHook(() => useStoredDecisions("no-such-workout")),
      today: renderHook(() => useTodayForecast()),
    };
    for (const hook of Object.values(hooks)) expect(hook.result.current).toBeUndefined();
    for (const hook of Object.values(hooks)) {
      await waitFor(() => expect(hook.result.current).not.toBeUndefined());
    }

    const source = hooks.source.result.current!;
    expect(source.workouts).toEqual([]);
    expect(source.bestE1RMs).toEqual({});
    expect(source.readinessShift).toBeUndefined();
    expect(Object.keys(source.sdScale!).sort()).toEqual([...FORECAST_KIND_IDS].sort());
    expect(new Set(Object.values(source.sdScale!))).toEqual(new Set([1]));

    expect(hooks.scored.result.current).toEqual([]);
    expect(hooks.session.result.current).toEqual([]);
    expect(hooks.record.result.current!.overall).toMatchObject({ total: 0, resolved: 0 });
    expect(hooks.record.result.current!.overall.ranges.share).toBeNull();
    // Nothing is known that could move the score: no number is made up.
    expect(hooks.readiness.result.current).toBeNull();
    expect(hooks.stored.result.current).toBeNull();
    // No lift states yet, so the first workout's squat has no weight to explain.
    expect(hooks.trace.result.current).toMatchObject({ subject: { kind: "weight" }, result: 0 });
    expect(hooks.today.result.current).toEqual({
      session: { minutes: expect.any(Number), low: expect.any(Number), high: expect.any(Number) },
      newBest: null,
      readiness: null,
    });
  });

  it("the id-less forms answer at once", async () => {
    expect((await loaded(() => useSessionForecasts(null))).result.current).toEqual([]);
    expect((await loaded(() => useStoredDecisions(undefined))).result.current).toBeNull();
  });
});

describe("useSessionForecasts, useScoredForecasts, useTrackRecord and useStoredDecisions", () => {
  it("follow a workout from start to finish to delete, live", async () => {
    const at = await history(4);
    const id = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: [],
    });
    const session = (await db.workouts.get(id))!;

    const forecasts = await loaded(() => useSessionForecasts(id));
    const scored = await loaded(() => useScoredForecasts());
    const record = await loaded(() => useTrackRecord());
    const stored = await loaded(() => useStoredDecisions(id));

    // Open while the workout is in progress.
    expect(forecasts.result.current!.map((item) => item.forecast.id)).toEqual(
      [
        sessionForecastId(id, "amrapReps", "squat", "T1"),
        sessionForecastId(id, "liftPass", "squat", "T1"),
        sessionForecastId(id, "newBest", "squat", "T1"),
        sessionForecastId(id, "sessionLength"),
      ].sort()
    );
    for (const item of forecasts.result.current!) expect(item.status).toEqual({ state: "open" });
    expect(stored.result.current).toEqual(session.decisions);
    expect(findStoredDecision(stored.result.current!, "rest", "squat", "T1")!.result).toBe(
      getRestSeconds("T1", (await readLedgerRecords()).settings.trainingPhase)
    );
    const openBefore = record.result.current!.overall.open;
    expect(openBefore).toBeGreaterThanOrEqual(4);
    const resolvedBefore = record.result.current!.overall.resolved;

    // Log every set as planned and finish.
    const plan = (await runPlan(id, at)).plan;
    expect(plan.length).toBe(3);
    await waitFor(() =>
      expect(forecasts.result.current!.every((item) => item.status.state === "resolved")).toBe(true)
    );
    const reps = forecasts.result.current!.find((item) => item.forecast.kind === "amrapReps")!;
    expect(reps.status).toMatchObject({ state: "resolved", value: 4 });
    await waitFor(() =>
      expect(record.result.current!.overall.resolved).toBe(resolvedBefore + 4)
    );
    expect(record.result.current!.byLift.squat.resolved).toBeGreaterThanOrEqual(3);
    expect(record.result.current!.byKind.sessionLength!.ranges.n).toBeGreaterThan(0);
    expect(scored.result.current!.some((item) => item.forecast.workoutId === id)).toBe(true);
    // The saved traces are the ones shown at the start, whatever happened since.
    expect(stored.result.current).toEqual(session.decisions);

    // Deleted: void, never a miss; and the traces go with the workout.
    await act(async () => {
      await softDelete("workouts", id);
    });
    await waitFor(() =>
      expect(forecasts.result.current!.map((item) => item.status)).toEqual(
        Array(4).fill({ state: "void", reason: "workout-deleted" })
      )
    );
    await waitFor(() => expect(record.result.current!.overall.resolved).toBe(resolvedBefore));
    await waitFor(() => expect(stored.result.current).toBeNull());
  });

  /** Logs the workout's plan (T1 last set one rep over target) and finishes it. */
  async function runPlan(workoutId: string, startedAt: Date) {
    const { nextPlan } = await planOf(workoutId);
    let time = startedAt.getTime();
    let count = 0;
    await act(async () => {
      for (const entry of nextPlan) {
        for (let i = 0; i < entry.targetSets; i += 1) {
          time += MINUTE;
          count += 1;
          setNow(new Date(time));
          const last = i === entry.targetSets - 1 && entry.tier === "T1";
          await appendSet(
            workoutId,
            createSetLog({
              exercise: { ...entry, completedSets: i },
              actualReps: last ? entry.targetReps + 1 : entry.targetReps,
              rpe: null,
              location: "gym",
              autoRegulated: false,
              now: new Date(time),
              id: `${workoutId}:set-${count}`,
              clientId: `${workoutId}:set-${count}`,
            })
          );
        }
      }
      const completedAt = new Date(time + MINUTE);
      setNow(completedAt);
      await finishWorkout(workoutId, {
        completedAt,
        totalDurationSeconds: Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000),
        endedEarly: false,
      });
    });
    return { plan: nextPlan };
  }

  /** The plan of an unfinished workout that is next in the rotation: no warm-ups, no accessories. */
  async function planOf(workoutId: string) {
    const records = await readLedgerRecords();
    const session = records.workouts.find((workout) => workout.id === workoutId)!;
    const next = renderHook(() => useNextWorkout("gym"));
    await waitFor(() => expect(next.result.current).toBeDefined());
    expect(next.result.current!.templateId).toBe(session.templateId);
    const nextPlan = next.result.current!.plan.filter((entry) => !entry.isWarmUp);
    next.unmount();
    return { nextPlan };
  }
});

describe("useReadinessToday", () => {
  it("scores the next workout, takes unsaved answers, and uses a started workout's own", async () => {
    await history(8);

    const plain = await loaded(() => useReadinessToday());
    const score = plain.result.current!;
    expect(score.contributions.map((c) => c.id)).toContain("rest-days");
    expect(score.contributions.some((c) => c.id === "sleep")).toBe(false);
    expect(score.suggestSkippingAccessories).toBe(false);

    // The pre-workout check: answers that are not saved yet.
    const preview = await loaded(() =>
      useReadinessToday({ answers: { sleepHours: "<5", stressLevel: "low" } })
    );
    expect(preview.result.current!.contributions.map((c) => c.id)).toEqual(
      expect.arrayContaining(["sleep", "stress"])
    );
    expect(preview.result.current!.score).toBeLessThan(score.score);
    expect(preview.result.current!.suggestSkippingAccessories).toBe(true);

    // Once the workout has started, its saved answers are today's.
    await act(async () => {
      await startWorkout({
        templateId: "A1",
        location: "gym",
        includeWarmUps: false,
        selectedAccessories: [],
        readiness: { sleepHours: "7+", stressLevel: "good" },
      });
    });
    await waitFor(() =>
      expect(plain.result.current!.contributions.map((c) => c.id)).toEqual(
        expect.arrayContaining(["sleep", "stress"])
      )
    );
    expect(plain.result.current!.suggestSkippingAccessories).toBe(false);
    await waitFor(() => expect(preview.result.current!.suggestSkippingAccessories).toBe(false));
  });
});

describe("useDecisionTrace", () => {
  it("explains the next workout's numbers live, and is null for a lift that is not in it", async () => {
    await history(4);
    const next = await loaded(() => useNextWorkout("gym"));
    expect(next.result.current!.templateId).toBe("A1");
    const squat = next.result.current!.plan.find((e) => e.tier === "T1" && !e.isWarmUp)!;

    const weight = await loaded(() => useDecisionTrace({ exerciseId: "squat", tier: "T1" }));
    expect(weight.result.current).toMatchObject({
      subject: { kind: "weight", exerciseId: "squat", tier: "T1" },
      result: squat.weight,
      unit: "lb",
    });
    expect(replayTrace(weight.result.current!)).toBe(squat.weight);
    expect(weight.result.current!.steps.map((step) => step.id)).toEqual(
      expect.arrayContaining(["last-session", "progression", "readiness"])
    );

    const rest = await loaded(() =>
      useDecisionTrace({ exerciseId: "squat", tier: "T1", kind: "rest" })
    );
    expect(rest.result.current!.result).toBe(
      getRestSeconds("T1", (await readLedgerRecords()).settings.trainingPhase)
    );

    const home = await loaded(() =>
      useDecisionTrace({ exerciseId: "squat", tier: "T1", location: "home" })
    );
    expect(home.result.current!.steps.map((step) => step.id)).toContain("dumbbell");

    // Deadlift is not in A1; squat is not a T3 lift.
    expect(
      (await loaded(() => useDecisionTrace({ exerciseId: "deadlift", tier: "T1" }))).result.current
    ).toBeNull();
    expect(
      (await loaded(() => useDecisionTrace({ exerciseId: "squat", tier: "T3" }))).result.current
    ).toBeNull();
    // The accessory limit is about the session, whatever lift is named.
    const cap = await loaded(() =>
      useDecisionTrace({ exerciseId: "deadlift", tier: "T1", kind: "accessoryCap" })
    );
    expect(cap.result.current).toMatchObject({ subject: { kind: "accessoryCap" }, unit: "count" });
  });
});

describe("useForecastSource", () => {
  it("gives the models what the ledger writer gives them", async () => {
    const now = await history(8);
    const source = (await loaded(() => useForecastSource())).result.current!;
    const readiness = (await loaded(() => useReadinessToday())).result.current!;

    expect(source.now).toEqual(now);
    expect(source.workouts).toHaveLength(8);
    expect(source.workouts.every((workout) => workout.completedAt != null)).toBe(true);
    expect(Object.keys(source.bestE1RMs).sort()).toEqual(["bench", "deadlift", "ohp", "squat"]);
    expect(source.readinessShift).toBeCloseTo(readinessLevelShift(readiness), 12);
    expect(source.settings).toEqual((await readLedgerRecords()).settings);

    // A screen can ask the model about any weight, as the why sheet does.
    const reps = forecastReps({
      history: lastT1Sets(source.workouts, "squat", source.now),
      performedExerciseId: "squat",
      weight: 215,
      targetReps: 3,
      readinessShift: source.readinessShift,
      sdScale: source.sdScale?.amrapReps,
      bestE1RM: source.bestE1RMs.squat,
      now: source.now,
    });
    expect(reps.sampleSize).toBe(2);
    expect(reps.newBest!.chance).toBeGreaterThan(0);
  });
});

describe("useTodayForecast", () => {
  it("shows the session length with its range, the new-best chance and readiness", async () => {
    await history(8);
    const today = (await loaded(() => useTodayForecast("gym"))).result.current!;

    const session = today.session!;
    expect(session.low!).toBeLessThan(session.minutes);
    expect(session.high!).toBeGreaterThan(session.minutes);
    expect(Number.isInteger(session.minutes)).toBe(true);

    const newBest = today.newBest!;
    expect(newBest.probability!).toBeGreaterThan(0);
    expect(newBest.probability!).toBeLessThan(1);
    expect(newBest.repsNeeded).toBeGreaterThanOrEqual(2);
    expect(newBest.estimate).toBeGreaterThan(newBest.best);
    expect(newBest.chance).not.toBe("unknown");
    expect(today.readiness!.contributions.length).toBeGreaterThan(0);
  });

  it("matches what starting the workout stores, when no answers are given", async () => {
    await history(8);
    const records = await readLedgerRecords(new Date());
    const today = todayForecastFrom(records, "gym");

    const id = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: records.settings.showWarmUps,
      selectedAccessories: [],
    });
    const newBest = (await db.forecasts.get(sessionForecastId(id, "newBest", "squat", "T1")))!;
    const length = (await db.forecasts.get(sessionForecastId(id, "sessionLength")))!;
    expect(today.newBest!.probability).toBeCloseTo(newBest.prediction.probability!, 12);
    expect(today.newBest!.repsNeeded).toBe(newBest.inputs.repsNeeded);
    expect(today.newBest!.best).toBe(newBest.event.level);
    expect(today.newBest!.approximate).toBe((newBest.inputs.effortCredit as number) > 0);
    expect(today.session!.minutes).toBe(Math.round(length.prediction.point / 60));
  });

  it("gives no forecast, and says so once, when working it out throws", async () => {
    await history(8);
    const records = await readLedgerRecords(new Date());
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // The records are read as stored, so a damaged row gets as far as the models.
    const damaged = { ...records, workouts: [...records.workouts, null as never] };
    const nothing = { session: null, newBest: null, readiness: null };

    expect(todayForecastFrom(damaged, "gym")).toEqual(nothing);
    expect(todayForecastFrom(damaged, "home")).toEqual(nothing);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/forecast/i), expect.any(Error));
    // Sound records still give a forecast afterwards.
    expect(todayForecastFrom(records, "gym").session).not.toBeNull();
    error.mockRestore();
  });

  it("gives no new-best chance for a home substitute, and follows the location", async () => {
    await history(8);
    const rendered = renderHook(({ location }) => useTodayForecast(location), {
      initialProps: { location: "home" as "home" | "gym" },
    });
    await waitFor(() => expect(rendered.result.current).not.toBeUndefined());
    expect(rendered.result.current!.newBest).toBeNull();
    expect(rendered.result.current!.session).not.toBeNull();
    rendered.rerender({ location: "gym" });
    await waitFor(() => expect(rendered.result.current!.newBest).not.toBeNull());
  });
});
