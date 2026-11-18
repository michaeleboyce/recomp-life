// The track record in words: periods, shares withheld below a minimum, void reasons,
// one row per kind, and the group that has leaned furthest one way. Pure.
import {
  FORECAST_KINDS,
  RANGE_SOURCE_KIND,
  sdScaleOf,
  summarize,
  type ScoredForecast,
  type TrackRecord,
} from "@/lib/forecast";
import { DAY_MS } from "@/lib/dates";
import { percent, plural } from "@/lib/text";
import type { ForecastBasis, ForecastKind } from "@/types";
import { formatAmount, formatMinutes, liftLabel, MIN_RESULTS_TO_JUDGE, mostLikelyFromPmf, ms } from "./words";

export const BASIS_LABELS: Record<ForecastBasis, string> = {
  prior: "No history yet, a wide guess",
  persistence: "A few past results",
  trend: "A trend of recent results",
  "regime-change": "After a change or a break",
};

export const BASIS_ORDER: readonly ForecastBasis[] = ["prior", "persistence", "trend", "regime-change"];

export type Period = "4w" | "3m" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  "4w": "4 weeks",
  "3m": "3 months",
  all: "All",
};

const PERIOD_DAYS: Record<Period, number | null> = { "4w": 28, "3m": 91, all: null };

/** The forecasts that fell due within the period (all of them for "all"). */
export function inPeriod(
  scored: readonly ScoredForecast[],
  period: Period,
  now: Date
): ScoredForecast[] {
  const days = PERIOD_DAYS[period];
  if (days === null) return [...scored];
  const from = now.getTime() - days * DAY_MS;
  return scored.filter((s) => ms(s.forecast.dueAt) >= from);
}

/** A share, or the counts with "not enough results to judge yet" when there are too few. */
export interface Judged {
  enough: boolean;
  /** "82%" when there is enough to judge. */
  value: string | null;
  /** "31 of 38 inside the range" */
  counts: string;
}

export function judgeShare(part: number, whole: number, what: string): Judged {
  const counts = `${part} of ${whole} ${what}`;
  if (whole < MIN_RESULTS_TO_JUDGE) return { enough: false, value: null, counts };
  return { enough: true, value: percent(part / whole), counts };
}

const VOID_WORDS: Record<string, string> = {
  "weight-changed": "the weight changed",
  "ended-early": "the workout ended early",
  "not-reached": "the lift was not reached",
  freeze: "a set was skipped or lightened",
  "load-drop": "the weight was dropped mid-lift",
  "workout-deleted": "the workout was discarded",
  "workout-missing": "the workout is gone",
  "no-duration": "no length was recorded",
  "too-few-measurements": "too few measurements",
  "not-scorable": "nothing to measure",
};

