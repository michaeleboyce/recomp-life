import { describe, expect, it } from "vitest";
import { replayForecasts, type ScoredForecast } from "@/lib/forecast";
import { demoReplayInput, forecastRow } from "@/lib/forecast/testHelpers";
import type { ForecastStatus } from "@/types";
import {
  formatMinutes,
  inPeriod,
  inputLines,
  judgeShare,
  kindRows,
  MIN_RESULTS_TO_JUDGE,
  mostLikelyFromPmf,
  openForecasts,
  questionOf,
  restsOnOf,
  viewOf,
  voidLine,
  wrongest,
} from "./forecastText";

const NOW = new Date("2026-11-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const scored = (status: ForecastStatus, overrides = {}): ScoredForecast => ({
  forecast: forecastRow(overrides),
  status,
});

describe("one forecast in words", () => {
  it("shows the most likely rep count from the stored spread and the stored range", () => {
    const view = viewOf(
      forecastRow({ prediction: { point: 5.4, low: 4, high: 7, pmf: [0, 0, 0, 0.1, 0.2, 0.3, 0.25, 0.15], unit: "reps" } }),
      NOW
    );
    expect(view.question).toBe("Reps on today's last squat set");
    expect(view.value).toBe("5 reps");
    expect(view.range).toBe("4 to 7");
    expect(view.bar).toMatchObject({ low: 4, high: 7, point: 5.4 });
    expect(view.strength).toBe("limited");
  });

  it("shows a chance as a percentage with no bar", () => {
    const view = viewOf(
      forecastRow({ kind: "newBest", prediction: { point: 0.41, probability: 0.41, unit: "chance" } }),
      NOW
    );
    expect(view.value).toBe("41%");
    expect(view.bar).toBeUndefined();
    expect(questionOf(view.forecast)).toBe("A new squat best today");
  });

  it("says a forecast with no history is a wide guess", () => {
    expect(restsOnOf(forecastRow({ basis: "prior", inputs: { sampleSize: 0 } }))).toBe(
      "First session at this stage, a wide guess"
    );
    expect(restsOnOf(forecastRow({ basis: "trend", inputs: { sampleSize: 6, cuttingShift: -0.02 } }))).toBe(
      "Trend of 6 last sets · the cut"
    );
    expect(
      restsOnOf(forecastRow({ kind: "bodyweight4w", basis: "trend", inputs: { sampleSize: 12, ratePerWeek: -0.9 } }))
    ).toBe("12 weigh-ins · losing 0.9 lb a week");
  });

  it("dates a forecast weeks ahead and a session forecast by its last set", () => {
    const ahead = forecastRow({
      kind: "e1rm4w",
      workoutId: undefined,
      dueAt: new Date(NOW.getTime() + 21 * DAY),
      event: { type: "e1rmLevel", windowDays: 7 },
      prediction: { point: 271, low: 260, high: 283, unit: "lb" },
    });
    const view = viewOf(ahead, NOW);
    expect(view.due).toBe("Due Dec 6, in 3 weeks");
    expect(view.value).toBe("271");
    expect(view.valueUnit).toBe("lb");
    expect(viewOf(forecastRow(), NOW).due).toBe("Checked on the last set at 200 lb");
  });

  it("lists the stored inputs in plain words and leaves unknown keys out", () => {
    const lines = inputLines(
      forecastRow({ inputs: { weight: 200, targetReps: 3, sampleSize: 6, level: 230.4, mystery: 7, phase: "cutting" } })
    );
    const labels = lines.map((l) => l.label);
    expect(labels).toContain("Weight on the bar");
    expect(labels).toContain("Training phase");
    expect(lines.find((l) => l.label === "Target reps")?.value).toBe("3");
    expect(lines.some((l) => l.value === "7")).toBe(false);
  });

  it("formats durations and picks the mode of a spread", () => {
    expect(formatMinutes(3120)).toBe("52 min");
    expect(formatMinutes(3900)).toBe("1 h 5 min");
    expect(mostLikelyFromPmf([0.1, 0.5, 0.4])).toBe(1);
    expect(mostLikelyFromPmf(undefined)).toBeNull();
  });
});

