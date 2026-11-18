// Every word the forecast screens show, over a representative set of forecasts, held
// in a file snapshot. Written before the text moved out of the component folder (K1):
// a moved or split function must give these words character for character.
import { describe, expect, it, vi } from "vitest";
import { replayForecasts, trackRecord, type ScoredForecast } from "@/lib/forecast";
import { demoReplayInput, forecastRow, simulateLifter } from "@/lib/forecast/testHelpers";
import type { Forecast, ForecastStatus } from "@/types";
import {
  BASIS_LABELS,
  CATEGORY_LABELS,
  chartBins,
  dayDate,
  dueOf,
  formatAmount,
  formatMinutes,
  inPeriod,
  inputLines,
  judgeShare,
  kindRows,
  liftLabel,
  liftShort,
  openForecasts,
  PERIOD_LABELS,
  questionOf,
  restsOnOf,
  shortDate,
  TARGET_IN_TEN,
  TARGET_PERCENT,
  TOO_FEW_TO_JUDGE,
  viewOf,
  voidLine,
  widenedKinds,
  wrongest,
  type ForecastView,
} from "./forecastText";

// The snapshot was written in UTC; pin the zone before anything formats a date so the
// file matches on any machine (`vi.hoisted` runs before the imports).
vi.hoisted(() => {
  process.env.TZ = "UTC";
});

const NOW = new Date(2026, 10, 15, 12);
const DAY = 24 * 60 * 60 * 1000;

function plainView(view: ForecastView) {
  const { forecast, bar, ...rest } = view;
  return {
    forecastId: forecast.id,
    ...rest,
    bar: bar
      ? {
          low: bar.low,
          high: bar.high,
          point: bar.point,
          min: bar.min,
          max: bar.max,
          label: bar.label,
          formatted: [bar.format(bar.low), bar.format(bar.point), bar.format(bar.high)],
        }
      : undefined,
  };
}

function words(forecast: Forecast, now: Date) {
  return {
    id: forecast.id,
    question: questionOf(forecast),
    due: dueOf(forecast, now),
    restsOn: restsOnOf(forecast),
    view: plainView(viewOf(forecast, now, 1)),
    inputs: inputLines(forecast),
  };
}

const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);

