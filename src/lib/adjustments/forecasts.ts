// What the stored forecasts say about the app changing its own mind, as log entries:
// a revision (a forecast for a date weeks ahead moved by more than the range it gave)
// and a self-correction (the app widened a kind's ranges). Both are differences between
// consecutive stored rows; nothing here is stored. Pure.
import type { RuleId } from "@/lib/evidence";
import { CALIBRATION, FORECAST_KINDS, earliestPerSlot, sdScaleChanges } from "@/lib/forecast";
import { feedLiftLabel } from "@/lib/liftNames";
import { formatNumber } from "@/lib/metrics/helpers";
import { capitalise, lowerFirst } from "@/lib/text";
import type { AdjustmentEntry, Forecast, ForecastKind } from "@/types";
import {
  FEED_HREFS,
  countOf,
  inTen,
  toDate,
} from "./text";
import { SOURCE_RANK, type RankedEntry } from "./types";

/** The rule behind the app checking and widening its own ranges. */
const CALIBRATION_RULE: RuleId = "forecast-calibration";

/** How a kind of forecast for a date weeks ahead is worded. Kinds not listed use their label. */
const HORIZON_WORDING: Partial<
  Record<ForecastKind, { subject: (forecast: Forecast) => string; results: string; digits: number }>
> = {
  e1rm4w: {
    subject: (forecast) =>
      forecast.exerciseId ? `${feedLiftLabel(forecast.exerciseId)} forecast` : "Estimated max forecast",
    results: "result",
    digits: 0,
  },
  bodyweight4w: { subject: () => "Bodyweight forecast", results: "weigh-in", digits: 1 },
};

/** `kind|subject`: the slot without its week, so consecutive weeks of one subject line up. */
function subjectKey(forecast: Forecast): string {
  const parts = forecast.slot.split("|");
  return parts.length > 1
    ? parts.slice(0, -1).join("|")
    : `${forecast.kind}|${forecast.exerciseId ?? ""}`;
}

/** Half the width of the forecast's own range; null when it gave none. */
function halfWidth(forecast: Forecast): number | null {
  const { low, high } = forecast.prediction;
  if (typeof low !== "number" || typeof high !== "number") return null;
  const half = (high - low) / 2;
  return Number.isFinite(half) && half >= 0 ? half : null;
}

/** How many more results the later forecast was made from, when both rows say. */
function newResults(earlier: Forecast, later: Forecast): number | null {
  const before = earlier.inputs?.sampleSize;
  const after = later.inputs?.sampleSize;
  return typeof before === "number" && typeof after === "number" && after > before
    ? after - before
    : null;
}

function revisionEntry(earlier: Forecast, later: Forecast, half: number): AdjustmentEntry | null {
  const at = toDate(later.madeAt);
  if (!at) return null;
  const wording = HORIZON_WORDING[later.kind];
  const digits = wording?.digits ?? 1;
  const from = formatNumber(earlier.prediction.point, digits);
  const to = formatNumber(later.prediction.point, digits);
  if (from === to) return null;

  const up = later.prediction.point > earlier.prediction.point;
  const subject = wording?.subject(later) ?? `${FORECAST_KINDS[later.kind].label} forecast`;
  const added = wording?.results === "result" ? newResults(earlier, later) : null;
  const what =
    added !== null
      ? `${capitalise(countOf(added, `new ${wording!.results}`))}`
      : `Your recent ${wording?.results ?? "result"}s`;

  return {
    id: `forecastRevision:${later.id}`,
    at,
    source: "forecastRevision",
    title: `${subject} ${up ? "raised" : "lowered"} ${from} → ${to}`,
    detail:
      `${what} moved your trend ${up ? "up" : "down"}. ` +
      `That is more than the ${formatNumber(half, digits)} either side the earlier forecast allowed.`,
    change: { from, to },
    ruleId: FORECAST_KINDS[later.kind].ruleId,
    href: FEED_HREFS.forecasts,
  };
}

/**
 * Revisions: for each subject of a forecast for a date weeks ahead (a lift's estimated
 * max, bodyweight), every stored forecast is compared with the one before it. When its
 * point has moved by more than half the width of the earlier forecast's own range,
 * that is an entry, dated when the later forecast was made and citing the rule that
 * owns the forecast. Only the earliest row of each slot is read, as in the track
 * record, so a second device cannot add a revision.
 */
function revisionEntries(scored: Forecast[]): AdjustmentEntry[] {
  const bySubject = new Map<string, Forecast[]>();
  for (const forecast of scored) {
    if (FORECAST_KINDS[forecast.kind]?.scope !== "horizon") continue;
    // Only kinds with wording are revised in the log: a round-number date is stored as a
    // day count, which would read as "20,790 → 20,800".
    if (!HORIZON_WORDING[forecast.kind]) continue;
    const key = subjectKey(forecast);
    const list = bySubject.get(key);
    if (list) list.push(forecast);
    else bySubject.set(key, [forecast]);
  }

  const entries: AdjustmentEntry[] = [];
  for (const list of bySubject.values()) {
    for (let i = 1; i < list.length; i++) {
      const half = halfWidth(list[i - 1]);
      if (half === null) continue;
      const moved = Math.abs(list[i].prediction.point - list[i - 1].prediction.point);
      if (!(moved > half)) continue;
      const entry = revisionEntry(list[i - 1], list[i], half);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

/** 1 -> "1×", 1.15 -> "1.15×". */
function times(factor: number): string {
  return `${formatNumber(factor, 2)}×`;
}

/**
 * Self-corrections: every time a kind's widening factor went up between consecutive
 * stored forecasts (`sdScaleChanges`), dated when the first forecast at the new factor
 * was made. The reason is the rule's own condition, read from CALIBRATION.
 */
function selfCorrectionEntries(forecasts: Forecast[]): AdjustmentEntry[] {
  return sdScaleChanges(forecasts).map((change) => {
    const pair = { from: times(change.from), to: times(change.to) };
    return {
      id: `selfCorrection:${change.forecastId}`,
      at: change.at,
      source: "selfCorrection",
      title: `Range for ${lowerFirst(FORECAST_KINDS[change.kind].label)} widened ${pair.from} → ${pair.to}`,
      detail:
        `At least ${CALIBRATION.minResolvedForCorrection} of these forecasts had been checked against ` +
        `what happened and fewer than ${inTen(CALIBRATION.widenBelowCoverage)} landed inside their range, ` +
        `so the app made the range wider. A range is built to hold ${inTen(CALIBRATION.targetCoverage)}.`,
      change: pair,
      ruleId: CALIBRATION_RULE,
      href: FEED_HREFS.trackRecord,
    };
  });
}

/** Forecast revisions and self-corrections read from the stored forecast rows. */
export function forecastEntries(forecasts: Forecast[]): RankedEntry[] {
  const scored = earliestPerSlot(forecasts);
  return [
    ...revisionEntries(scored).map((entry, index) => ({
      entry,
      rank: SOURCE_RANK.forecastRevision + index,
    })),
    ...selfCorrectionEntries(forecasts).map((entry, index) => ({
      entry,
      rank: SOURCE_RANK.selfCorrection + index,
    })),
  ];
}
