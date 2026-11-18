// What the workout screens say about the forecasts stored when the workout started.
// Pure: no React, no database. Everything here reads stored rows only; nothing is
// forecast again, so a screen never shows a number the ledger does not hold.
import { calculateE1RM, isNewPR } from "@/lib/e1rm";
import { liftName } from "@/components/LogEdit/format";
import type { ScoredForecast } from "@/lib/forecast";
import { VOID_REASONS, type VoidReason } from "@/lib/forecast";
import { e1rmsForWorkout } from "@/lib/rebuild/e1rm";
import type { Forecast, RepsInReserve, SetLog, Tier, WorkoutSession } from "@/types";
import { joinList, percent } from "@/lib/text";

/** Weights within this many lbs count as the same weight. */
const SAME_WEIGHT_LBS = 0.01;
/** Rep buttons under the forecast bars. */
export const FORECAST_COLUMNS = 6;

export interface LiftForecasts {
  /** The spread of reps on the last set. Always has `pmf`, `low` and `high`. */
  reps: Forecast;
  /** The chance of a new best estimated max, when the lift had a best to beat. */
  newBest?: Forecast;
}

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * The stored forecasts for one lift's last set at the weight on the bar, or null when
 * there is no usable row: none stored for it (a session with no history at start, a
 * swapped-in lift), or one made for another weight.
 */
export function liftForecasts(
  scored: readonly ScoredForecast[] | undefined,
  lift: { exerciseId: string; tier: Tier; weight: number }
): LiftForecasts | null {
  if (!scored) return null;
  const rowOf = (kind: Forecast["kind"]) =>
    scored.find(
      ({ forecast }) =>
        forecast.kind === kind &&
        forecast.exerciseId === lift.exerciseId &&
        forecast.tier === lift.tier &&
        (forecast.event.weight === undefined ||
          Math.abs(forecast.event.weight - lift.weight) <= SAME_WEIGHT_LBS)
    )?.forecast;
  const reps = rowOf("amrapReps");
  const { pmf, low, high } = reps?.prediction ?? {};
  if (!reps || !pmf?.length || low === undefined || high === undefined) return null;
  const newBest = rowOf("newBest");
  return newBest ? { reps, newBest } : { reps };
}

/**
 * The rep counts shown under the bars: `FORECAST_COLUMNS` of them, starting one below
 * the expected range and never past the forecast's last bucket (which means "that
 * many or more", as the last button does).
 */
export function forecastWindow(pmf: readonly number[], low: number): { firstReps: number; lastReps: number } {
  const top = pmf.length - 1;
  const span = FORECAST_COLUMNS - 1;
  let first = Math.max(0, Math.round(low) - 1);
  if (first + span > top) first = Math.max(0, top - span);
  return { firstReps: first, lastReps: Math.min(top, first + span) };
}


export interface ForecastNote {
  /** Bold lead: "5 or more is a new best", or the most likely count when there is no best. */
  lead: string;
  /** After the lead: " (58% chance)." */
  chance: string;
  /** What the rep count picked below would do, when it would set a new best. */
  selected: string | null;
  /** What the forecast rests on. */
  basis: string;
}

/**
 * The sentences under the rep forecast: the chance of a new best (or the expected
 * count), what the picked count would do, and what the forecast was built from.
 */
export function forecastNote(
  forecasts: LiftForecasts,
  picked: { weight: number; reps: number; repsInReserve: RepsInReserve | null }
): ForecastNote {
  const { reps, newBest } = forecasts;
  const { point, low, high } = reps.prediction;
  const best = num(newBest?.event.level);
  const needed = num(newBest?.inputs.repsNeeded);
  const probability = num(newBest?.prediction.probability);

  let lead: string;
  let chance: string;
  if (newBest && needed !== undefined && probability !== undefined) {
    const about = (num(newBest.inputs.effortCredit) ?? 0) > 0;
    lead = `${about ? "About " : ""}${needed} or more is a new best`;
    chance = ` (${percent(probability)} chance).`;
  } else {
    lead = `${Math.round(point)} reps is most likely`;
    chance = ` (${low} to ${high} expected).`;
  }

  let selected: string | null = null;
  if (best !== undefined) {
    const estimate = calculateE1RM(picked.weight, picked.reps, picked.repsInReserve);
    if (estimate !== null && isNewPR(estimate, [best])) {
      selected = `${picked.reps} would put your estimated max at ${estimate}, up from ${best}.`;
    }
  }

  const sample = num(reps.inputs.sampleSize) ?? 0;
  const parts =
    sample > 0
      ? [`your last ${sample === 1 ? "final set" : `${sample} final sets`}`]
      : ["a starting guess (no final sets of this lift yet)"];
  if ((num(reps.inputs.readinessShift) ?? 0) !== 0) parts.push("today's readiness");
  if ((num(reps.inputs.cuttingShift) ?? 0) !== 0) parts.push("the cut");
  const basis = `Built from ${joinList(parts)}.`;

  return { lead, chance, selected, basis };
}

export interface LastSetVerdict {
  /** "New best · Squat 190 × 6", or "Squat 190 × 6". */
  title: string;
  /** "Forecast was 5 (4 to 6). You got 6." with where it landed. */
  body: string;
  /** The new best estimated max, when the set made one. */
  newBest: number | null;
}

/**
 * How a logged last set compared with its stored forecast, for the rest screen. A new
 * best is named only as the app records one: the workout's own estimated max for the
 * lift (`e1rmsForWorkout`) above the best that stood when the forecast was made.
 */
