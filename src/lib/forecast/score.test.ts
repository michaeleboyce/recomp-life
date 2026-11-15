// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Forecast, ForecastKind, ForecastStatus } from "@/types";
import { CALIBRATION } from "./coefficients";
import { FORECAST_KIND_IDS } from "./registry";
import {
  CALIBRATION_BIN_EDGES,
  RANGE_SOURCE_KIND,
  scoreForecasts,
  sdScaleChanges,
  sdScaleFor,
  sdScaleOf,
  sdScales,
  summarize,
  trackRecord,
} from "./score";
import { forecastRow, t1Session } from "./testHelpers";
import type { ScoredForecast } from "./types";

const T0 = new Date("2026-09-01T17:00:00Z").getTime();
const HOUR = 3_600_000;

let serial = 0;
/** A scored forecast; each call is made an hour after the one before. */
function scored(status: ForecastStatus, overrides: Partial<Forecast> = {}): ScoredForecast {
  serial += 1;
  const id = overrides.id ?? `f${serial}`;
  return {
    forecast: forecastRow({ id, slot: id, madeAt: new Date(T0 + serial * HOUR), ...overrides }),
    status,
  };
}

const inside = (value = 5): ForecastStatus => ({ state: "resolved", value, inside: true });
const outside = (value = 9): ForecastStatus => ({ state: "resolved", value, inside: false });
const chance = (probability: number, hit: boolean, kind: ForecastKind = "liftPass") =>
  scored(
    { state: "resolved", value: hit ? 5 : 1, hit },
    { kind, prediction: { point: probability, probability, unit: "chance" } }
  );

/** `count` resolved range forecasts of one kind made at `scale`, `hits` of them inside. */
function ranges(count: number, hits: number, scale = 1, kind: ForecastKind = "amrapReps") {
  return Array.from({ length: count }, (_, i) =>
    scored(i < hits ? inside() : outside(), { kind, inputs: { sdScale: scale } })
  );
}

describe("summarize", () => {
  it("counts open, void and resolved forecasts", () => {
    const record = summarize([
      scored({ state: "open" }),
      scored({ state: "void", reason: "weight-changed" }),
      scored({ state: "void", reason: "not-reached" }),
      scored(inside()),
    ]);
    expect(record).toMatchObject({ total: 4, open: 1, void: 2, resolved: 1 });
  });

  it("gives the share of results inside their range", () => {
    const record = summarize([...ranges(10, 7), scored({ state: "void", reason: "freeze" })]);
    expect(record.ranges).toEqual({ n: 10, inside: 7, share: 0.7 });
  });

  it("leaves a void forecast out of every score", () => {
    const withVoid = summarize([
      ...ranges(4, 4),
      scored({ state: "void", reason: "weight-changed" }),
    ]);
    const without = summarize(ranges(4, 4));
    expect(withVoid.ranges).toEqual(without.ranges);
    expect(withVoid.miss).toEqual(without.miss);
  });

  it("gives the average miss and the bias of amounts", () => {
    const record = summarize([
      scored(inside(7), { prediction: { point: 5, low: 3, high: 7, unit: "reps" } }),
      scored(inside(4), { prediction: { point: 5, low: 3, high: 7, unit: "reps" } }),
      scored(outside(9), { prediction: { point: 6, low: 4, high: 8, unit: "reps" } }),
    ]);
    // Misses: +2, -1, +3.
    expect(record.miss.n).toBe(3);
    expect(record.miss.unit).toBe("reps");
    expect(record.miss.meanAbs).toBeCloseTo(2, 10);
    expect(record.miss.bias).toBeCloseTo(4 / 3, 10);
  });

  it("gives no average miss for a group that mixes units", () => {
    const record = summarize([
      scored(inside(5)),
      scored(inside(2400), {
        kind: "sessionLength",
        prediction: { point: 2300, low: 2000, high: 2600, unit: "s" },
      }),
    ]);
    expect(record.miss).toEqual({ n: 2, unit: null, meanAbs: null, bias: null });
  });

  it("scores stated chances: bands, share that happened and the mean squared gap", () => {
    const record = summarize([
      chance(0.9, true),
      chance(0.9, true),
      chance(0.85, false),
      chance(0.1, false),
      chance(0.15, true),
      chance(1, true),
      chance(0.5, false),
    ]);
    expect(record.chances.n).toBe(7);
    expect(record.chances.hits).toBe(4);
    expect(record.chances.meanStated).toBeCloseTo(4.4 / 7, 10);
    expect(record.chances.observed).toBeCloseTo(4 / 7, 10);
    const gaps = [0.01, 0.01, 0.7225, 0.01, 0.7225, 0, 0.25];
    expect(record.chances.brier).toBeCloseTo(gaps.reduce((a, b) => a + b, 0) / 7, 10);

    expect(record.chances.bins.map((b) => [b.from, b.to])).toEqual(
      CALIBRATION_BIN_EDGES.slice(0, -1).map((from, i) => [from, CALIBRATION_BIN_EDGES[i + 1]])
    );
    const [lowest, , middle, , highest] = record.chances.bins;
    expect(lowest).toMatchObject({ n: 2, observed: 0.5 });
    expect(lowest.meanStated).toBeCloseTo(0.125, 10);
    expect(middle).toMatchObject({ n: 1, meanStated: 0.5, observed: 0 });
    // A stated chance of exactly 1 belongs to the top band.
    expect(highest.n).toBe(4);
    expect(highest.observed).toBe(0.75);
    expect(record.chances.bins[1]).toMatchObject({ n: 0, meanStated: null, observed: null });
  });

  it("keeps chances out of the miss and amounts out of the calibration", () => {
    const record = summarize([chance(0.8, true), scored(inside(5))]);
    expect(record.miss.n).toBe(1);
    expect(record.chances.n).toBe(1);
    expect(record.ranges.n).toBe(1);
  });

  it("is all nulls and zeros for nothing", () => {
    const record = summarize([]);
    expect(record).toMatchObject({ total: 0, resolved: 0 });
    expect(record.ranges.share).toBeNull();
    expect(record.chances.brier).toBeNull();
    expect(record.miss.meanAbs).toBeNull();
  });
});

