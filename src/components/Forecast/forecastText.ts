// Plain words for stored forecasts and their record. No React, no database: every
// function reads a stored row (or rows scored from the log) and `now`, and never
// recomputes a forecast. The screens in this folder render what these return.
import { getRule, type RuleId } from "@/lib/evidence";
import { getExercise } from "@/lib/exercises";
import {
  CALIBRATION,
  FORECAST_KINDS,
  RANGE_SOURCE_KIND,
  sdScaleOf,
  summarize,
  type ScoredForecast,
  type TrackRecord,
} from "@/lib/forecast";
import type { EvidenceStrength, Forecast, ForecastBasis, ForecastKind } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Below this many resolved results a share is not shown: the counts are. */
export const MIN_RESULTS_TO_JUDGE = 10;

/** The words shown in place of a share while there are too few results. */
export const TOO_FEW_TO_JUDGE = "not enough results to judge yet";

/** The share of results a range is built to hold, as a whole percentage. */
export const TARGET_PERCENT = Math.round(CALIBRATION.targetCoverage * 100);

/** The same share in words: "8 times in 10". */
export const TARGET_IN_TEN = `${Math.round(CALIBRATION.targetCoverage * 10)} times in 10`;

// ── Names ──────────────────────────────────────────────────────────────────

/** Lifts with a page of their own (`/progress/lift/<id>`, built at export time). */
export const LIFTS_WITH_PAGE: readonly string[] = ["squat", "bench", "deadlift", "ohp"];

const LIFT_LABELS: Record<string, string> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
  ohp: "Overhead press",
};

/** "Bench press"; another exercise's own name; the id when it is unknown. */
export function liftLabel(exerciseId: string | undefined): string {
  if (!exerciseId) return "Lift";
  if (LIFT_LABELS[exerciseId]) return LIFT_LABELS[exerciseId];
  try {
    return getExercise(exerciseId).name;
  } catch {
    return exerciseId;
  }
}

/** The lift's name inside a sentence: "bench press". */
export function liftShort(exerciseId: string | undefined): string {
  return liftLabel(exerciseId).toLowerCase();
}

// ── Kinds and filters ──────────────────────────────────────────────────────

export type ForecastCategory = "strength" | "body" | "session";

export const CATEGORY_LABELS: Record<ForecastCategory, string> = {
  strength: "Strength",
  body: "Body",
  session: "Workout",
};

export const CATEGORY_ORDER: readonly ForecastCategory[] = ["strength", "body", "session"];

const CATEGORY: Record<ForecastKind, ForecastCategory> = {
  amrapReps: "strength",
  newBest: "strength",
  liftPass: "strength",
  e1rm4w: "strength",
  bodyweight4w: "body",
  sessionLength: "session",
};

export function categoryOf(kind: ForecastKind): ForecastCategory {
  return CATEGORY[kind];
}

export function ruleIdOf(kind: ForecastKind): RuleId {
  return FORECAST_KINDS[kind].ruleId;
}

export function strengthOf(kind: ForecastKind): EvidenceStrength {
  return getRule(ruleIdOf(kind)).strength;
}

/** A session forecast belongs to one workout; the rest are for a date weeks ahead. */
export function isSessionForecast(forecast: Forecast): boolean {
  return FORECAST_KINDS[forecast.kind].scope === "session";
}

// ── Dates and numbers ──────────────────────────────────────────────────────

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const ms = (date: Date | string | number) => new Date(date).getTime();

export function shortDate(date: Date | string | number): string {
  return SHORT_DATE.format(new Date(date));
}

/** 178.43 -> "178.4"; 271 -> "271". */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** 0.643 -> "64%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Seconds -> "52 min" (or "1 h 5 min"). */
export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** An amount in a prediction's unit, without the unit for lbs (the label says it). */
function formatIn(unit: string, value: number): string {
  if (unit === "s") return formatMinutes(value);
  if (unit === "reps") return String(Math.round(value));
  if (unit === "chance") return formatPercent(value);
  return formatAmount(value);
}

