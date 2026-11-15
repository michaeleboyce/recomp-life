// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calculateE1RM, isE1RMEligibleSet, isNewPR } from "@/lib/e1rm";
import { applyChange, e1rmsForWorkout, type LogState } from "@/lib/rebuild";
import type { Forecast, SetStatus, WorkoutSession } from "@/types";
import { BODYWEIGHT_MODEL, E1RM_HORIZON_MODEL } from "./coefficients";
import { earliestPerSlot, resolveForecast, VOID_REASONS } from "./resolve";
import { DAY, forecastRow, t1Session, weighIn } from "./testHelpers";
import type { ForecastLog } from "./types";

const START = new Date("2026-11-02T17:00:00Z");
const NOW = new Date("2026-11-03T09:00:00Z");

/** The workout the default forecast row is about: squat 5x3 at 200, 5 reps on the last set. */
const workout = (overrides: Partial<Parameters<typeof t1Session>[0]> = {}) =>
  t1Session({ id: "w1", at: START, weight: 200, lastReps: 5, ...overrides });

const logOf = (...workouts: WorkoutSession[]): ForecastLog => ({ workouts, bodyweight: [] });
const resolve = (forecast: Forecast, log: ForecastLog, now: Date = NOW) =>
  resolveForecast(forecast, log, now);

const reps = forecastRow();
const pass = forecastRow({
  id: "fc:w1:liftPass:squat:T1",
  kind: "liftPass",
  event: { type: "repsAtLeast", weight: 200, reps: 3 },
  prediction: { point: 0.8, probability: 0.8, unit: "chance" },
});
/** The best estimated max that stood when the forecast was made: six all-out reps at 200 beat it. */
const BEST_LEVEL = 236;
const best = forecastRow({
  id: "fc:w1:newBest:squat:T1",
  kind: "newBest",
  event: { type: "e1rmAbove", weight: 200, level: BEST_LEVEL },
  prediction: { point: 0.3, probability: 0.3, unit: "chance" },
});
const length = forecastRow({
  id: "fc:w1:sessionLength",
  kind: "sessionLength",
  exerciseId: undefined,
  tier: undefined,
  event: { type: "durationSeconds" },
  prediction: { point: 2400, low: 2200, high: 2600, unit: "s" },
});

