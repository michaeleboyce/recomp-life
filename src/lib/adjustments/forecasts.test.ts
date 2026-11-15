// Forecast revisions (a horizon forecast moving by more than the range it gave) and
// self-corrections (the app widening a kind's ranges), read from the stored rows.
import { describe, expect, it } from "vitest";
import { isRuleId } from "@/lib/evidence";
import { CALIBRATION, FORECAST_KINDS } from "@/lib/forecast";
import { forecastRow } from "@/lib/forecast/testHelpers";
import type { Forecast } from "@/types";
import { forecastEntries } from "./forecasts";

const DAY = 24 * 60 * 60 * 1000;
const WEEK_41 = Date.UTC(2026, 9, 5, 17); // Monday of ISO week 41

const entriesOf = (forecasts: Forecast[]) => forecastEntries(forecasts).map((ranked) => ranked.entry);

/** A stored estimated-max forecast for a lift, made in the given ISO week. */
function e1rmRow(week: number, point: number, overrides: Partial<Forecast> = {}): Forecast {
  const exerciseId = overrides.exerciseId ?? "squat";
  const madeAt = new Date(WEEK_41 + (week - 41) * 7 * DAY);
  const id = `h-${exerciseId}-${week}`;
  return forecastRow({
    id,
    clientId: id,
    slot: `e1rm4w|${exerciseId}|2026-W${week}`,
    kind: "e1rm4w",
    workoutId: undefined,
    exerciseId,
    tier: undefined,
    madeAt,
    dueAt: new Date(madeAt.getTime() + 28 * DAY),
    event: { type: "e1rmLevel", windowDays: 7 },
    prediction: { point, low: point - 10, high: point + 10, unit: "lb" },
    inputs: { sdScale: 1, sampleSize: week - 36 },
    modelVersion: "e1rm-1",
    ...overrides,
  });
}

function bodyweightRow(week: number, point: number, halfWidth = 1.7): Forecast {
  const madeAt = new Date(WEEK_41 + (week - 41) * 7 * DAY);
  const id = `h-bodyweight-${week}`;
  return forecastRow({
    id,
    clientId: id,
    slot: `bodyweight4w|bodyweight|2026-W${week}`,
    kind: "bodyweight4w",
    workoutId: undefined,
    exerciseId: undefined,
    tier: undefined,
    madeAt,
    dueAt: new Date(madeAt.getTime() + 28 * DAY),
    event: { type: "bodyweightMean", windowDays: 3 },
    prediction: { point, low: point - halfWidth, high: point + halfWidth, unit: "lb" },
    inputs: { sdScale: 1, sampleSize: 25 },
    modelVersion: "bodyweight-1",
  });
}

/** A stored reps forecast for one workout, made with the given widening factor. */
function repsRow(n: number, sdScale: number, kind: Forecast["kind"] = "amrapReps"): Forecast {
  const id = `fc:w${n}:${kind}:squat:T1`;
  return forecastRow({
    id,
    clientId: id,
    slot: id,
    kind,
    workoutId: `w${n}`,
    madeAt: new Date(WEEK_41 + n * 2 * DAY),
    dueAt: new Date(WEEK_41 + n * 2 * DAY + 40 * 60_000),
    inputs: { sdScale },
  });
}