export function lastSetVerdict(
  forecasts: LiftForecasts,
  set: Pick<SetLog, "exerciseId" | "weight" | "actualReps">,
  workout: WorkoutSession
): LastSetVerdict {
  const { point, low = point, high = point } = forecasts.reps.prediction;
  const got = set.actualReps;
  const where =
    got > high ? "Above the expected range." : got < low ? "Below the expected range." : "Inside the expected range.";
  const body = `Forecast was ${Math.round(point)} (${low} to ${high}). You got ${got}. ${where}`;

  const level = num(forecasts.newBest?.event.level);
  let newBest: number | null = null;
  if (level !== undefined) {
    const estimates = e1rmsForWorkout(workout)
      .filter((row) => row.exerciseId === set.exerciseId)
      .map((row) => row.estimated1RM);
    const value = estimates.length ? Math.max(...estimates) : null;
    if (value !== null && isNewPR(value, [level])) newBest = value;
  }
  const what = `${liftName(set.exerciseId)} ${set.weight} × ${got}`;
  return { title: newBest !== null ? `New best · ${what}` : what, body, newBest };
}

// ---------------------------------------------------------------------------
// The summary: every forecast made at start, against what happened
// ---------------------------------------------------------------------------

export type ResultMark = "beat" | "inside" | "outside" | "hit" | "miss" | "void" | "open";

export interface ForecastResultRow {
  id: string;
  label: string;
  /** What was forecast: "5 (4–6)", "58%". */
  stated: string;
  /** What happened: "6 reps", "passed", "47 min"; empty while open or void. */
  result: string;
  mark: ResultMark;
  /** Plain reason a void row is not scored. */
  why?: string;
}

/** Short words for the summary's void rows. */
const VOID_SHORT: Record<VoidReason, string> = {
  "workout-missing": "workout not found",
  "workout-deleted": "workout discarded",
  "not-reached": "last set not reached",
  freeze: "a set was skipped or lightened",
  "load-drop": "weight dropped",
  "weight-changed": "weight changed",
  "ended-early": "ended early",
  "no-duration": "no recorded length",
  "too-few-measurements": "too few measurements",
  "not-scorable": "nothing to measure",
};

export function voidReasonText(reason: string): string {
  return reason in VOID_SHORT ? VOID_SHORT[reason as VoidReason] : (VOID_REASONS[reason as VoidReason] ?? reason);
}

const ORDER: Forecast["kind"][] = ["amrapReps", "liftPass", "newBest", "sessionLength"];
const minutes = (seconds: number) => Math.round(seconds / 60);

function rangeText(point: number, low: number | undefined, high: number | undefined, scale = (x: number) => Math.round(x)) {
  return low !== undefined && high !== undefined
    ? `${scale(point)} (${scale(low)}–${scale(high)})`
    : String(scale(point));
}

/**
 * One row per forecast made when the workout started, in a fixed order (lifts in plan
 * order, then the session length): what was stated, what happened and how it landed.
 */
export function forecastResultRows(scored: readonly ScoredForecast[]): ForecastResultRow[] {
  // Lifts stay together, in the order they first appear; each lift's kinds in ORDER.
  const liftOrder = [...new Set(scored.map((s) => s.forecast.exerciseId ?? "~session"))];
  const sorted = [...scored].sort(
    (a, b) =>
      liftOrder.indexOf(a.forecast.exerciseId ?? "~session") -
        liftOrder.indexOf(b.forecast.exerciseId ?? "~session") ||
      ORDER.indexOf(a.forecast.kind) - ORDER.indexOf(b.forecast.kind)
  );
  const session = sorted.filter((s) => s.forecast.kind === "sessionLength");
  const lifts = sorted.filter((s) => s.forecast.kind !== "sessionLength");

  return [...lifts, ...session]
    .filter(({ forecast }) => ORDER.includes(forecast.kind))
    .map(({ forecast, status }): ForecastResultRow => {
      const name = forecast.exerciseId ? liftName(forecast.exerciseId) : "";
      const { point, low, high, probability } = forecast.prediction;
      let label: string;
      let stated: string;
      let result = (value: number) => String(value);
      switch (forecast.kind) {
        case "amrapReps":
          label = `${name}, last set`;
          stated = rangeText(point, low, high);
          result = (v) => `${v} ${v === 1 ? "rep" : "reps"}`;
          break;
        case "liftPass":
          label = `${name} passes`;
          stated = `${Math.round((probability ?? point) * 100)}%`;
          break;
        case "newBest":
          label = `${name}, new best`;
          stated = `${Math.round((probability ?? point) * 100)}%`;
          result = (v) => (v > 0 ? `est. ${v}` : "none");
          break;
        default:
          label = "Session length";
          stated = rangeText(point, low, high, minutes);
          result = (v) => `${minutes(v)} min`;
      }
      const id = forecast.id;
      if (status.state === "open") return { id, label, stated, result: "", mark: "open" };
      if (status.state === "void") {
        return { id, label, stated, result: "", mark: "void", why: voidReasonText(status.reason) };
      }
      let mark: ResultMark;
      if (status.hit !== undefined) {
        mark = status.hit ? "hit" : "miss";
        if (forecast.kind === "liftPass") result = () => (status.hit ? "passed" : "missed");
        if (forecast.kind === "newBest" && !status.hit && status.value > 0) result = (v) => `est. ${v}, not a best`;
      } else if (status.inside === false) {
        mark = "outside";
      } else {
        mark = forecast.kind === "amrapReps" && status.value > Math.round(point) ? "beat" : "inside";
      }
      return { id, label, stated, result: result(status.value), mark };
    });
}

/** "3 of 4 inside the range", over the rows that state a range and were scored. */
export function insideCount(rows: readonly ForecastResultRow[]): { inside: number; ranged: number } {
  const ranged = rows.filter((r) => r.mark === "beat" || r.mark === "inside" || r.mark === "outside");
  return { inside: ranged.filter((r) => r.mark !== "outside").length, ranged: ranged.length };
}