describe("open forecasts", () => {
  it("groups today's above the weeks ahead and shows the newest weekly forecast of a lift", () => {
    const week = (i: number) =>
      scored({ state: "open" }, {
        id: `h${i}`,
        kind: "e1rm4w",
        workoutId: undefined,
        madeAt: new Date(NOW.getTime() - i * 7 * DAY),
        dueAt: new Date(NOW.getTime() + (28 - i * 7) * DAY),
        prediction: { point: 270 - i, low: 260, high: 280, unit: "lb" },
      });
    const result = openForecasts(
      [week(0), week(1), week(2), scored({ state: "open" }), scored({ state: "resolved", value: 5, inside: true }, { id: "done" })],
      NOW
    );
    expect(result.today.map((v) => v.id)).toEqual(["fc:w1:amrapReps:squat:T1"]);
    expect(result.ahead.map((v) => v.id)).toEqual(["h0"]);
    expect(result.ahead[0].earlierOpen).toBe(2);
    expect(result.totalOpen).toBe(4);
  });
});

describe("the track record in words", () => {
  it("withholds a share below the minimum and shows the counts", () => {
    expect(judgeShare(3, 4, "inside")).toEqual({ enough: false, value: null, counts: "3 of 4 inside" });
    expect(judgeShare(8, MIN_RESULTS_TO_JUDGE, "inside").value).toBe("80%");
  });

  it("counts void forecasts by reason and never as misses", () => {
    const line = voidLine([
      scored({ state: "void", reason: "weight-changed" }),
      scored({ state: "void", reason: "weight-changed" }),
      scored({ state: "void", reason: "ended-early" }),
      scored({ state: "resolved", value: 1, inside: false }),
    ]);
    expect(line).toBe(
      "3 forecasts set aside, never counted as a miss: the weight changed (2), the workout ended early (1)."
    );
    expect(voidLine([scored({ state: "open" })])).toBeNull();
  });

  it("keeps only forecasts that came due in the period", () => {
    const old = scored({ state: "resolved", value: 5 }, { dueAt: new Date(NOW.getTime() - 60 * DAY) });
    const recent = scored({ state: "resolved", value: 5 }, { dueAt: new Date(NOW.getTime() - 3 * DAY) });
    expect(inPeriod([old, recent], "4w", NOW)).toEqual([recent]);
    expect(inPeriod([old, recent], "3m", NOW)).toHaveLength(2);
    expect(inPeriod([old, recent], "all", NOW)).toHaveLength(2);
  });

  it("names nothing until a group has enough results, then the one leaning furthest", () => {
    const few = Array.from({ length: 4 }, (_, i) =>
      scored({ state: "resolved", value: 3, inside: false }, { id: `a${i}` })
    );
    expect(wrongest(few)).toBeNull();
    const bench = Array.from({ length: 12 }, (_, i) =>
      scored({ state: "resolved", value: 3, inside: false }, { id: `b${i}`, exerciseId: "bench" })
    );
    const finding = wrongest(bench);
    expect(finding).not.toBeNull();
    expect(finding).not.toBe("none");
    expect((finding as { text: string }).text).toMatch(/^Bench press reps: too optimistic/);
  });

  it("builds kind rows from the demo history and judges only with enough results", () => {
    const replay = replayForecasts(demoReplayInput(NOW));
    const rows = kindRows(replay.scored);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("amrapReps");
    expect(ids).toContain("sessionLength");
    for (const row of rows) {
      if (row.n < MIN_RESULTS_TO_JUDGE) expect(row.value).toBeNull();
    }
  });
});