/** One line on the void forecasts, or null when there are none. */
export function voidLine(scored: readonly ScoredForecast[]): string | null {
  const counts = new Map<string, number>();
  for (const { status } of scored) {
    if (status.state !== "void") continue;
    counts.set(status.reason, (counts.get(status.reason) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const reasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${VOID_WORDS[reason] ?? reason} (${n})`);
  return `${plural(total, "forecast")} set aside, never counted as a miss: ${reasons.join(", ")}.`;
}

/** The record's calibration bins in the chart's terms, empty bands left out. */
export function chartBins(record: TrackRecord) {
  return record.chances.bins
    .filter((b) => b.n > 0 && b.meanStated !== null && b.observed !== null)
    .map((b) => ({
      stated: b.meanStated!,
      hits: Math.round(b.observed! * b.n),
      count: b.n,
    }));
}

const resolved = (scored: readonly ScoredForecast[], kind: ForecastKind) =>
  scored.filter((s) => s.forecast.kind === kind && s.status.state === "resolved");

export interface KindRow {
  id: string;
  title: string;
  /** What the number means. */
  subtitle: string;
  /** The number, or null when there is too little to judge. */
  value: string | null;
  /** How many results it stands on. */
  n: number;
}

/**
 * One row per kind with results: new-best calls, reps within one of the most likely
 * number, pass calls, and the average miss of the amounts.
 */
export function kindRows(scored: readonly ScoredForecast[]): KindRow[] {
  const rows: KindRow[] = [];

  const best = resolved(scored, "newBest");
  if (best.length > 0) {
    const likely = best.filter((s) => (s.forecast.prediction.probability ?? 0) >= 0.5);
    const happened = likely.filter((s) => s.status.state === "resolved" && s.status.hit).length;
    const all = best.filter((s) => s.status.state === "resolved" && s.status.hit).length;
    rows.push({
      id: "newBest",
      title: "New-best calls",
      subtitle:
        likely.length > 0
          ? `Said likely ${plural(likely.length, "time")}, happened ${happened}`
          : `Never said likely; ${all} of ${best.length} happened`,
      value: best.length < MIN_RESULTS_TO_JUDGE ? null : likely.length > 0 ? `${happened} of ${likely.length}` : `${all} of ${best.length}`,
      n: best.length,
    });
  }

  const reps = resolved(scored, "amrapReps");
  if (reps.length > 0) {
    const close = reps.filter((s) => {
      if (s.status.state !== "resolved") return false;
      const likely = mostLikelyFromPmf(s.forecast.prediction.pmf) ?? s.forecast.prediction.point;
      return Math.abs(s.status.value - likely) <= 1;
    }).length;
    const judged = judgeShare(close, reps.length, "within one");
    rows.push({
      id: "amrapReps",
      title: "Reps on the last set",
      subtitle: `Within one rep of the most likely number · ${judged.counts}`,
      value: judged.value,
      n: reps.length,
    });
  }

  const pass = resolved(scored, "liftPass");
  if (pass.length > 0) {
    const r = summarize(pass);
    rows.push({
      id: "liftPass",
      title: "Pass calls",
      subtitle:
        r.chances.meanStated !== null
          ? `Said ${percent(r.chances.meanStated)} on average · passed ${r.chances.hits} of ${r.chances.n}`
          : `${r.chances.n} results`,
      value: r.chances.n < MIN_RESULTS_TO_JUDGE || r.chances.observed === null ? null : percent(r.chances.observed),
      n: pass.length,
    });
  }

  const stalls = resolved(scored, "stallRisk");
  if (stalls.length > 0) {
    const r = summarize(stalls);
    rows.push({
      id: "stallRisk",
      title: "Stall calls",
      subtitle:
        r.chances.meanStated !== null
          ? `Said ${percent(r.chances.meanStated)} on average · stalled ${r.chances.hits} of ${r.chances.n}`
          : `${r.chances.n} results`,
      value: r.chances.n < MIN_RESULTS_TO_JUDGE || r.chances.observed === null ? null : percent(r.chances.observed),
      n: stalls.length,
    });
  }

  const milestones = resolved(scored, "milestone");
  if (milestones.length > 0) {
    const r = summarize(milestones);
    const judged = judgeShare(r.ranges.inside, r.ranges.n, "inside the range");
    rows.push({
      id: "milestone",
      title: "Round-number dates",
      subtitle: `Reached within the range of dates · ${judged.counts}`,
      value: judged.value,
      n: milestones.length,
    });
  }

  const amounts: { kind: ForecastKind; title: string; format: (v: number) => string }[] = [
    { kind: "bodyweight4w", title: "Bodyweight, 4 weeks ahead", format: (v) => `${formatAmount(v)} lb` },
    { kind: "e1rm4w", title: "Estimated max, 4 weeks ahead", format: (v) => `${formatAmount(v)} lb` },
    { kind: "sessionLength", title: "Session length", format: formatMinutes },
  ];
  for (const { kind, title, format } of amounts) {
    const rows_ = resolved(scored, kind);
    if (rows_.length === 0) continue;
    const r = summarize(rows_);
    rows.push({
      id: kind,
      title,
      subtitle: `Average miss · ${plural(r.miss.n, "result")}`,
      value: r.miss.n < MIN_RESULTS_TO_JUDGE || r.miss.meanAbs === null ? null : format(r.miss.meanAbs),
      n: rows_.length,
    });
  }
  return rows;
}

export interface WrongestFinding {
  /** "Bench press reps" */
  subject: string;
  /** One or two plain sentences. */
  text: string;
}

/**
 * The group of forecasts that has leaned furthest one way, once it has enough results:
 * the reps forecasts of each lift, each lift's estimated max, bodyweight, session
 * length, and the stated chances of a new best and of a pass. `null` while no group
 * has enough results; "none" when none leans far enough one way to name.
 */
export function wrongest(scored: readonly ScoredForecast[]): WrongestFinding | null | "none" {
  type Candidate = { lean: number; subject: string; text: string };
  const candidates: Candidate[] = [];
  let anyEnough = false;

  const missGroup = (
    rows: ScoredForecast[],
    subject: string,
    fmt: (v: number) => string,
    higherIsBetter = true
  ) => {
    if (rows.length < MIN_RESULTS_TO_JUDGE) return;
    const r = summarize(rows);
    if (r.miss.n < MIN_RESULTS_TO_JUDGE || r.miss.bias === null || !r.miss.meanAbs) return;
    anyEnough = true;
    const lean = r.miss.bias / r.miss.meanAbs;
    const direction = r.miss.bias < 0 ? "below" : "above";
    // For reps and an estimated max, a forecast above the result was too hopeful; for
    // session length and bodyweight "high" or "low" says it without a judgement.
    const verdict = higherIsBetter
      ? r.miss.bias < 0
        ? "too optimistic"
        : "too cautious"
      : r.miss.bias < 0
        ? "forecasts ran high"
        : "forecasts ran low";
    candidates.push({
      lean,
      subject,
      text: `${subject}: ${verdict}. Results came in ${fmt(Math.abs(r.miss.bias))} ${direction} the forecast on average, over ${plural(r.miss.n, "result")}.`,
    });
  };
  /** `goodEvent`: whether the event is one the lifter hopes for (a pass), not one to avoid (a stall). */
  const chanceGroup = (rows: ScoredForecast[], subject: string, goodEvent = true) => {
    if (rows.length < MIN_RESULTS_TO_JUDGE) return;
    const r = summarize(rows);
    if (r.chances.n < MIN_RESULTS_TO_JUDGE || r.chances.meanStated === null || r.chances.observed === null) return;
    anyEnough = true;
    const gap = r.chances.observed - r.chances.meanStated;
    const verdict = gap < 0 === goodEvent ? "too optimistic" : "too cautious";
    candidates.push({
      lean: gap / 0.5,
      subject,
      text: `${subject}: ${verdict}. It said ${percent(r.chances.meanStated)} on average and ${percent(r.chances.observed)} happened, over ${plural(r.chances.n, "result")}.`,
    });
  };

  const byLift = (kind: ForecastKind) => {
    const map = new Map<string, ScoredForecast[]>();
    for (const s of resolved(scored, kind)) {
      const id = s.forecast.exerciseId ?? "";
      map.set(id, [...(map.get(id) ?? []), s]);
    }
    return map;
  };
  for (const [id, rows] of byLift("amrapReps")) {
    missGroup(rows, `${liftLabel(id)} reps`, (v) => `${formatAmount(v)} ${v === 1 ? "rep" : "reps"}`);
  }
  for (const [id, rows] of byLift("e1rm4w")) {
    missGroup(rows, `${liftLabel(id)} estimated max`, (v) => `${formatAmount(v)} lb`);
  }
  missGroup(resolved(scored, "bodyweight4w"), "Bodyweight", (v) => `${formatAmount(v)} lb`, false);
  missGroup(resolved(scored, "sessionLength"), "Session length", formatMinutes, false);
  chanceGroup(resolved(scored, "newBest"), "New-best chances");
  chanceGroup(resolved(scored, "liftPass"), "Pass chances");
  chanceGroup(resolved(scored, "stallRisk"), "Stall chances", false);

  if (!anyEnough) return null;
  const top = candidates.sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean))[0];
  if (!top || Math.abs(top.lean) < 0.4) return "none";
  return { subject: top.subject, text: top.text };
}

/** Kinds whose ranges the record has widened, with the factor now in force. */
export function widenedKinds(scored: readonly ScoredForecast[]): { kind: ForecastKind; label: string; scale: number }[] {
  const largest = new Map<ForecastKind, number>();
  for (const { forecast } of scored) {
    if (RANGE_SOURCE_KIND[forecast.kind] !== forecast.kind) continue;
    largest.set(forecast.kind, Math.max(largest.get(forecast.kind) ?? 1, sdScaleOf(forecast)));
  }
  return [...largest.entries()]
    .filter(([, scale]) => scale > 1)
    .map(([kind, scale]) => ({ kind, label: FORECAST_KINDS[kind].label, scale }));
}