describe("reps on the last set", () => {
  it("is open until the workout is finished", () => {
    const unfinished = { ...workout(), completedAt: null };
    expect(resolve(reps, logOf(unfinished))).toEqual({ state: "open" });
  });

  it("resolves to the reps logged, inside or outside the range", () => {
    expect(resolve(reps, logOf(workout()))).toEqual({ state: "resolved", value: 5, inside: true });
    expect(resolve(reps, logOf(workout({ lastReps: 3 })))).toMatchObject({ value: 3, inside: true });
    expect(resolve(reps, logOf(workout({ lastReps: 6 })))).toMatchObject({ value: 6, inside: true });
    expect(resolve(reps, logOf(workout({ lastReps: 2 })))).toMatchObject({ value: 2, inside: false });
    expect(resolve(reps, logOf(workout({ lastReps: 7 })))).toMatchObject({ value: 7, inside: false });
  });

  it("treats a range that ends at the last bucket as having no upper end", () => {
    const pmf = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.3, 0.5];
    const open = forecastRow({ prediction: { point: 12, low: 10, high: 12, pmf, unit: "reps" } });
    expect(resolve(open, logOf(workout({ lastReps: 17 })))).toMatchObject({ value: 17, inside: true });
    expect(resolve(open, logOf(workout({ lastReps: 9 })))).toMatchObject({ value: 9, inside: false });
    const closed = forecastRow({ prediction: { point: 5, low: 3, high: 6, pmf, unit: "reps" } });
    expect(resolve(closed, logOf(workout({ lastReps: 17 })))).toMatchObject({ inside: false });
  });

  it("is void when the workout is missing, deleted or discarded", () => {
    expect(resolve(reps, logOf())).toEqual({ state: "void", reason: "workout-missing" });
    expect(resolve(reps, logOf({ ...workout(), deletedAt: 5 }))).toEqual({
      state: "void",
      reason: "workout-deleted",
    });
    // Discarding an unfinished workout soft-deletes it.
    expect(resolve(reps, logOf({ ...workout(), completedAt: null, deletedAt: 5 }))).toEqual({
      state: "void",
      reason: "workout-deleted",
    });
  });

  it("is void when the last set of the lift was not reached", () => {
    const none = { ...workout(), sets: [] };
    expect(resolve(reps, logOf(none))).toEqual({ state: "void", reason: "not-reached" });
    const partial = workout();
    partial.sets = partial.sets.slice(0, 3);
    expect(resolve(reps, logOf(partial))).toEqual({ state: "void", reason: "not-reached" });
    const otherLift = workout({ exerciseId: "bench" });
    expect(resolve(reps, logOf(otherLift))).toEqual({ state: "void", reason: "not-reached" });
  });

  it("is void when a set of the lift carries a freeze status or a load drop", () => {
    const statuses: Array<[SetStatus, string]> = [
      ["skipped_pain", "freeze"],
      ["reduced_run_fatigue", "freeze"],
      ["reduced_equipment", "freeze"],
      ["autoregulated_load_drop", "load-drop"],
    ];
    for (const [status, reason] of statuses) {
      const session = workout();
      session.sets[1] = { ...session.sets[1], status };
      expect(resolve(reps, logOf(session)), status).toEqual({ state: "void", reason });
      expect(resolve(pass, logOf(session)), status).toEqual({ state: "void", reason });
      expect(resolve(best, logOf(session)), status).toEqual({ state: "void", reason });
    }
  });

  it("is void, not a miss, when the weight lifted is not the forecast's", () => {
    const heavier = workout({ weight: 210, lastReps: 1 });
    for (const forecast of [reps, pass, best]) {
      expect(resolve(forecast, logOf(heavier))).toEqual({ state: "void", reason: "weight-changed" });
    }
    const oneSetLighter = workout();
    oneSetLighter.sets[2] = { ...oneSetLighter.sets[2], weight: 190 };
    expect(resolve(reps, logOf(oneSetLighter))).toMatchObject({ reason: "weight-changed" });
    // Stored numbers that differ by rounding noise are the same weight.
    expect(resolve(reps, logOf(workout({ weight: 200.0000001 })))).toMatchObject({
      state: "resolved",
    });
  });

  it("has a plain sentence for every void reason it gives", () => {
    for (const text of Object.values(VOID_REASONS)) {
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/AMRAP|e1RM|RPE/);
    }
    expect(Object.keys(VOID_REASONS)).toEqual(
      expect.arrayContaining(["workout-missing", "workout-deleted", "not-reached", "freeze", "load-drop", "weight-changed", "ended-early", "too-few-measurements"])
    );
  });
});

