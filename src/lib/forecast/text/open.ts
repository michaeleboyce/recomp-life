// One open forecast in words, and the open forecasts grouped for the screen. Pure:
// every function reads a stored row and `now`, and never recomputes a forecast.
import type { RuleId } from "@/lib/evidence";
import type { ScoredForecast } from "@/lib/forecast";
import { DAY_MS } from "@/lib/dates";
import { percent, plural } from "@/lib/text";
import type { EvidenceStrength, Forecast, ForecastKind } from "@/types";
import {
  categoryOf,
  dayDate,
  formatAmount,
  formatIn,
  formatMinutes,
  isSessionForecast,
  liftLabel,
  liftShort,
  mostLikelyFromPmf,
  ms,
  num,
  REGIME_WORDS,
  ruleIdOf,
  shortDate,
  stageText,
  str,
  strengthOf,
  type ForecastCategory,
} from "./words";

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
  /**
   * Numbers for the range bar; absent for most chances. `min` and `max` fix the
   * track (0 to 1 for a chance), `label` replaces the generated text alternative.
   */
  bar?: {
    low: number;
    high: number;
    point: number;
    format: (v: number) => string;
    min?: number;
    max?: number;
    label?: string;
  };
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
    case "stallRisk":
      return `${liftLabel(forecast.exerciseId)} misses at ${stageText(str(forecast, "stage"))} in the next two sessions`;
    case "milestone": {
      const target = forecast.event.weight;
      return target !== undefined
        ? `${liftLabel(forecast.exerciseId)} reaches ${formatAmount(target)} lb`
        : `${liftLabel(forecast.exerciseId)} reaches its next round number`;
    }
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
  if (forecast.kind === "milestone") {
    const target = forecast.event.weight;
    return target !== undefined
      ? `Checked when the bar first has ${formatAmount(target)} lb on it`
      : "Checked when the bar first has that weight on it";
  }
  const due = ms(forecast.dueAt);
  const windowDays = forecast.event.windowDays ?? 0;
  const days = Math.ceil((due - now.getTime()) / DAY_MS);
  if (forecast.kind === "stallRisk") {
    return days > 0
      ? `Checked over the next two sessions, the second due about ${shortDate(due)}`
      : `Checked over the next two sessions; set aside if they are not done by ${shortDate(due + windowDays * DAY_MS)}`;
  }
  if (days > 0) return `Due ${shortDate(due)}, ${weeksText(days)}`;
  return `Measuring now; scored after ${shortDate(due + windowDays * DAY_MS)}`;
}

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
    case "stallRisk":
    case "milestone": {
      parts.push(
        forecast.basis === "trend"
          ? `Trend of ${plural(n, "last set")}`
          : `From ${plural(n, "last set")}, so wider`
      );
      const gap = num(forecast, "gapDays");
      if (gap !== null) parts.push(`a session every ${Math.round(gap)} days`);
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
  if (forecast.kind === "stallRisk" && p.probability !== undefined) {
    // How the chance builds: a miss at the next session, then within two.
    const passFirst = num(forecast, "passFirst");
    const first = passFirst === null ? null : Math.min(p.probability, Math.max(0, 1 - passFirst));
    return {
      ...base,
      value: percent(p.probability),
      range: "chance of a stall",
      ...(first !== null
        ? {
            bar: {
              low: first,
              high: p.probability,
              point: p.probability,
              format: percent,
              min: 0,
              max: 1,
              label: `Chance of a miss: ${percent(first)} at the next session, ${percent(p.probability)} within two`,
            },
          }
        : {}),
    };
  }
  if (p.probability !== undefined) {
    return {
      ...base,
      value: percent(p.probability),
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
  } else if (unit === "day") {
    value = dayDate(p.point);
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
  "stallRisk",
  "milestone",
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
