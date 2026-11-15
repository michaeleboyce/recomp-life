// @vitest-environment node
// How the stall chance and the round-number date are checked against the log.
import { describe, expect, it } from "vitest";
import type { Forecast, WorkoutSession } from "@/types";
import { STALL_MODEL } from "./coefficients";
import { DAY_MS } from "./log";
import { resolveForecast } from "./resolve";
import { scoreForecasts } from "./score";
import { forecastRow, SETTINGS, t1Session, type T1SessionSpec } from "./testHelpers";
import type { ForecastLog } from "./types";

const MADE = new Date("2026-11-02T18:00:00Z");
const at = (days: number) => new Date(MADE.getTime() + days * DAY_MS);
const logOf = (...workouts: WorkoutSession[]): ForecastLog => ({ workouts, bodyweight: [] });

const stall = (overrides: Partial<Forecast> = {}): Forecast =>
  forecastRow({
    id: "h-stall",
    clientId: "h-stall",
    slot: "stallRisk|squat|2026-W45",
    kind: "stallRisk",
    workoutId: undefined,
    exerciseId: "squat",
    tier: "T1",
    madeAt: MADE,
    dueAt: at(18),
    event: {
      type: "missAtStage",
      weight: 200,
      reps: 3,
      windowDays: STALL_MODEL.outcomeWindowDays,
      minResults: STALL_MODEL.sessions,
    },
    prediction: { point: 0.3, probability: 0.3, unit: "chance" },
    inputs: { sdScale: 1, increment: 10 },
    modelVersion: "stall-1",
    ...overrides,
  });

const session = (id: string, days: number, weight: number, lastReps: number, extra: Partial<T1SessionSpec> = {}) =>
  t1Session({ id, at: at(days), weight, lastReps, ...extra });

const LATE = at(60);
const resolve = (forecast: Forecast, log: ForecastLog, now = LATE) => resolveForecast(forecast, log, now);

describe("the chance of a stall, checked", () => {
  it("is a stall at the first session that misses", () => {
    expect(resolve(stall(), logOf(session("a", 2, 200, 2)))).toEqual({ state: "resolved", value: 1, hit: true });
    // The squat's step at the gym is twice the barbell step.
    expect(SETTINGS.equipment.gymBarbellIncrementLbs * 2).toBe(10);
    expect(resolve(stall(), logOf(session("a", 2, 200, 5), session("b", 11, 210, 2)))).toEqual({
      state: "resolved",
      value: 2,
      hit: true,
    });
  });

  it("is no stall once two sessions in a row pass", () => {
    const log = logOf(session("a", 2, 200, 5), session("b", 11, 210, 3));
    expect(resolve(stall(), log)).toEqual({ state: "resolved", value: 0, hit: false });
  });

  it("counts a set short of the target on an earlier set as a miss", () => {
    const log = logOf(session("a", 2, 200, 5, { earlierReps: [3, 3, 2, 3] }));
    expect(resolve(stall(), log)).toMatchObject({ hit: true, value: 1 });
  });

  it("skips a session the program skips: held for pain, stopped part-way, lighter or at another scheme", () => {
    const pain = session("p", 1, 200, 5, { setOverrides: { status: "skipped_pain" } });
    const partial = { ...session("q", 2, 200, 5), sets: session("q", 2, 200, 5).sets.slice(0, 3) };
    const lighter = session("l", 3, 200, 5, { setOverrides: { weight: 190 } });
    const scheme = session("s", 4, 200, 5, { setOverrides: { targetReps: 5 } });
    const log = logOf(pain, partial, lighter, scheme, session("a", 5, 200, 5), session("b", 14, 210, 4));
    expect(resolve(stall(), log)).toEqual({ state: "resolved", value: 0, hit: false });
  });

  it("is set aside when the working weight is not the one the program carried, or the lift was done heavier", () => {
    expect(resolve(stall(), logOf(session("a", 2, 205, 5)))).toEqual({ state: "void", reason: "weight-changed" });
    const wrongStep = logOf(session("a", 2, 200, 5), session("b", 11, 205, 5));
    expect(resolve(stall(), wrongStep)).toEqual({ state: "void", reason: "weight-changed" });
    const heavier = session("a", 2, 200, 5, { setOverrides: { weight: 215 } });
    expect(resolve(stall(), logOf(heavier))).toEqual({ state: "void", reason: "weight-changed" });
    const drop = session("a", 2, 200, 5, { setOverrides: { status: "autoregulated_load_drop" } });
    expect(resolve(stall(), logOf(drop))).toEqual({ state: "void", reason: "load-drop" });
  });

  it("counts a home session with the dumbbell substitute, as progression does", () => {
    const home = session("h", 2, 200, 5, {
      overrides: { location: "home" },
      setOverrides: { weight: 80, isSubstituted: true, substituteExerciseId: "goblet_squat" },
    });
    // At home the step is the dumbbell one.
    const next = session("b", 11, 200 + SETTINGS.equipment.dumbbellIncrementLbs, 2);
    expect(resolve(stall(), logOf(home, next))).toEqual({ state: "resolved", value: 2, hit: true });
  });

  it("reads only sessions after it was made, finished by now, and is open until the window closes", () => {
    const before = session("x", -3, 200, 1);
    expect(resolve(stall(), logOf(before), at(5))).toEqual({ state: "open" });
    const closes = at(18 + STALL_MODEL.outcomeWindowDays);
    expect(resolve(stall(), logOf(before), new Date(closes.getTime() - 1))).toEqual({ state: "open" });
    expect(resolve(stall(), logOf(before), closes)).toEqual({ state: "void", reason: "too-few-measurements" });
    // A miss logged after `now` is not known yet.
    expect(resolve(stall(), logOf(session("a", 4, 200, 2)), at(3))).toEqual({ state: "open" });
    // Nor after the window has closed.
    expect(resolve(stall(), logOf(session("a", 40, 200, 2)))).toEqual({
      state: "void",
      reason: "too-few-measurements",
    });
    // A deleted or unfinished workout does not count.
    const deleted = { ...session("a", 2, 200, 2), deletedAt: 1 };
    const unfinished = { ...session("b", 3, 200, 2), completedAt: null };
    expect(resolve(stall(), logOf(deleted, unfinished), at(5))).toEqual({ state: "open" });
  });

  it("says nothing it cannot measure", () => {
    expect(resolve(stall({ event: { type: "missAtStage" } }), logOf())).toEqual({ state: "void", reason: "not-scorable" });
    expect(resolve(stall({ event: { type: "missAtStage", weight: 200, reps: 4 } }), logOf())).toEqual({
      state: "void",
      reason: "not-scorable",
    });
  });
});