describe("chance of a new best and of a pass", () => {
  it("scores a new best as the app shows one: the workout's estimated max against the level", () => {
    expect(resolve(best, logOf(workout({ lastReps: 6 })))).toEqual({
      state: "resolved",
      value: calculateE1RM(200, 6)!,
      hit: true,
    });
    expect(resolve(best, logOf(workout({ lastReps: 5 })))).toEqual({
      state: "resolved",
      value: calculateE1RM(200, 5)!,
      hit: false,
    });
    // The estimate credits a logged effort, so five reps with two left is a new best,
    // exactly as the workout screen flashes it.
    expect(calculateE1RM(200, 5, 8)!).toBeGreaterThan(BEST_LEVEL);
    expect(resolve(best, logOf(workout({ lastReps: 5, setOverrides: { rpe: 8 } })))).toEqual({
      state: "resolved",
      value: calculateE1RM(200, 5, 8)!,
      hit: true,
    });
  });

  it("agrees with the app's own rows for every rep count and effort", () => {
    for (const rpe of [undefined, 10, 9, 8, 7, 6]) {
      for (let lastReps = 0; lastReps <= 14; lastReps++) {
        const session = workout({ lastReps, setOverrides: { rpe } });
        const rows = e1rmsForWorkout(session).filter((row) => row.exerciseId === "squat");
        const estimate = rows.length > 0 ? Math.max(...rows.map((row) => row.estimated1RM)) : null;
        const eligible = isE1RMEligibleSet("T1", true, lastReps);
        expect(estimate !== null, `${lastReps} reps`).toBe(eligible);
        expect(resolve(best, logOf(session)), `${lastReps} reps at ${rpe}`).toEqual({
          state: "resolved",
          value: estimate ?? 0,
          hit: estimate !== null && isNewPR(estimate, [BEST_LEVEL]),
        });
      }
    }
  });

  it("is a miss, not a hit, when the last set is too long or too short to give an estimate", () => {
    // Twelve reps at 200 would be far above the level by the formula, but the app
    // keeps no estimate for a set of more than ten reps, so it shows no new best.
    expect(resolve(best, logOf(workout({ lastReps: 12 })))).toEqual({
      state: "resolved",
      value: 0,
      hit: false,
    });
    expect(resolve(best, logOf(workout({ lastReps: 1 })))).toMatchObject({ value: 0, hit: false });
  });

  it("is decided against the level on the row, whatever else is in the log", () => {
    const today = workout({ lastReps: 6 });
    // An earlier session edited upwards afterwards does not turn the hit into a miss.
    const earlier = t1Session({
      id: "w0",
      at: new Date(START.getTime() - 7 * DAY),
      weight: 230,
      lastReps: 8,
    });
    expect(resolve(best, logOf(earlier, today))).toMatchObject({ hit: true });
    // Only an edit to this workout's own sets moves it.
    const edited = workout({ lastReps: 4 });
    expect(resolve(best, logOf(earlier, edited))).toMatchObject({ hit: false });
  });

  it("is void when the row does not say what level to beat", () => {
    const unstated = forecastRow({ ...best, event: { type: "e1rmAbove", weight: 200 } });
    expect(resolve(unstated, logOf(workout()))).toEqual({ state: "void", reason: "not-scorable" });
  });

  it("scores a pass by the program's rule: every set at the target", () => {
    expect(resolve(pass, logOf(workout({ lastReps: 3 })))).toEqual({
      state: "resolved",
      value: 3,
      hit: true,
    });
    expect(resolve(pass, logOf(workout({ lastReps: 2 })))).toMatchObject({ value: 2, hit: false });
    // The last set made it but an earlier one did not.
    const earlierMiss = workout({ lastReps: 4, earlierReps: [3, 3, 2, 3] });
    expect(resolve(pass, logOf(earlierMiss))).toEqual({ state: "resolved", value: 4, hit: false });
  });
});

describe("session length", () => {
  it("resolves to the recorded length", () => {
    expect(resolve(length, logOf(workout()))).toEqual({ state: "resolved", value: 2400, inside: true });
    expect(resolve(length, logOf({ ...workout(), totalDurationSeconds: 3000 }))).toEqual({
      state: "resolved",
      value: 3000,
      inside: false,
    });
  });

  it("is open, or void, as the workout is", () => {
    expect(resolve(length, logOf({ ...workout(), completedAt: null }))).toEqual({ state: "open" });
    expect(resolve(length, logOf())).toMatchObject({ reason: "workout-missing" });
    expect(resolve(length, logOf({ ...workout(), endedEarly: true }))).toEqual({
      state: "void",
      reason: "ended-early",
    });
    expect(resolve(length, logOf({ ...workout(), totalDurationSeconds: 0 }))).toEqual({
      state: "void",
      reason: "no-duration",
    });
  });

  it("does not mind what weight was lifted", () => {
    expect(resolve(length, logOf(workout({ weight: 250 })))).toMatchObject({ state: "resolved" });
  });
});

