// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calculateE1RM } from "@/lib/e1rm";
import { measureBaseline } from "@/lib/projection/baseline";
import { projectE1RM } from "@/lib/projection/project";
import { fitTrend } from "@/lib/projection/trend";
import type { BodyweightLog } from "@/types";
import { BODYWEIGHT_MODEL, CALIBRATION, E1RM_HORIZON_MODEL } from "./coefficients";
import { e1rmResults, forecastBodyweight, forecastE1RM, weighIns } from "./horizon";
import { DAY, WEEK, sourceAt, t1Session, weighIn } from "./testHelpers";

const NOW = new Date("2026-11-14T17:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

/** Daily weigh-ins for the last `days` days, on a line losing `perWeek` lbs a week. */
function dailyWeighIns(days: number, perWeek: number, noise: (day: number) => number = () => 0) {
  const logs: BodyweightLog[] = [];
  for (let day = days - 1; day >= 0; day--) {
    logs.push(weighIn(`bw-${day}`, daysAgo(day), 230 + (perWeek * day) / 7 + noise(day)));
  }
  return logs;
}

describe("forecastBodyweight", () => {
  it("continues the recent line four weeks", () => {
    const forecast = forecastBodyweight(sourceAt(NOW, { bodyweight: dailyWeighIns(28, 1) }))!;
    expect(forecast.basis).toBe("trend");
    expect(forecast.dueAt).toBe(NOW.getTime() + BODYWEIGHT_MODEL.horizonDays * DAY);
    // 230 today, losing 1 lb a week.
    expect(forecast.point).toBeCloseTo(226, 6);
    expect(forecast.inputs.ratePerWeek).toBeCloseTo(-1, 6);
    expect(forecast.inputs.sampleSize).toBe(28);
    expect(forecast.low).toBeLessThan(forecast.point);
    expect(forecast.high).toBeGreaterThan(forecast.point);
  });

  it("uses the scatter floor when the weigh-ins sit on the line", () => {
    const logs = dailyWeighIns(28, 1);
    const forecast = forecastBodyweight(sourceAt(NOW, { bodyweight: logs }))!;
    const fit = fitTrend(weighIns(logs))!;
    const floor = BODYWEIGHT_MODEL.sdFloorFraction * 230;
    expect(forecast.high - forecast.point).toBeCloseTo(
      CALIBRATION.rangeZ * fit.predictionSd(forecast.dueAt, floor),
      6
    );
    // Reading the line four weeks ahead is less certain than one weigh-in today.
    expect(forecast.high - forecast.point).toBeGreaterThan(CALIBRATION.rangeZ * floor);
  });

  it("uses the weigh-ins' own scatter when it is wider than the floor", () => {
    const calm = forecastBodyweight(sourceAt(NOW, { bodyweight: dailyWeighIns(28, 1) }))!;
    const noisy = forecastBodyweight(
      sourceAt(NOW, { bodyweight: dailyWeighIns(28, 1, (day) => (day % 2 === 0 ? 2.5 : -2.5)) })
    )!;
    expect(noisy.high - noisy.low).toBeGreaterThan((calm.high - calm.low) * 2);
  });

  it("needs enough weigh-ins, spread over enough days", () => {
    const tooFew = dailyWeighIns(28, 1).filter((_, i) => i % 6 === 0);
    expect(tooFew.length).toBeLessThan(BODYWEIGHT_MODEL.minEntries);
    expect(forecastBodyweight(sourceAt(NOW, { bodyweight: tooFew }))).toBeNull();

    const tooShort = dailyWeighIns(BODYWEIGHT_MODEL.minSpanDays - 1, 1);
    expect(tooShort.length).toBeGreaterThanOrEqual(BODYWEIGHT_MODEL.minEntries);
    expect(forecastBodyweight(sourceAt(NOW, { bodyweight: tooShort }))).toBeNull();

    const justEnough = dailyWeighIns(BODYWEIGHT_MODEL.minSpanDays + 1, 1);
    expect(forecastBodyweight(sourceAt(NOW, { bodyweight: justEnough }))).not.toBeNull();
    expect(forecastBodyweight(sourceAt(NOW))).toBeNull();
  });

  it("reads only live weigh-ins inside the window and up to now", () => {
    const logs = dailyWeighIns(28, 1);
    const base = forecastBodyweight(sourceAt(NOW, { bodyweight: logs }))!;
    const extra: BodyweightLog[] = [
      weighIn("old", daysAgo(60), 300),
      weighIn("future", new Date(NOW.getTime() + 2 * DAY), 150),
      { ...weighIn("deleted", daysAgo(3), 400), deletedAt: 9 },
    ];
    expect(forecastBodyweight(sourceAt(NOW, { bodyweight: [...extra, ...logs] }))).toEqual(base);
  });

  it("widens with the track-record factor", () => {
    const bodyweight = dailyWeighIns(28, 1);
    const base = forecastBodyweight(sourceAt(NOW, { bodyweight }))!;
    const wide = forecastBodyweight(sourceAt(NOW, { bodyweight, sdScale: { bodyweight4w: 2 } }))!;
    expect(wide.point).toBe(base.point);
    expect(wide.high - wide.point).toBeCloseTo((base.high - base.point) * 2, 6);
    expect(wide.inputs.sdScale).toBe(2);
  });
});

/** Squat sessions a week apart, the weight rising 5 lb each time: [weeks ago, reps]. */
function squatHistory(rows: Array<[number, number]>) {
  return rows.map(([weeksAgo, reps], i) =>
    t1Session({
      id: `sq${i}`,
      at: new Date(NOW.getTime() - weeksAgo * WEEK),
      weight: 200 + i * 5,
      lastReps: reps,
    })
  );
}

describe("e1rmResults", () => {
  it("gives the results the app stores for the workouts, by lift, oldest first", () => {
    const workouts = [
      ...squatHistory([
        [2, 5],
        [1, 4],
      ]).reverse(),
      t1Session({ id: "b1", exerciseId: "bench", at: daysAgo(3), weight: 150, lastReps: 6 }),
    ];
    const results = e1rmResults(workouts);
    expect(results.get("squat")!.map((p) => p.v)).toEqual([
      calculateE1RM(200, 5),
      calculateE1RM(205, 4),
    ]);
    expect(results.get("bench")!.map((p) => p.v)).toEqual([calculateE1RM(150, 6)]);
  });

  it("credits a logged reps-left answer, as the stored estimate does", () => {
    const [workout] = squatHistory([[1, 5]]);
    workout.sets[4] = { ...workout.sets[4], repsInReserve: "1-2" };
    expect(e1rmResults([workout]).get("squat")![0].v).toBe(calculateE1RM(200, 5, "1-2"));
  });

  it("skips deleted workouts, home substitutes and sets too long to estimate from", () => {
    const deleted = { ...squatHistory([[3, 5]])[0], id: "gone", deletedAt: 4 };
    const substitute = t1Session({
      id: "home",
      at: daysAgo(4),
      weight: 80,
      lastReps: 6,
      substituteExerciseId: "goblet_squat",
    });
    const long = t1Session({ id: "long", at: daysAgo(2), weight: 100, lastReps: 15 });
    expect(e1rmResults([deleted, substitute, long]).size).toBe(0);
  });
});

describe("forecastE1RM", () => {
  const workouts = squatHistory([
    [5, 5],
    [4, 5],
    [3, 5],
    [2, 4],
    [1, 5],
  ]);

  it("is the lift's current trend from projectE1RM, four weeks on", () => {
    const source = sourceAt(NOW, { workouts });
    const forecast = forecastE1RM(source, "squat")!;
    const projection = projectE1RM({
      history: e1rmResults(workouts).get("squat")!,
      baseline: measureBaseline(
        {
          workouts,
          e1rms: [],
          bodyweight: [],
          runs: [],
          readiness: [],
          pain: [],
          liftStates: [],
          settings: source.settings,
        },
        "squat",
        NOW
      ),
      weeks: E1RM_HORIZON_MODEL.horizonWeeks,
      now: NOW,
    });
    const end = projection.points[E1RM_HORIZON_MODEL.horizonWeeks];
    expect(projection.status).toBe("ok");
    expect(forecast.point).toBeCloseTo(end.v, 8);
    expect(forecast.low).toBeCloseTo(end.low, 8);
    expect(forecast.high).toBeCloseTo(end.high, 8);
    expect(forecast.dueAt).toBe(NOW.getTime() + E1RM_HORIZON_MODEL.horizonWeeks * WEEK);
    expect(forecast.basis).toBe("trend");
    expect(forecast.inputs.sampleSize).toBe(5);
  });

  it("is null until the lift has enough results to fit", () => {
    expect(forecastE1RM(sourceAt(NOW, { workouts: workouts.slice(0, 3) }), "squat")).toBeNull();
    expect(forecastE1RM(sourceAt(NOW, { workouts }), "bench")).toBeNull();
    expect(forecastE1RM(sourceAt(NOW), "squat")).toBeNull();
  });

  it("reads only workouts finished by now", () => {
    const base = forecastE1RM(sourceAt(NOW, { workouts }), "squat");
    const later = t1Session({
      id: "later",
      at: new Date(NOW.getTime() + DAY),
      weight: 300,
      lastReps: 8,
    });
    const open = {
      ...t1Session({ id: "open", at: daysAgo(1), weight: 300, lastReps: 8 }),
      completedAt: null,
    };
    expect(forecastE1RM(sourceAt(NOW, { workouts: [...workouts, later, open] }), "squat")).toEqual(
      base
    );
  });

  it("is marked as a regime change when the last result is stale", () => {
    const later = new Date(NOW.getTime() + 6 * WEEK);
    const forecast = forecastE1RM(sourceAt(later, { workouts }), "squat")!;
    expect(forecast.basis).toBe("regime-change");
  });

  it("widens with the track-record factor", () => {
    const base = forecastE1RM(sourceAt(NOW, { workouts }), "squat")!;
    const wide = forecastE1RM(sourceAt(NOW, { workouts, sdScale: { e1rm4w: 1.5 } }), "squat")!;
    expect(wide.point).toBe(base.point);
    expect(wide.high - wide.point).toBeCloseTo((base.high - base.point) * 1.5, 8);
    expect(wide.point - wide.low).toBeCloseTo((base.point - base.low) * 1.5, 8);
  });
});