describe("the date of a round number, checked", () => {
  const day = (date: Date) => date.getTime() / DAY_MS;
  const milestone = (overrides: Partial<Forecast> = {}): Forecast =>
    forecastRow({
      id: "h-mile",
      clientId: "h-mile",
      slot: "milestone|squat|2026-W45",
      kind: "milestone",
      workoutId: undefined,
      exerciseId: "squat",
      tier: "T1",
      madeAt: MADE,
      dueAt: at(30),
      event: { type: "weightReached", weight: 225 },
      prediction: { point: day(at(20)), low: day(at(12)), high: day(at(30)), unit: "day" },
      inputs: { sdScale: 1 },
      modelVersion: "milestone-1",
      ...overrides,
    });

  it("resolves to the day the lift was first lifted at the weight", () => {
    const log = logOf(session("a", 9, 215, 5), session("b", 18, 225, 4), session("c", 27, 235, 3));
    const status = resolve(milestone(), log);
    expect(status).toMatchObject({ state: "resolved", inside: true });
    expect(status.state === "resolved" && status.value).toBeCloseTo(
      day(log.workouts[1].completedAt!),
      9
    );
    // Earlier than the range: outside.
    expect(resolve(milestone(), logOf(session("a", 5, 230, 5)))).toMatchObject({ inside: false });
  });

  it("counts the lift itself only, after the forecast was made", () => {
    const home = session("h", 9, 225, 5, { setOverrides: { isSubstituted: true, substituteExerciseId: "goblet_squat" } });
    const before = session("x", -2, 230, 5);
    expect(resolve(milestone(), logOf(home, before), at(20))).toEqual({ state: "open" });
  });

  it("is outside its range once the range has ended without the weight lifted", () => {
    const log = logOf(session("a", 9, 215, 5));
    expect(resolve(milestone(), log, at(30))).toEqual({ state: "open" });
    const later = at(33);
    expect(resolve(milestone(), log, later)).toEqual({ state: "resolved", value: day(later), inside: false });
    // Lifted later after all: the value is that day, still outside.
    const reached = logOf(session("a", 9, 215, 5), session("b", 36, 225, 3));
    expect(resolve(milestone(), reached, at(40))).toMatchObject({ state: "resolved", inside: false });
  });

  it("says nothing it cannot measure", () => {
    expect(resolve(milestone({ event: { type: "weightReached" } }), logOf())).toEqual({
      state: "void",
      reason: "not-scorable",
    });
  });
});

describe("scoring them over a long history", () => {
  it("scans the workouts a fixed number of times, however many forecasts there are", () => {
    const workouts: WorkoutSession[] = [];
    const forecasts: Forecast[] = [];
    for (let i = 0; i < 300; i++) {
      workouts.push(session(`w${i}`, i * 3, 200, i % 2 === 0 ? 5 : 2));
      forecasts.push(
        stall({ id: `s${i}`, slot: `stallRisk|squat|${i}`, madeAt: at(i * 3 - 1), dueAt: at(i * 3 + 12) }),
        forecastRow({
          id: `m${i}`,
          slot: `milestone|squat|${i}`,
          kind: "milestone",
          workoutId: undefined,
          madeAt: at(i * 3 - 1),
          event: { type: "weightReached", weight: 225 },
          prediction: { point: day(at(i * 3 + 20)), low: day(at(i * 3 + 10)), high: day(at(i * 3 + 30)), unit: "day" },
        })
      );
    }
    let scans = 0;
    const counted = new Proxy(workouts, {
      get(target, property, receiver) {
        if (["find", "filter", "map", "forEach", "some", "every", "reduce", Symbol.iterator].includes(property)) {
          scans += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const scored = scoreForecasts(forecasts, { workouts: counted, bodyweight: [] }, at(2000));
    expect(scored).toHaveLength(forecasts.length);
    expect(scored.every((s) => s.status.state !== "open")).toBe(true);
    expect(scored.some((s) => s.status.state === "resolved" && s.forecast.kind === "stallRisk")).toBe(true);
    expect(scored.some((s) => s.status.state === "resolved" && s.forecast.kind === "milestone")).toBe(true);
    expect(scans).toBeLessThanOrEqual(4);
  });

  const day = (date: Date) => date.getTime() / DAY_MS;
});