describe("the outcome follows the log, and the row never changes", () => {
  it("moves when a set is edited, deleted or the workout is deleted and restored", () => {
    const stored = JSON.stringify([reps, pass]);
    let log: LogState = { workouts: [workout()], adjustments: [] };
    const status = (forecast: Forecast) =>
      resolve(forecast, { workouts: log.workouts, bodyweight: [] });
    expect(status(reps)).toMatchObject({ value: 5, inside: true });
    expect(status(pass)).toMatchObject({ hit: true });

    log = applyChange(log, { kind: "editSet", workoutId: "w1", setId: "w1-s5", patch: { actualReps: 2 } });
    expect(status(reps)).toMatchObject({ value: 2, inside: false });
    expect(status(pass)).toMatchObject({ hit: false });

    log = applyChange(log, { kind: "editSet", workoutId: "w1", setId: "w1-s5", patch: { weight: 205 } });
    expect(status(reps)).toEqual({ state: "void", reason: "weight-changed" });

    log = applyChange(log, { kind: "editSet", workoutId: "w1", setId: "w1-s5", patch: { weight: 200, actualReps: 4 } });
    expect(status(reps)).toMatchObject({ value: 4, inside: true });

    log = applyChange(log, { kind: "deleteWorkout", workoutId: "w1" });
    expect(status(reps)).toEqual({ state: "void", reason: "workout-deleted" });

    log = applyChange(log, { kind: "restoreWorkout", workoutId: "w1" });
    expect(status(reps)).toMatchObject({ value: 4, inside: true });

    log = applyChange(log, { kind: "deleteSet", workoutId: "w1", setId: "w1-s5" });
    expect(status(reps)).toEqual({ state: "void", reason: "not-reached" });

    expect(JSON.stringify([reps, pass])).toBe(stored);
  });
});

describe("forecasts for a date", () => {
  const due = new Date("2026-12-01T12:00:00Z");
  const around = (days: number) => new Date(due.getTime() + days * DAY);
  const closed = around(BODYWEIGHT_MODEL.outcomeWindowDays + 0.01);

  const body = forecastRow({
    id: "h1",
    slot: "bodyweight4w|bodyweight|2026-W45",
    kind: "bodyweight4w",
    workoutId: undefined,
    exerciseId: undefined,
    tier: undefined,
    dueAt: due,
    event: { type: "bodyweightMean", windowDays: BODYWEIGHT_MODEL.outcomeWindowDays },
    prediction: { point: 226, low: 224.5, high: 227.5, unit: "lb" },
  });

  it("is open until the window around the date has closed", () => {
    const bodyweight = [weighIn("a", around(-1), 226), weighIn("b", around(0), 227)];
    const log: ForecastLog = { workouts: [], bodyweight };
    expect(resolve(body, log, around(-10))).toEqual({ state: "open" });
    expect(resolve(body, log, around(BODYWEIGHT_MODEL.outcomeWindowDays - 0.01))).toEqual({
      state: "open",
    });
    expect(resolve(body, log, closed)).toMatchObject({ state: "resolved" });
  });

  it("resolves bodyweight to the mean of the weigh-ins in the window", () => {
    const bodyweight = [
      weighIn("before", around(-BODYWEIGHT_MODEL.outcomeWindowDays - 1), 240),
      weighIn("a", around(-2), 226),
      weighIn("b", around(0), 227),
      weighIn("c", around(3), 225),
      weighIn("after", around(BODYWEIGHT_MODEL.outcomeWindowDays + 1), 210),
      { ...weighIn("deleted", around(1), 300), deletedAt: 2 },
    ];
    expect(resolve(body, { workouts: [], bodyweight }, closed)).toEqual({
      state: "resolved",
      value: 226,
      inside: true,
    });
    const heavier = bodyweight.map((log) => ({ ...log, weight: log.weight + 3 }));
    expect(resolve(body, { workouts: [], bodyweight: heavier }, closed)).toMatchObject({
      value: 229,
      inside: false,
    });
  });

  it("is void with too few measurements in the window", () => {
    expect(BODYWEIGHT_MODEL.minOutcomeEntries).toBe(2);
    const one = [weighIn("a", around(0), 226)];
    expect(resolve(body, { workouts: [], bodyweight: one }, closed)).toEqual({
      state: "void",
      reason: "too-few-measurements",
    });
    expect(resolve(body, { workouts: [], bodyweight: [] }, closed)).toMatchObject({ state: "void" });
  });

  it("scores with the minimum stored on the row, not the constant read now", () => {
    const one: ForecastLog = { workouts: [], bodyweight: [weighIn("a", around(0), 226)] };
    const stored = (minResults: number): Forecast => ({
      ...body,
      event: { ...body.event, minResults },
    });
    // The constant needs more than one weigh-in; a row made with a minimum of one still scores.
    expect(BODYWEIGHT_MODEL.minOutcomeEntries).toBeGreaterThan(1);
    expect(resolve(stored(1), one, closed)).toMatchObject({ state: "resolved" });
    expect(resolve(stored(2), one, closed)).toEqual({
      state: "void",
      reason: "too-few-measurements",
    });
  });

  const lift = forecastRow({
    id: "h2",
    slot: "e1rm4w|squat|2026-W45",
    kind: "e1rm4w",
    workoutId: undefined,
    tier: undefined,
    dueAt: due,
    event: { type: "e1rmLevel", windowDays: E1RM_HORIZON_MODEL.outcomeWindowDays },
    prediction: { point: 240, low: 230, high: 250, unit: "lb" },
  });
  const liftClosed = around(E1RM_HORIZON_MODEL.outcomeWindowDays + 0.01);

  it("resolves an estimated max to the mean of the lift's results in the window", () => {
    const workouts = [
      t1Session({ id: "in1", at: around(-5), weight: 205, lastReps: 5 }),
      t1Session({ id: "in2", at: around(4), weight: 210, lastReps: 5, setOverrides: { rpe: 9 } }),
      t1Session({ id: "out", at: around(-20), weight: 300, lastReps: 5 }),
      t1Session({ id: "bench", exerciseId: "bench", at: around(1), weight: 150, lastReps: 5 }),
      { ...t1Session({ id: "gone", at: around(2), weight: 400, lastReps: 5 }), deletedAt: 8 },
    ];
    // The app's own estimate, which credits the logged RPE.
    const expected = (calculateE1RM(205, 5)! + calculateE1RM(210, 5, 9)!) / 2;
    expect(resolve(lift, { workouts, bodyweight: [] }, liftClosed)).toEqual({
      state: "resolved",
      value: expected,
      inside: expected >= 230 && expected <= 250,
    });
    expect(resolve(lift, { workouts, bodyweight: [] }, around(0))).toEqual({ state: "open" });
  });

  it("is void when the lift was not trained around the date", () => {
    expect(resolve(lift, logOf(), liftClosed)).toEqual({
      state: "void",
      reason: "too-few-measurements",
    });
  });
});

