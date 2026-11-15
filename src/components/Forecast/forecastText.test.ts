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
