// Shared words for stored forecasts: lift names, kinds and categories, dates and
// numbers, and the readers of a row's stored inputs. Pure: no React, no database.
import { getRule, type RuleId } from "@/lib/evidence";
import { CALIBRATION, FORECAST_KINDS } from "@/lib/forecast";
import { DAY_MS } from "@/lib/dates";
import { MAIN_LIFTS } from "@/lib/liftNames";
import { percent } from "@/lib/text";
import type { EvidenceStrength, Forecast, ForecastKind } from "@/types";

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
export const LIFTS_WITH_PAGE: readonly string[] = MAIN_LIFTS;

// "Bench press" / "bench press": the forecast screens' lift names, from lib/liftNames.
export { forecastLiftLabel as liftLabel, forecastLiftShort as liftShort } from "@/lib/liftNames";

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
  stallRisk: "strength",
  milestone: "strength",
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

/** A date, a stamp or an ISO string as epoch milliseconds. */
export const ms = (date: Date | string | number) => new Date(date).getTime();

export function shortDate(date: Date | string | number): string {
  return SHORT_DATE.format(new Date(date));
}

/** 178.43 -> "178.4"; 271 -> "271". */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** Seconds -> "52 min" (or "1 h 5 min"). */
export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A date stored as days since 1 January 1970 (UTC), the unit "day": "Dec 3". */
export function dayDate(days: number): string {
  return shortDate(days * DAY_MS);
}

/** An amount in a prediction's unit, without the unit for lbs (the label says it). */
export function formatIn(unit: string, value: number): string {
  if (unit === "s") return formatMinutes(value);
  if (unit === "reps") return String(Math.round(value));
  if (unit === "chance") return percent(value);
  if (unit === "day") return dayDate(value);
  return formatAmount(value);
}

/** "5x3" -> "5×3". */
export function stageText(stage: string | null): string {
  return stage ? stage.replace("x", "×") : "this stage";
}

/** The rep count with the highest single chance in a stored spread. */
export function mostLikelyFromPmf(pmf: readonly number[] | undefined): number | null {
  if (!pmf || pmf.length === 0) return null;
  let best = 0;
  for (let k = 1; k < pmf.length; k++) if (pmf[k] > pmf[best]) best = k;
  return best;
}

// ── Stored inputs ──────────────────────────────────────────────────────────

/** A numeric stored input, or null when it is missing or not a finite number. */
export const num = (forecast: Forecast, key: string): number | null => {
  const v = forecast.inputs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
/** A text stored input, or null when it is missing or empty. */
export const str = (forecast: Forecast, key: string): string | null => {
  const v = forecast.inputs?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
};

/** What a stored `regimeChange` input names. */
export const REGIME_WORDS: Record<string, string> = {
  "stage-change": "a stage change",
  reset: "a reset",
  break: "a break",
};