/** Hand-made rows: every kind, every basis, the input keys each branch reads. */
const HAND_MADE: Forecast[] = [
  forecastRow({ id: "reps-prior", basis: "prior", inputs: { sampleSize: 0 } }),
  forecastRow({
    id: "reps-trend",
    basis: "trend",
    prediction: { point: 5.4, low: 4, high: 7, pmf: [0, 0, 0, 0.1, 0.2, 0.3, 0.25, 0.15], unit: "reps" },
    inputs: {
      sampleSize: 6,
      cuttingShift: -0.02,
      readinessShift: -0.03,
      weight: 200,
      plannedWeight: 205,
      targetReps: 3,
      stage: "5x3",
      level: 230.44,
      scatter: 6.2,
      phase: "cutting",
      sdScale: 1.25,
      mystery: 7,
    },
  }),
  forecastRow({ id: "reps-one", exerciseId: "bench", prediction: { point: 1, unit: "reps" } }),
  forecastRow({ id: "reps-persist", basis: "persistence", inputs: { sampleSize: 1, readinessShift: 0.04 } }),
  forecastRow({
    id: "reps-regime",
    basis: "regime-change",
    inputs: { sampleSize: 3, regimeChange: "reset", regimeMultiplier: 1.5 },
  }),
  forecastRow({ id: "reps-regime-unknown", basis: "regime-change", inputs: { regimeChange: "odd" } }),
  forecastRow({
    id: "pass",
    kind: "liftPass",
    exerciseId: "deadlift",
    event: { type: "repsAtLeast", weight: 315, reps: 3 },
    prediction: { point: 0.82, probability: 0.82, unit: "chance" },
    inputs: { sampleSize: 4 },
  }),
  forecastRow({
    id: "best",
    kind: "newBest",
    exerciseId: "ohp",
    event: { type: "e1rmAbove", level: 140 },
    prediction: { point: 0.41, probability: 0.41, unit: "chance" },
    inputs: { sampleSize: 4, bestE1RM: 139.6, repsNeeded: 7 },
  }),
  forecastRow({
    id: "length-prior",
    kind: "sessionLength",
    exerciseId: undefined,
    basis: "prior",
    event: { type: "durationSeconds" },
    prediction: { point: 3120, low: 2700, high: 3900, unit: "s" },
    inputs: { plannedSeconds: 3000, sampleSize: 0 },
  }),
  forecastRow({
    id: "length-trend",
    kind: "sessionLength",
    exerciseId: undefined,
    event: { type: "durationSeconds" },
    prediction: { point: 3600, low: 3300, high: 4000, unit: "s" },
    inputs: { plannedSeconds: 3300, sampleSize: 8, correction: 1.087 },
  }),
  forecastRow({
    id: "e1rm-trend",
    kind: "e1rm4w",
    workoutId: undefined,
    dueAt: ahead(21),
    event: { type: "e1rmLevel", windowDays: 7 },
    prediction: { point: 271.26, low: 260, high: 283, unit: "lb" },
    inputs: { sampleSize: 9, ratePerWeek: 1.24, level: 266.1, phase: "bulking" },
  }),
  forecastRow({
    id: "e1rm-regime",
    kind: "e1rm4w",
    exerciseId: "bench",
    workoutId: undefined,
    basis: "regime-change",
    dueAt: ahead(1),
    event: { type: "e1rmLevel", windowDays: 7 },
    prediction: { point: 180, low: 160, high: 200, unit: "lb" },
    inputs: { sampleSize: 3, lastResultWeeksAgo: 6.4, ratePerWeek: 0.01 },
  }),
  forecastRow({
    id: "e1rm-old",
    kind: "e1rm4w",
    exerciseId: "leg_press",
    workoutId: undefined,
    basis: "regime-change",
    dueAt: ahead(-2),
    event: { type: "e1rmLevel", windowDays: 7 },
    prediction: { point: 400, low: 380, high: 420, unit: "lb" },
    inputs: {},
  }),
  forecastRow({
    id: "bw",
    kind: "bodyweight4w",
    exerciseId: undefined,
    workoutId: undefined,
    dueAt: ahead(10),
    event: { type: "bodyweightMean", windowDays: 3 },
    prediction: { point: 198.04, low: 196, high: 200, unit: "lb" },
    inputs: { sampleSize: 12, ratePerWeek: -0.9, level: 201.3, phase: "maintaining" },
  }),
  forecastRow({
    id: "bw-flat",
    kind: "bodyweight4w",
    exerciseId: undefined,
    workoutId: undefined,
    dueAt: ahead(40),
    event: { type: "bodyweightMean" },
    prediction: { point: 198, unit: "lb" },
    inputs: { sampleSize: 2, ratePerWeek: 0.02 },
  }),
  forecastRow({
    id: "stall-ahead",
    kind: "stallRisk",
    workoutId: undefined,
    dueAt: ahead(5),
    event: { type: "stall", windowDays: 4 },
    prediction: { point: 0.3, probability: 0.3, unit: "chance" },
    inputs: {
      sampleSize: 5,
      gapDays: 3.6,
      stage: "6x2",
      weight: 225,
      targetReps: 2,
      increment: 10,
      level: 250,
      daySd: 5,
      passFirst: 0.8,
      cuttingShift: 0.01,
    },
  }),
  forecastRow({
    id: "stall-past",
    kind: "stallRisk",
    exerciseId: "bench",
    workoutId: undefined,
    basis: "persistence",
    dueAt: ahead(-1),
    event: { type: "stall", windowDays: 4 },
    prediction: { point: 0.6, probability: 0.6, unit: "chance" },
    inputs: { sampleSize: 2 },
  }),
  forecastRow({
    id: "milestone",
    kind: "milestone",
    workoutId: undefined,
    dueAt: ahead(30),
    event: { type: "milestone", weight: 300 },
    prediction: { point: 20800, low: 20790, high: 20820, unit: "day" },
    inputs: { sampleSize: 6, gapDays: 3, target: 300, reachChance: 0.7, rangeChance: 0.65, weight: 275 },
  }),
  forecastRow({
    id: "milestone-unknown",
    kind: "milestone",
    exerciseId: undefined,
    workoutId: undefined,
    basis: "persistence",
    dueAt: ahead(30),
    event: { type: "milestone" },
    prediction: { point: 0.5, probability: 0.5, unit: "chance" },
    inputs: {},
  }),
];