describe("trackRecord", () => {
  const items = [
    scored(inside(), { kind: "amrapReps", exerciseId: "squat", basis: "trend" }),
    scored(outside(), { kind: "amrapReps", exerciseId: "bench", basis: "prior" }),
    chance(0.7, true),
    scored(inside(2400), {
      kind: "sessionLength",
      exerciseId: undefined,
      basis: "persistence",
      prediction: { point: 2400, low: 2200, high: 2600, unit: "s" },
    }),
  ];
  const record = trackRecord(items);

  it("splits by kind, by lift and by how much history the forecast had", () => {
    expect(record.overall.total).toBe(4);
    expect(Object.keys(record.byKind).sort()).toEqual(["amrapReps", "liftPass", "sessionLength"]);
    expect(record.byKind.amrapReps!.ranges).toEqual({ n: 2, inside: 1, share: 0.5 });
    expect(record.byKind.sessionLength!.miss.unit).toBe("s");

    expect(Object.keys(record.byLift).sort()).toEqual(["bench", "squat"]);
    expect(record.byLift.squat.total).toBe(2);
    expect(record.byLift.bench.ranges.share).toBe(0);

    expect(record.byBasis.prior!.ranges.share).toBe(0);
    expect(record.byBasis.trend!.total).toBe(2);
    expect(record.byBasis.persistence!.total).toBe(1);
    expect(record.byBasis["regime-change"]).toBeUndefined();
  });
});

describe("scoreForecasts", () => {
  it("scores the earliest row of each slot against the log", () => {
    const workout = t1Session({
      id: "w1",
      at: new Date("2026-11-02T17:00:00Z"),
      weight: 200,
      lastReps: 5,
    });
    const first = forecastRow({ id: "a", slot: "s1", madeAt: new Date(T0) });
    const second = forecastRow({ id: "b", slot: "s1", madeAt: new Date(T0 + HOUR) });
    const missing = forecastRow({ id: "c", slot: "s2", workoutId: "nope", madeAt: new Date(T0) });
    const result = scoreForecasts(
      [second, missing, first],
      { workouts: [workout], bodyweight: [] },
      new Date("2026-11-03T00:00:00Z")
    );
    expect(result.map((item) => [item.forecast.id, item.status.state])).toEqual([
      ["a", "resolved"],
      ["c", "void"],
    ]);
  });
});

