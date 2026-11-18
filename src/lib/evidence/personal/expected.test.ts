import { describe, expect, it } from "vitest";
import {
  estimateRepsLevel,
  lastT1Sets,
  repsPmf,
  typicalReps,
} from "@/lib/forecast";
import { lastSetResiduals } from "./expected";
import { DAY, emptyLog, makeT1Workout } from "./testHelpers";

const NOW = new Date("2026-11-15T12:00:00Z");
const FIRST = NOW.getTime() - 40 * DAY;
const at = (i: number) => new Date(FIRST + i * 2 * DAY);

describe("lastSetResiduals", () => {
  it("uses the stored reps forecast of the workout when there is one", () => {
    const a = makeT1Workout({ id: "w0", at: at(0), weight: 200, lastReps: 6 });
    const b = makeT1Workout({ id: "w1", at: at(1), weight: 205, lastReps: 4, expected: 6 });
    const out = lastSetResiduals(
      { ...emptyLog(), workouts: [a.workout, b.workout], forecasts: [b.forecast!] },
      NOW
    );
    const row = out.find((r) => r.workoutId === "w1")!;
    expect(row).toMatchObject({ actual: 4, expected: 6, residual: -2, source: "forecast" });
  });

  it("takes the readiness shift back out of a stored forecast", () => {
    const a = makeT1Workout({ id: "w0", at: at(0), weight: 200, lastReps: 6 });
    const b = makeT1Workout({ id: "w1", at: at(1), weight: 200, lastReps: 5, expected: 4 });
    const level = 200 * (1 + 6 / 30);
    const forecast = {
      ...b.forecast!,
      inputs: { readinessShift: -0.03, baseLevel: level, scatter: 6, cuttingShift: 0 },
    };
    const neutral = typicalReps(repsPmf(200, { level, scatter: 6 }));
    expect(neutral).toBe(6);
    const [row] = lastSetResiduals(
      { ...emptyLog(), workouts: [a.workout, b.workout], forecasts: [forecast] },
      NOW
    ).filter((r) => r.workoutId === "w1");
    expect(row.expected).toBe(neutral);
    expect(row.source).toBe("forecast");
  });

  it("works the expected result out from the lift's history before the workout when nothing was stored", () => {
    const sessions = [7, 6, 6, 5, 5].map((reps, i) =>
      makeT1Workout({ id: `w${i}`, at: at(i), weight: 200 + 5 * i, lastReps: reps })
    );
    const workouts = sessions.map((s) => s.workout);
    const out = lastSetResiduals({ ...emptyLog(), workouts }, NOW);
    const last = out.find((r) => r.workoutId === "w4")!;

    const start = new Date(workouts[4].startedAt);
    const history = lastT1Sets(workouts.slice(0, 4), "squat", start);
    const level = estimateRepsLevel({
      history,
      performedExerciseId: "squat",
      weight: 220,
      plannedWeight: 220,
      targetReps: 3,
      phase: "maintaining",
      now: start,
    });
    expect(last.source).toBe("model");
    expect(last.expected).toBe(typicalReps(repsPmf(220, level)));
    expect(last.residual).toBe(5 - last.expected);
  });

  it("falls back to the model when the stored forecast was for another weight", () => {
    const a = makeT1Workout({ id: "w0", at: at(0), weight: 200, lastReps: 6 });
    const b = makeT1Workout({ id: "w1", at: at(1), weight: 205, lastReps: 5, expected: 9 });
    const forecast = { ...b.forecast!, event: { type: "amrapReps" as const, weight: 215 } };
    const [row] = lastSetResiduals(
      { ...emptyLog(), workouts: [a.workout, b.workout], forecasts: [forecast] },
      NOW
    ).filter((r) => r.workoutId === "w1");
    expect(row.source).toBe("model");
  });

  it("leaves out the first session of a lift: there is nothing to expect from", () => {
    const a = makeT1Workout({ id: "w0", at: at(0), weight: 200, lastReps: 6 });
    expect(lastSetResiduals({ ...emptyLog(), workouts: [a.workout] }, NOW)).toEqual([]);
  });

  it("leaves out a stored forecast made with no history", () => {
    const a = makeT1Workout({ id: "w0", at: at(0), weight: 200, lastReps: 6, expected: 8 });
    const forecast = { ...a.forecast!, basis: "prior" as const };
    expect(
      lastSetResiduals({ ...emptyLog(), workouts: [a.workout], forecasts: [forecast] }, NOW)
    ).toEqual([]);
  });

  it("keeps the lift's progression out of the comparison", () => {
    // The bar climbs faster than the lifter, so reps fall session by session. Measured
    // against the trend, the results hardly move.
    const reps = [9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4];
    const workouts = reps.map(
      (r, i) => makeT1Workout({ id: `w${i}`, at: at(i), weight: 200 + 5 * i, lastReps: r }).workout
    );
    const out = lastSetResiduals({ ...emptyLog(), workouts }, NOW);
    const late = out.slice(-6);
    expect(Math.max(...late.map((r) => Math.abs(r.residual)))).toBeLessThanOrEqual(1);
    expect(Math.max(...reps.slice(-6)) - Math.min(...reps.slice(-6))).toBe(2);
  });

  it("can be limited to some lifts", () => {
    const workouts = [0, 1].flatMap((i) => [
      makeT1Workout({ id: `s${i}`, exerciseId: "squat", at: at(2 * i), weight: 200, lastReps: 6 }).workout,
      makeT1Workout({ id: `b${i}`, exerciseId: "bench", at: at(2 * i + 1), weight: 150, lastReps: 6 }).workout,
    ]);
    const out = lastSetResiduals({ ...emptyLog(), workouts }, NOW, (id) => id === "bench");
    expect(out.map((r) => r.exerciseId)).toEqual(["bench"]);
  });
});