/** The rep count with the highest single chance in a stored spread. */
export function mostLikelyFromPmf(pmf: readonly number[] | undefined): number | null {
  if (!pmf || pmf.length === 0) return null;
  let best = 0;
  for (let k = 1; k < pmf.length; k++) if (pmf[k] > pmf[best]) best = k;
  return best;
}

// ── One open forecast, in words ────────────────────────────────────────────

export interface ForecastView {
  id: string;
  forecast: Forecast;
  category: ForecastCategory;
  /** What is being predicted, plainly. */
  question: string;
  /** The forecast's own number: "5 reps", "64%", "271". */
  value: string;
  /** The unit after a bare number, when the value does not carry one ("lb"). */
  valueUnit?: string;
  /** "4 to 6", or for a chance what it is a chance of. */
  range?: string;
  /** Numbers for the range bar; absent for a chance. */
  bar?: { low: number; high: number; point: number; format: (v: number) => string };
  /** When it falls due. */
  due: string;
  /** One line on what it rests on. */
  restsOn: string;
  ruleId: RuleId;
  strength: EvidenceStrength;
  /** Other open forecasts of the same thing made earlier (one per week). */
  earlierOpen: number;
}

/** What is being predicted, in plain words. */
export function questionOf(forecast: Forecast): string {
  const lift = liftShort(forecast.exerciseId);
  switch (forecast.kind) {
    case "amrapReps":
      return `Reps on today's last ${lift} set`;
    case "liftPass":
      return `${liftLabel(forecast.exerciseId)} passes today`;
    case "newBest":
      return `A new ${lift} best today`;
    case "sessionLength":
      return "How long today's workout takes";
    case "e1rm4w":
      return `${liftLabel(forecast.exerciseId)} estimated max, ${shortDate(forecast.dueAt)}`;
    case "bodyweight4w":
      return `Bodyweight around ${shortDate(forecast.dueAt)}`;
  }
}