describe("sdScaleFor: when a kind's range widens", () => {
  const MIN = CALIBRATION.minResolvedForCorrection;
  const STEP = CALIBRATION.sdScaleStep;
  /** The fewest results inside, out of MIN, that do not call for widening. */
  const enough = Math.ceil(CALIBRATION.widenBelowCoverage * MIN);

  it("starts at 1 with no record", () => {
    expect(sdScaleFor("amrapReps", [])).toBe(CALIBRATION.sdScaleMin);
    expect(sdScaleFor("amrapReps", ranges(10, 0, 1, "sessionLength"))).toBe(1);
  });

  it("does not widen before enough forecasts have resolved, however badly they did", () => {
    expect(sdScaleFor("amrapReps", ranges(MIN - 1, 0))).toBe(1);
  });

  it("widens by one step once enough have resolved and too few landed inside", () => {
    expect(sdScaleFor("amrapReps", ranges(MIN, enough - 1))).toBeCloseTo(1 + STEP, 10);
    expect(sdScaleFor("amrapReps", ranges(MIN, 0))).toBeCloseTo(1 + STEP, 10);
  });

  it("does not widen at or above the coverage threshold", () => {
    expect(enough / MIN).toBeGreaterThanOrEqual(CALIBRATION.widenBelowCoverage);
    expect(sdScaleFor("amrapReps", ranges(MIN, enough))).toBe(1);
    expect(sdScaleFor("amrapReps", ranges(MIN, MIN))).toBe(1);
  });

  it("counts only resolved range forecasts", () => {
    const record = [
      ...ranges(MIN - 1, 0),
      scored({ state: "open" }),
      scored({ state: "void", reason: "weight-changed" }),
      chance(0.9, false, "amrapReps"),
    ];
    expect(sdScaleFor("amrapReps", record)).toBe(1);
  });

  it("needs a full set of results at the new width before the next step", () => {
    const first = ranges(MIN, 0, 1);
    const afterStep = [...first, ...ranges(MIN - 1, 0, 1 + STEP)];
    expect(sdScaleFor("amrapReps", afterStep)).toBeCloseTo(1 + STEP, 10);
    const full = [...first, ...ranges(MIN, 0, 1 + STEP)];
    expect(sdScaleFor("amrapReps", full)).toBeCloseTo(1 + 2 * STEP, 10);
  });

  it("holds the width, and never narrows, once the ranges hold", () => {
    const record = [...ranges(MIN, 0, 1), ...ranges(3 * MIN, 3 * MIN, 1 + STEP)];
    expect(sdScaleFor("amrapReps", record)).toBeCloseTo(1 + STEP, 10);
  });

  it("never goes above the limit", () => {
    const top = CALIBRATION.sdScaleMax;
    expect(sdScaleFor("amrapReps", ranges(MIN, 0, top))).toBe(top);
    // The last step is cut short at the limit.
    const nearTop = Math.round((top - STEP / 2) * 100) / 100;
    expect(sdScaleFor("amrapReps", ranges(MIN, 0, nearTop))).toBe(top);

    // Walking it all the way up takes a full set of misses at every width.
    let record: ScoredForecast[] = [];
    let scale = sdScaleFor("amrapReps", record);
    let steps = 0;
    while (steps < 20) {
      record = [...record, ...ranges(MIN, 0, scale)];
      const next = sdScaleFor("amrapReps", record);
      if (next === scale) break;
      expect(next).toBeGreaterThan(scale);
      scale = next;
      steps += 1;
    }
    expect(scale).toBe(top);
    expect(steps).toBe(Math.ceil((top - CALIBRATION.sdScaleMin) / STEP));
  });

  it("widens each kind on its own record", () => {
    const record = [...ranges(MIN, 0, 1, "sessionLength"), ...ranges(MIN, MIN, 1, "amrapReps")];
    expect(sdScaleFor("sessionLength", record)).toBeCloseTo(1 + STEP, 10);
    expect(sdScaleFor("amrapReps", record)).toBe(1);
    expect(sdScaleFor("bodyweight4w", record)).toBe(1);
  });

  it("widens the two chance kinds with the reps ranges they come from", () => {
    expect(RANGE_SOURCE_KIND.newBest).toBe("amrapReps");
    expect(RANGE_SOURCE_KIND.liftPass).toBe("amrapReps");
    const record = ranges(MIN, 0);
    expect(sdScaleFor("newBest", record)).toBeCloseTo(1 + STEP, 10);
    expect(sdScaleFor("liftPass", record)).toBeCloseTo(1 + STEP, 10);
    const widened = sdScaleFor("amrapReps", record);
    expect(sdScales(record)).toEqual({
      amrapReps: widened,
      newBest: widened,
      liftPass: widened,
      sessionLength: 1,
      e1rm4w: 1,
      bodyweight4w: 1,
    });
    expect(Object.keys(sdScales([])).sort()).toEqual([...FORECAST_KIND_IDS].sort());
  });

  it("reads the factor a forecast was made with, 1 when it is missing or out of bounds", () => {
    expect(sdScaleOf(forecastRow({ inputs: { sdScale: 1.3 } }))).toBe(1.3);
    expect(sdScaleOf(forecastRow({ inputs: {} }))).toBe(1);
    expect(sdScaleOf(forecastRow({ inputs: { sdScale: "wide" } }))).toBe(1);
    expect(sdScaleOf(forecastRow({ inputs: { sdScale: 12 } }))).toBe(CALIBRATION.sdScaleMax);
  });
});

describe("sdScaleChanges: what the adjustment log shows", () => {
  it("lists each time a kind was first forecast with a wider range", () => {
    const rows = [
      ...ranges(3, 3, 1),
      ...ranges(2, 2, 1.15),
      ...ranges(2, 2, 1.15, "sessionLength"),
      ...ranges(1, 1, 1.3),
      // The chance kinds share the reps factor and are not listed again.
      chance(0.5, true, "liftPass"),
    ].map((item) => item.forecast);
    rows[rows.length - 1].inputs = { sdScale: 1.6 };

    const changes = sdScaleChanges(rows);
    expect(changes.map((c) => [c.kind, c.from, c.to])).toEqual([
      ["amrapReps", 1, 1.15],
      ["sessionLength", 1, 1.15],
      ["amrapReps", 1.15, 1.3],
    ]);
    expect(changes[0].forecastId).toBe(rows[3].id);
    expect(changes[0].at).toEqual(rows[3].madeAt);
  });

  it("is empty when nothing was widened", () => {
    expect(sdScaleChanges(ranges(5, 5).map((item) => item.forecast))).toEqual([]);
    expect(sdScaleChanges([])).toEqual([]);
  });
});