describe("the second set of forecasts in words", () => {
  const stallRow = forecastRow({
    id: "h-stall",
    slot: "stallRisk|squat|2026-W46",
    kind: "stallRisk",
    workoutId: undefined,
    madeAt: new Date(NOW.getTime() - DAY),
    dueAt: new Date(NOW.getTime() + 12 * DAY),
    event: { type: "missAtStage", weight: 250, reps: 3, windowDays: 14, minResults: 2 },
    prediction: { point: 0.42, probability: 0.42, unit: "chance" },
    inputs: { sampleSize: 6, stage: "5x3", passFirst: 0.8, gapDays: 9.2, weight: 250, increment: 10, sdScale: 1 },
    basis: "persistence",
    modelVersion: "stall-1",
  });
  const day = (offsetDays: number) => (NOW.getTime() + offsetDays * DAY) / DAY;
  const milestoneRow = forecastRow({
    id: "h-mile",
    slot: "milestone|bench|2026-W46",
    kind: "milestone",
    exerciseId: "bench",
    workoutId: undefined,
    madeAt: new Date(NOW.getTime() - DAY),
    dueAt: new Date(NOW.getTime() + 30 * DAY),
    event: { type: "weightReached", weight: 200 },
    prediction: { point: day(18), low: day(9), high: day(30), unit: "day" },
    inputs: { sampleSize: 3, gapDays: 9, target: 200, reachChance: 0.97, rangeChance: 0.84, sdScale: 1 },
    modelVersion: "milestone-1",
  });

  it("says what a stall forecast is about, how the chance builds and when it is checked", () => {
    const view = viewOf(stallRow, NOW);
    expect(view.question).toBe("Squat misses at 5×3 in the next two sessions");
    expect(view.value).toBe("42%");
    expect(view.range).toBe("chance of a stall");
    expect(view.bar).toMatchObject({ high: 0.42, point: 0.42, min: 0, max: 1 });
    expect(view.bar!.low).toBeCloseTo(0.2, 12);
    expect(view.bar!.label).toBe("Chance of a miss: 20% at the next session, 42% within two");
    expect(view.due).toMatch(/^Checked over the next two sessions, the second due about /);
    expect(view.restsOn).toBe("From 6 last sets, so wider · a session every 9 days");
    expect(view.strength).toBe("heuristic");
    expect(view.category).toBe("strength");
    expect(inputLines(stallRow).map((line) => line.label)).toContain("Chance the next session passes");
  });

  it("dates a round number with a range of dates", () => {
    const view = viewOf(milestoneRow, NOW);
    expect(view.question).toBe("Bench press reaches 200 lb");
    expect(view.value).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(view.range).toMatch(/^[A-Z][a-z]{2} \d{1,2} to [A-Z][a-z]{2} \d{1,2}$/);
    expect(view.bar!.format(day(18))).toBe(view.value);
    expect(view.due).toBe("Checked when the bar first has 200 lb on it");
    expect(inputLines(milestoneRow)).toContainEqual({ label: "Round number", value: "200 lb" });
    // Weeks ahead: the stall chance, then the date, then the estimated max.
    const estimate = forecastRow({
      id: "e",
      slot: "e1rm4w|squat|w",
      kind: "e1rm4w",
      workoutId: undefined,
      dueAt: new Date(NOW.getTime() + 20 * DAY),
      prediction: { point: 300, low: 290, high: 310, unit: "lb" },
    });
    const open = openForecasts(
      [estimate, milestoneRow, stallRow].map((forecast) => ({ forecast, status: { state: "open" } })),
      NOW
    );
    expect(open.ahead.map((v) => v.forecast.kind)).toEqual(["stallRisk", "milestone", "e1rm4w"]);
  });

  it("keeps a record of each, and calls a stall chance that ran high too cautious", () => {
    const stalls: ScoredForecast[] = Array.from({ length: 12 }, (_, i) => ({
      forecast: { ...stallRow, id: `s${i}`, slot: `stallRisk|squat|${i}` },
      status: { state: "resolved", value: 0, hit: i < 1 },
    }));
    const dates: ScoredForecast[] = Array.from({ length: 10 }, (_, i) => ({
      forecast: { ...milestoneRow, id: `m${i}`, slot: `milestone|bench|${i}` },
      status: { state: "resolved", value: day(20), inside: i < 8 },
    }));
    const rows = kindRows([...stalls, ...dates]);
    expect(rows.find((row) => row.id === "stallRisk")).toMatchObject({ title: "Stall calls", value: "8%", n: 12 });
    expect(rows.find((row) => row.id === "milestone")).toMatchObject({
      title: "Round-number dates",
      value: "80%",
      n: 10,
    });
    const finding = wrongest(stalls);
    expect(finding).not.toBeNull();
    expect(finding !== "none" && finding!.text).toMatch(/^Stall chances: too cautious\./);
  });
});
