// @vitest-environment node
// Scoring is done on every read (Today, the track record) and when a workout starts,
// over the whole history. Its cost must grow with the history, not with its square:
// each workout's estimated-max results are worked out once per pass and workouts are
// found by id, however many forecasts there are. Measured by counting the work, not
// the clock.
import { beforeEach, describe, expect, it, vi } from "vitest";

const counted = vi.hoisted(() => ({ e1rmsForWorkout: 0 }));
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

import { indexLog } from "./logIndex";
import { resolveForecast } from "./resolve";
import { scoreForecasts, sdScales, trackRecord } from "./score";
import { DAY, longHistory } from "./testHelpers";
import type { ForecastLog } from "./types";

/** The array with a count of every whole-array scan made on it (find, filter, map...). */
function countingScans<T>(rows: T[]): { rows: T[]; scans: () => number } {
  let scans = 0;
  const SCANS = new Set<PropertyKey>([
    "find", "findIndex", "filter", "map", "flatMap", "forEach", "some", "every", "reduce",
    Symbol.iterator,
  ]);
  const proxy = new Proxy(rows, {
    get(target, property, receiver) {
      if (SCANS.has(property)) scans += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  return { rows: proxy, scans: () => scans };
}

const WORKOUTS = 600;

describe("scoring a long history", () => {
  const data = longHistory(WORKOUTS);

  beforeEach(() => {
    counted.e1rmsForWorkout = 0;
  });

  it("has the size the test is about", () => {
    expect(data.workouts).toHaveLength(WORKOUTS);
    expect(data.forecasts).toHaveLength(WORKOUTS * 6);
  });

  it("works out each workout's estimated-max results at most once per pass", () => {
    const scored = scoreForecasts(data.forecasts, data, data.now);
    expect(scored).toHaveLength(data.forecasts.length);
    expect(scored.every((item) => item.status.state !== "open")).toBe(true);
    // 600 new-best and 600 estimated-max forecasts read them; each workout once.
    expect(counted.e1rmsForWorkout).toBeGreaterThan(0);
    expect(counted.e1rmsForWorkout).toBeLessThanOrEqual(WORKOUTS);
  });

  it("does no more of that work when there are twice the forecasts", () => {
    scoreForecasts(data.forecasts, data, data.now);
    const once = counted.e1rmsForWorkout;
    counted.e1rmsForWorkout = 0;
    const doubled = [
      ...data.forecasts,
      ...data.forecasts.map((row) => ({ ...row, id: `${row.id}:2`, slot: `${row.slot}:2` })),
    ];
    expect(scoreForecasts(doubled, data, data.now)).toHaveLength(doubled.length);
    expect(counted.e1rmsForWorkout).toBe(once);
  });

  it("scans the workouts and the weigh-ins a fixed number of times, not once per forecast", () => {
    const workouts = countingScans(data.workouts);
    const bodyweight = countingScans(data.bodyweight);
    const log: ForecastLog = { workouts: workouts.rows, bodyweight: bodyweight.rows };
    scoreForecasts(data.forecasts, log, data.now);
    expect(workouts.scans()).toBeLessThanOrEqual(4);
    expect(bodyweight.scans()).toBeLessThanOrEqual(4);
  });

  it("gives the same statuses as resolving each forecast on its own", () => {
    const scored = scoreForecasts(data.forecasts, data, data.now);
    for (let i = 0; i < scored.length; i += 97) {
      const { forecast, status } = scored[i];
      expect(resolveForecast(forecast, data, data.now), forecast.id).toEqual(status);
    }
    // Every kind of outcome is in there, so the comparison means something.
    const record = trackRecord(scored);
    expect(record.byKind.newBest!.chances.hits).toBeGreaterThan(0);
    expect(record.byKind.e1rm4w!.resolved).toBeGreaterThan(500);
    expect(record.byKind.bodyweight4w!.resolved).toBeGreaterThan(500);
    expect(Object.keys(sdScales(scored))).toHaveLength(6);
  });

  it("lets one index serve several passes", () => {
    const log = indexLog(data);
    scoreForecasts(data.forecasts, log, data.now);
    scoreForecasts(data.forecasts, log, new Date(data.now.getTime() + DAY));
    expect(counted.e1rmsForWorkout).toBeLessThanOrEqual(WORKOUTS);
    // An index is a log: indexing it again gives it back.
    expect(indexLog(log)).toBe(log);
  });
});