describe("earliestPerSlot", () => {
  const at = (hours: number) => new Date(START.getTime() + hours * 3_600_000);

  it("keeps the first row made for each slot, oldest first", () => {
    const rows = [
      forecastRow({ id: "late", slot: "e1rm4w|squat|2026-W45", madeAt: at(30) }),
      forecastRow({ id: "session", slot: "fc:w1:amrapReps:squat:T1", madeAt: at(10) }),
      forecastRow({ id: "early", slot: "e1rm4w|squat|2026-W45", madeAt: at(5) }),
      forecastRow({ id: "other", slot: "e1rm4w|bench|2026-W45", madeAt: at(20) }),
    ];
    expect(earliestPerSlot(rows).map((row) => row.id)).toEqual(["early", "session", "other"]);
  });

  it("breaks a tie on the time by id and ignores deleted rows", () => {
    const rows = [
      forecastRow({ id: "b", slot: "s", madeAt: at(1) }),
      forecastRow({ id: "a", slot: "s", madeAt: at(1) }),
      forecastRow({ id: "0", slot: "s", madeAt: at(0), deletedAt: 3 }),
    ];
    expect(earliestPerSlot(rows).map((row) => row.id)).toEqual(["a"]);
    expect(earliestPerSlot([])).toEqual([]);
  });

  it("reads times stored as text", () => {
    const rows = [
      forecastRow({ id: "x", slot: "s", madeAt: "2026-11-03T00:00:00Z" as unknown as Date }),
      forecastRow({ id: "y", slot: "s", madeAt: "2026-11-02T00:00:00Z" as unknown as Date }),
    ];
    expect(earliestPerSlot(rows).map((row) => row.id)).toEqual(["y"]);
  });
});