describe("forecastEntries: revisions", () => {
  it("says nothing while the forecast moves within the range it gave", () => {
    expect(entriesOf([e1rmRow(41, 250), e1rmRow(42, 258)])).toEqual([]);
  });

  it("reports a forecast that moved by more than the earlier range's half-width", () => {
    const earlier = e1rmRow(41, 250);
    const later = e1rmRow(42, 262);
    const entries = entriesOf([later, earlier]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: `forecastRevision:${later.id}`,
      at: later.madeAt,
      source: "forecastRevision",
      title: "Squat forecast raised 250 → 262",
      detail:
        "One new result moved your trend up. " +
        "That is more than the 10 either side the earlier forecast allowed.",
      change: { from: "250", to: "262" },
      ruleId: FORECAST_KINDS.e1rm4w.ruleId,
      href: "/progress/forecasts",
    });
    expect(isRuleId(entries[0].ruleId!)).toBe(true);
  });

  it("a move of exactly the half-width is not a revision", () => {
    expect(entriesOf([e1rmRow(41, 250), e1rmRow(42, 260)])).toEqual([]);
    expect(entriesOf([e1rmRow(41, 250), e1rmRow(42, 240)])).toEqual([]);
  });

  it("uses the earlier forecast's own range, however wide the new one is", () => {
    const earlier = e1rmRow(41, 250, {
      prediction: { point: 250, low: 245, high: 255, unit: "lb" },
    });
    const later = e1rmRow(42, 257, { prediction: { point: 257, low: 227, high: 287, unit: "lb" } });
    const entries = entriesOf([earlier, later]);
    expect(entries.map((entry) => entry.title)).toEqual(["Squat forecast raised 250 → 257"]);
    expect(entries[0].detail).toContain("the 5 either side");
  });

  it("compares each forecast with the one before it, not with the first", () => {
    const rows = [e1rmRow(41, 250), e1rmRow(42, 256), e1rmRow(43, 262), e1rmRow(44, 249)];
    const entries = entriesOf(rows);
    expect(entries.map((entry) => entry.title)).toEqual(["Squat forecast lowered 262 → 249"]);
    expect(entries[0].id).toBe(`forecastRevision:${rows[3].id}`);
  });

  it("says how many results came in between when the rows record it", () => {
    const earlier = e1rmRow(41, 250, { inputs: { sdScale: 1, sampleSize: 5 } });
    const three = e1rmRow(42, 270, { inputs: { sdScale: 1, sampleSize: 8 } });
    expect(entriesOf([earlier, three])[0].detail).toMatch(/^Three new results moved your trend up\./);

    const same = e1rmRow(42, 270, { inputs: { sdScale: 1, sampleSize: 5 } });
    expect(entriesOf([earlier, same])[0].detail).toMatch(/^Your recent results moved your trend up\./);
  });

  it("reports bodyweight with one decimal and its own rule", () => {
    const entries = entriesOf([bodyweightRow(41, 224.46), bodyweightRow(42, 221.93)]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: "Bodyweight forecast lowered 224.5 → 221.9",
      detail:
        "Your recent weigh-ins moved your trend down. " +
        "That is more than the 1.7 either side the earlier forecast allowed.",
      ruleId: FORECAST_KINDS.bodyweight4w.ruleId,
    });
    expect(isRuleId(entries[0].ruleId!)).toBe(true);
  });

  it("keeps subjects apart", () => {
    const rows = [
      e1rmRow(41, 250),
      e1rmRow(41, 180, { exerciseId: "bench" }),
      e1rmRow(42, 255),
      e1rmRow(42, 195, { exerciseId: "bench" }),
    ];
    expect(entriesOf(rows).map((entry) => entry.title)).toEqual([
      "Bench press forecast raised 180 → 195",
    ]);
  });

  it("reads only the earliest row of a slot, as the track record does", () => {
    const first = e1rmRow(41, 250);
    const second = e1rmRow(42, 255);
    // A second device wrote week 42 again later with a very different number.
    const duplicate = e1rmRow(42, 290, {
      id: "h-squat-42-other",
      clientId: "h-squat-42-other",
      madeAt: new Date(second.madeAt.getTime() + DAY),
    });
    expect(entriesOf([first, second, duplicate])).toEqual([]);
  });

  it("ignores a forecast with no range, a deleted row and forecasts for one workout", () => {
    const noRange = e1rmRow(41, 250, { prediction: { point: 250, unit: "lb" } });
    expect(entriesOf([noRange, e1rmRow(42, 300)])).toEqual([]);

    const deleted = { ...e1rmRow(42, 300), deletedAt: 5 };
    expect(entriesOf([e1rmRow(41, 250), deleted])).toEqual([]);

    const session = [repsRow(1, 1), { ...repsRow(2, 1), prediction: { point: 12, low: 11, high: 12, unit: "reps" } }];
    expect(entriesOf(session)).toEqual([]);
  });
});

describe("forecastEntries: self-corrections", () => {
  it("reports each time a kind's range was widened", () => {
    const rows = [repsRow(1, 1), repsRow(2, 1), repsRow(3, 1.15), repsRow(4, 1.15), repsRow(5, 1.3)];
    const entries = entriesOf(rows);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: `selfCorrection:${rows[2].id}`,
      at: rows[2].madeAt,
      source: "selfCorrection",
      title: "Range for reps on the last set widened 1× → 1.15×",
      detail:
        `At least ${CALIBRATION.minResolvedForCorrection} of these forecasts had been checked against ` +
        "what happened and fewer than 7 in 10 landed inside their range, so the app made the range wider. " +
        "A range is built to hold 8 in 10.",
      change: { from: "1×", to: "1.15×" },
      ruleId: "forecast-calibration",
      href: "/progress/forecasts/record",
    });
    expect(entries[1].title).toBe("Range for reps on the last set widened 1.15× → 1.3×");
    expect(entries[1].id).toBe(`selfCorrection:${rows[4].id}`);
    expect(isRuleId(entries[0].ruleId!)).toBe(true);
  });

  it("says nothing while the factor stays where it was", () => {
    expect(entriesOf([repsRow(1, 1), repsRow(2, 1), repsRow(3, 1)])).toEqual([]);
  });

  it("the chance kinds widen with the reps range and get no entry of their own", () => {
    const rows = [
      repsRow(1, 1),
      repsRow(1, 1, "liftPass"),
      repsRow(2, 1.15),
      repsRow(2, 1.15, "liftPass"),
      repsRow(2, 1.15, "newBest"),
    ];
    expect(entriesOf(rows).map((entry) => entry.id)).toEqual([`selfCorrection:${rows[2].id}`]);
  });

  it("names the kind that was widened", () => {
    const horizon = [
      e1rmRow(41, 250),
      e1rmRow(42, 251, { inputs: { sdScale: 1.15, sampleSize: 6 } }),
    ];
    expect(entriesOf(horizon).map((entry) => entry.title)).toEqual([
      "Range for estimated max in 4 weeks widened 1× → 1.15×",
    ]);
  });
});