const scored = (status: ForecastStatus, overrides: Partial<Forecast> = {}): ScoredForecast => ({
  forecast: forecastRow(overrides),
  status,
});

describe("forecast words snapshot", () => {
  it("names, numbers and dates", async () => {
    const out = {
      constants: { TOO_FEW_TO_JUDGE, TARGET_PERCENT, TARGET_IN_TEN, CATEGORY_LABELS, BASIS_LABELS, PERIOD_LABELS },
      lifts: ["squat", "bench", "deadlift", "ohp", "leg_press", "not-a-lift", undefined].map((id) => [
        liftLabel(id),
        liftShort(id),
      ]),
      amounts: [0, 0.04, 1, 178.43, 271, 1234.56, -3.25].map(formatAmount),
      minutes: [0, 59, 3120, 3600, 3900, 7260].map(formatMinutes),
      dates: [shortDate(NOW), dayDate(20800)],
      judged: [judgeShare(3, 4, "inside"), judgeShare(8, 10, "inside"), judgeShare(31, 38, "inside the range")],
    };
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./__snapshots__/forecastText.names.json");
  });

  it("hand-made forecasts, open and in the record", async () => {
    const rows = HAND_MADE.map((f) => words(f, NOW));
    const asOpen = HAND_MADE.map((f) => ({ forecast: f, status: { state: "open" } }) as ScoredForecast);
    const open = openForecasts(asOpen, NOW);
    const voids = voidLine([
      scored({ state: "void", reason: "weight-changed" }),
      scored({ state: "void", reason: "weight-changed" }),
      scored({ state: "void", reason: "ended-early" }),
      scored({ state: "void", reason: "something-new" } as unknown as ForecastStatus),
      scored({ state: "resolved", value: 1, inside: false }),
    ]);
    const out = {
      rows,
      open: {
        today: open.today.map(plainView),
        ahead: open.ahead.map(plainView),
        totalOpen: open.totalOpen,
      },
      voids,
    };
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./__snapshots__/forecastText.handMade.json");
  });

  it("the demo log replayed: every forecast and the track record in words", async () => {
    const replay = replayForecasts(demoReplayInput(NOW));
    const record = trackRecord(replay.scored);
    const out = {
      count: replay.scored.length,
      rows: replay.scored.map((s) => ({ state: s.status.state, ...words(s.forecast, NOW) })),
      open: (() => {
        const o = openForecasts(replay.scored, NOW);
        return { today: o.today.map(plainView), ahead: o.ahead.map(plainView), totalOpen: o.totalOpen };
      })(),
      periods: (["4w", "3m", "all"] as const).map((p) => inPeriod(replay.scored, p, NOW).length),
      voidLine: voidLine(replay.scored),
      kindRows: kindRows(replay.scored),
      wrongest: wrongest(replay.scored),
      widened: widenedKinds(replay.scored),
      chartBins: chartBins(record.overall),
    };
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./__snapshots__/forecastText.demo.json");
  });

  it("simulated lifters: the record's words with enough results to judge", async () => {
    const lifters = [
      { seed: 1, sessions: 80, noise: 0.03, weeklyGain: 0.01, headroomReps: 2 },
      { seed: 7, sessions: 60, noise: 0.08, weeklyGain: -0.005, headroomReps: 0 },
    ];
    const out = lifters.map((lifter) => {
      const input = simulateLifter(lifter);
      const replay = replayForecasts(input);
      return {
        count: replay.scored.length,
        voidLine: voidLine(replay.scored),
        kindRows: kindRows(replay.scored),
        wrongest: wrongest(replay.scored),
        widened: widenedKinds(replay.scored),
        chartBins: chartBins(trackRecord(replay.scored).overall),
        sample: replay.scored.slice(-12).map((s) => words(s.forecast, input.now)),
      };
    });
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./__snapshots__/forecastText.simulated.json");
  });
});