function weeksText(days: number): string {
  if (days <= 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  return `in ${Math.round(days / 7)} weeks`;
}

/** When the forecast is checked. */
export function dueOf(forecast: Forecast, now: Date): string {
  if (isSessionForecast(forecast)) {
    const weight = forecast.event.weight;
    if (forecast.kind === "sessionLength") return "Checked when this workout ends";
    return weight !== undefined
      ? `Checked on the last set at ${formatAmount(weight)} lb`
      : "Checked when this workout ends";
  }
  const due = ms(forecast.dueAt);
  const windowDays = forecast.event.windowDays ?? 0;
  const days = Math.ceil((due - now.getTime()) / DAY_MS);
  if (days > 0) return `Due ${shortDate(due)}, ${weeksText(days)}`;
  return `Measuring now; scored after ${shortDate(due + windowDays * DAY_MS)}`;
}

const num = (forecast: Forecast, key: string): number | null => {
  const v = forecast.inputs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const str = (forecast: Forecast, key: string): string | null => {
  const v = forecast.inputs?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const REGIME_WORDS: Record<string, string> = {
  "stage-change": "a stage change",
  reset: "a reset",
  break: "a break",
};

/** One line on how much history the forecast stood on, from its basis and inputs. */
export function restsOnOf(forecast: Forecast): string {
  const n = num(forecast, "sampleSize") ?? 0;
  const parts: string[] = [];
  switch (forecast.kind) {
    case "amrapReps":
    case "liftPass":
    case "newBest": {
      if (forecast.basis === "prior") parts.push("First session at this stage, a wide guess");
      else if (forecast.basis === "trend") parts.push(`Trend of ${plural(n, "last set")}`);
      else if (forecast.basis === "persistence") parts.push(`From ${plural(n, "last set")}, so wider`);
      else {
        const why = REGIME_WORDS[str(forecast, "regimeChange") ?? ""] ?? "a change";
        parts.push(`After ${why}, so wider`);
      }
      if ((num(forecast, "cuttingShift") ?? 0) !== 0) parts.push("the cut");
      const shift = num(forecast, "readinessShift") ?? 0;
      if (shift !== 0) parts.push(shift < 0 ? "readiness below usual" : "readiness above usual");
      break;
    }
    case "sessionLength":
      parts.push(
        forecast.basis === "prior"
          ? "From the plan alone, a wide guess"
          : `The plan, corrected by your pace over ${plural(n, "session")}`
      );
      break;
    case "e1rm4w": {
      const rate = num(forecast, "ratePerWeek");
      if (forecast.basis === "regime-change") {
        const ago = num(forecast, "lastResultWeeksAgo");
        parts.push(
          ago !== null
            ? `Last result ${Math.round(ago)} weeks ago, so wider`
            : "Old results, so wider"
        );
      } else {
        parts.push(`Trend of ${plural(n, "result")}`);
      }
      if (rate !== null) parts.push(`${rateWords(rate, "gaining", "losing")}`);
      break;
    }
    case "bodyweight4w": {
      const rate = num(forecast, "ratePerWeek");
      parts.push(`${plural(n, "weigh-in")}`);
      if (rate !== null) parts.push(rateWords(rate, "gaining", "losing"));
      break;
    }
  }
  return parts.join(" · ");
}

function rateWords(ratePerWeek: number, up: string, down: string): string {
  const size = Math.abs(ratePerWeek);
  if (size < 0.05) return "about flat";
  return `${ratePerWeek > 0 ? up : down} ${formatAmount(size)} lb a week`;
}

/** The view of one stored forecast. `earlierOpen` counts older open rows of the same thing. */
export function viewOf(forecast: Forecast, now: Date, earlierOpen = 0): ForecastView {
  const p = forecast.prediction;
  const base = {
    id: forecast.id,
    forecast,
    category: categoryOf(forecast.kind),
    question: questionOf(forecast),
    due: dueOf(forecast, now),
    restsOn: restsOnOf(forecast),
    ruleId: ruleIdOf(forecast.kind),
    strength: strengthOf(forecast.kind),
    earlierOpen,
  };
  if (p.probability !== undefined) {
    return {
      ...base,
      value: formatPercent(p.probability),
      range: forecast.kind === "liftPass" ? "chance of passing" : "chance",
    };
  }
  const unit = p.unit;
  const hasRange = p.low !== undefined && p.high !== undefined;
  const format = (v: number) => formatIn(unit, v);
  let value: string;
  let valueUnit: string | undefined;
  if (unit === "reps") {
    const likely = mostLikelyFromPmf(p.pmf) ?? Math.round(p.point);
    value = `${likely} ${likely === 1 ? "rep" : "reps"}`;
  } else if (unit === "s") {
    value = formatMinutes(p.point);
  } else {
    value = formatAmount(p.point);
    valueUnit = unit === "lb" ? "lb" : undefined;
  }
  return {
    ...base,
    value,
    valueUnit,
    ...(hasRange
      ? {
          range: `${format(p.low!)} to ${format(p.high!)}`,
          bar: { low: p.low!, high: p.high!, point: p.point, format },
        }
      : {}),
  };
}

/** The thing a forecast is about, so repeated weekly forecasts of it can be grouped. */
function subjectOf(forecast: Forecast): string {
  return `${forecast.kind}|${forecast.exerciseId ?? ""}|${forecast.workoutId ?? ""}`;
}

export interface OpenForecasts {
  /** Forecasts for the workout in progress. */
  today: ForecastView[];
  /** Forecasts for a date weeks ahead: the newest per subject. */
  ahead: ForecastView[];
  /** How many open rows there are in all, the earlier ones included. */
  totalOpen: number;
}

const KIND_ORDER: ForecastKind[] = [
  "amrapReps",
  "liftPass",
  "newBest",
  "sessionLength",
  "e1rm4w",
  "bodyweight4w",
];
const LIFT_ORDER = ["squat", "bench", "deadlift", "ohp"];
const liftRank = (id: string | undefined) => {
  const i = LIFT_ORDER.indexOf(id ?? "");
  return i === -1 ? LIFT_ORDER.length : i;
};

/**
 * The open forecasts, as stored, in two groups. A forecast for a date ahead is made
 * at most once a week, so several can be open for the same lift: the newest is shown
 * and the rest are counted on it.
 */
export function openForecasts(scored: readonly ScoredForecast[], now: Date): OpenForecasts {
  const open = scored.filter((s) => s.status.state === "open").map((s) => s.forecast);
  const groups = new Map<string, Forecast[]>();
  for (const f of open) {
    const key = subjectOf(f);
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  const views: ForecastView[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => ms(b.madeAt) - ms(a.madeAt));
    views.push(viewOf(sorted[0], now, sorted.length - 1));
  }
  const order = (a: ForecastView, b: ForecastView) =>
    liftRank(a.forecast.exerciseId) - liftRank(b.forecast.exerciseId) ||
    KIND_ORDER.indexOf(a.forecast.kind) - KIND_ORDER.indexOf(b.forecast.kind);
  const byKindFirst = (a: ForecastView, b: ForecastView) =>
    KIND_ORDER.indexOf(a.forecast.kind) - KIND_ORDER.indexOf(b.forecast.kind) ||
    ms(a.forecast.dueAt) - ms(b.forecast.dueAt) ||
    liftRank(a.forecast.exerciseId) - liftRank(b.forecast.exerciseId);
  return {
    today: views.filter((v) => isSessionForecast(v.forecast)).sort(order),
    ahead: views.filter((v) => !isSessionForecast(v.forecast)).sort(byKindFirst),
    totalOpen: open.length,
  };
}

// ── The stored inputs, in plain words ──────────────────────────────────────

export interface InputLine {
  label: string;
  value: string;
}

const PHASE_WORDS: Record<string, string> = {
  cutting: "Cutting",
  maintaining: "Maintaining",
  bulking: "Bulking",
};

/**
 * What the model saw when the forecast was made, as stored on the row. Keys the
 * screen does not know are left out rather than shown raw.
 */
export function inputLines(forecast: Forecast): InputLine[] {
  const lines: InputLine[] = [];
  const add = (label: string, value: string | null) => {
    if (value !== null) lines.push({ label, value });
  };
  const n = (key: string) => num(forecast, key);
  const lb = (key: string) => (n(key) === null ? null : `${formatAmount(n(key)!)} lb`);
  const repsModel = ["amrapReps", "liftPass", "newBest"].includes(forecast.kind);

  add("Made", `${shortDate(forecast.madeAt)}`);
  if (repsModel) {
    add("Weight on the bar", lb("weight"));
    if (n("plannedWeight") !== null && n("weight") !== null && n("plannedWeight") !== n("weight")) {
      add("Weight the program planned", lb("plannedWeight"));
    }
    add("Target reps", n("targetReps") === null ? null : String(n("targetReps")));
    add("Stage", str(forecast, "stage")?.replace("x", "×") ?? null);
    add("Past last sets used", n("sampleSize") === null ? null : String(n("sampleSize")));
    add("Strength level (weight × (1 + reps ÷ 30))", lb("level"));
    add("Day-to-day scatter of that level", lb("scatter"));
    const regime = str(forecast, "regimeChange");
    if (regime) add("Recent change", REGIME_WORDS[regime] ?? regime);
    if ((n("regimeMultiplier") ?? 1) !== 1) add("Scatter widened after the change", `× ${n("regimeMultiplier")}`);
    if ((n("cuttingShift") ?? 0) !== 0) add("Lowered for the cut", formatPercent(Math.abs(n("cuttingShift")!)));
    if (forecast.kind === "newBest") {
      add("Best estimated max to beat", lb("bestE1RM"));
      add("Reps needed for a new best", n("repsNeeded") === null ? null : String(n("repsNeeded")));
    }
  } else if (forecast.kind === "sessionLength") {
    add("Planned sets and rests", n("plannedSeconds") === null ? null : formatMinutes(n("plannedSeconds")!));
    add("Past sessions used", n("sampleSize") === null ? null : String(n("sampleSize")));
    const c = n("correction");
    if (c !== null && c !== 1) add("Your pace against the plan", `× ${Math.round(c * 100) / 100}`);
  } else {
    add(forecast.kind === "bodyweight4w" ? "Weigh-ins used" : "Results used", n("sampleSize") === null ? null : String(n("sampleSize")));
    add(forecast.kind === "bodyweight4w" ? "Bodyweight on the line today" : "Estimated max today", lb("level"));
    const rate = n("ratePerWeek");
    if (rate !== null) add("Change per week", `${rate > 0 ? "+" : rate < 0 ? "−" : ""}${formatAmount(Math.abs(rate))} lb`);
    if (n("lastResultWeeksAgo") !== null) add("Last result", `${Math.round(n("lastResultWeeksAgo")!)} weeks before`);
    if (forecast.event.windowDays !== undefined) {
      add("Measured over", `${forecast.event.windowDays} days either side of the date`);
    }
  }
  const phase = str(forecast, "phase");
  if (phase) add("Training phase", PHASE_WORDS[phase] ?? phase);
  const readiness = n("readinessShift");
  if (readiness !== null && readiness !== 0) {
    add("Readiness moved the level", `${readiness > 0 ? "+" : "−"}${formatAmount(Math.abs(readiness) * 100)}%`);
  }
  const scale = sdScaleOf(forecast);
  if (scale > 1) add("Range widened by the track record", `× ${formatAmount(scale)}`);
  add("How much history", BASIS_LABELS[forecast.basis]);
  return lines;
}

// ── The track record ───────────────────────────────────────────────────────

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
  return { enough: true, value: formatPercent(part / whole), counts };
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
          ? `Said ${formatPercent(r.chances.meanStated)} on average · passed ${r.chances.hits} of ${r.chances.n}`
          : `${r.chances.n} results`,
      value: r.chances.n < MIN_RESULTS_TO_JUDGE || r.chances.observed === null ? null : formatPercent(r.chances.observed),
      n: pass.length,
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

  const missGroup = (rows: ScoredForecast[], subject: string, fmt: (v: number) => string) => {
    if (rows.length < MIN_RESULTS_TO_JUDGE) return;
    const r = summarize(rows);
    if (r.miss.n < MIN_RESULTS_TO_JUDGE || r.miss.bias === null || !r.miss.meanAbs) return;
    anyEnough = true;
    const lean = r.miss.bias / r.miss.meanAbs;
    const direction = r.miss.bias < 0 ? "below" : "above";
    const verdict = r.miss.bias < 0 ? "too optimistic" : "too cautious";
    candidates.push({
      lean,
      subject,
      text: `${subject}: ${verdict}. Results came in ${fmt(Math.abs(r.miss.bias))} ${direction} the forecast on average, over ${plural(r.miss.n, "result")}.`,
    });
  };
  const chanceGroup = (rows: ScoredForecast[], subject: string) => {
    if (rows.length < MIN_RESULTS_TO_JUDGE) return;
    const r = summarize(rows);
    if (r.chances.n < MIN_RESULTS_TO_JUDGE || r.chances.meanStated === null || r.chances.observed === null) return;
    anyEnough = true;
    const gap = r.chances.observed - r.chances.meanStated;
    const verdict = gap < 0 ? "too optimistic" : "too cautious";
    candidates.push({
      lean: gap / 0.5,
      subject,
      text: `${subject}: ${verdict}. It said ${formatPercent(r.chances.meanStated)} on average and ${formatPercent(r.chances.observed)} happened, over ${plural(r.chances.n, "result")}.`,
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
  missGroup(resolved(scored, "bodyweight4w"), "Bodyweight", (v) => `${formatAmount(v)} lb`);
  missGroup(resolved(scored, "sessionLength"), "Session length", formatMinutes);
  chanceGroup(resolved(scored, "newBest"), "New-best chances");
  chanceGroup(resolved(scored, "liftPass"), "Pass chances");

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
