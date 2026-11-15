// The track record: how stored forecasts compared with what happened. Pure, and
// derived on every read from the forecast rows and the log; nothing here is stored.
import type { Forecast, ForecastBasis, ForecastKind } from "@/types";
import { CALIBRATION } from "./coefficients";
import { toMs } from "./log";
import { clamp } from "./math";
import { FORECAST_KIND_IDS } from "./registry";
import { earliestPerSlot, resolveForecast } from "./resolve";
import type { ForecastLog, ScoredForecast } from "./types";

/** Stated chances are grouped into these bands; the last one includes 1. */
export const CALIBRATION_BIN_EDGES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

export interface CalibrationBin {
  from: number;
  to: number;
  n: number;
  /** Mean chance the forecasts in the band stated; null when the band is empty. */
  meanStated: number | null;
  /** Share of them that happened. */
  observed: number | null;
}

export interface TrackRecord {
  total: number;
  open: number;
  void: number;
  resolved: number;
  /** Forecasts with a range: how many results landed inside it. */
  ranges: { n: number; inside: number; share: number | null };
  /** Forecasts with a stated chance. `brier` is the mean squared gap; lower is better. */
  chances: {
    n: number;
    hits: number;
    meanStated: number | null;
    observed: number | null;
    brier: number | null;
    bins: CalibrationBin[];
  };
  /**
   * Forecasts of an amount (reps, seconds, lbs): the average miss and the bias, result
   * minus forecast, so a positive bias means results came in above the forecasts.
   * Both are null when the group mixes units.
   */
  miss: { n: number; unit: string | null; meanAbs: number | null; bias: number | null };
}

export interface TrackRecordSplit {
  overall: TrackRecord;
  byKind: Partial<Record<ForecastKind, TrackRecord>>;
  /** By exercise id; forecasts that are not about a lift are left out. */
  byLift: Record<string, TrackRecord>;
  /** By how much history the forecast stood on. */
  byBasis: Partial<Record<ForecastBasis, TrackRecord>>;
}

/**
 * Each forecast to score (the earliest row per slot) with the status the log gives
 * it at `now`, oldest first.
 */
export function scoreForecasts(
  forecasts: Forecast[],
  log: ForecastLog,
  now: Date
): ScoredForecast[] {
  return earliestPerSlot(forecasts).map((forecast) => ({
    forecast,
    status: resolveForecast(forecast, log, now),
  }));
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** The track record of one group of scored forecasts. */
export function summarize(scored: ScoredForecast[]): TrackRecord {
  let open = 0;
  let voided = 0;
  let resolved = 0;
  let rangeN = 0;
  let inside = 0;
  let chanceN = 0;
  let hits = 0;
  let statedSum = 0;
  let brierSum = 0;
  let missN = 0;
  let absSum = 0;
  let biasSum = 0;
  const units = new Set<string>();
  const bins = CALIBRATION_BIN_EDGES.slice(0, -1).map((from, i) => ({
    from,
    to: CALIBRATION_BIN_EDGES[i + 1],
    n: 0,
    stated: 0,
    hits: 0,
  }));

  for (const { forecast, status } of scored) {
    if (status.state === "open") open += 1;
    if (status.state === "void") voided += 1;
    if (status.state !== "resolved") continue;
    resolved += 1;

    if (status.inside !== undefined) {
      rangeN += 1;
      if (status.inside) inside += 1;
    }

    const stated = forecast.prediction.probability;
    if (stated !== undefined && status.hit !== undefined) {
      const outcome = status.hit ? 1 : 0;
      chanceN += 1;
      hits += outcome;
      statedSum += stated;
      brierSum += (stated - outcome) * (stated - outcome);
      const bin =
        bins.find((b) => stated >= b.from && stated < b.to) ?? bins[bins.length - 1];
      bin.n += 1;
      bin.stated += stated;
      bin.hits += outcome;
    }

    if (stated === undefined && Number.isFinite(status.value)) {
      missN += 1;
      absSum += Math.abs(status.value - forecast.prediction.point);
      biasSum += status.value - forecast.prediction.point;
      units.add(forecast.prediction.unit);
    }
  }

  const oneUnit = units.size === 1;
  return {
    total: scored.length,
    open,
    void: voided,
    resolved,
    ranges: { n: rangeN, inside, share: share(inside, rangeN) },
    chances: {
      n: chanceN,
      hits,
      meanStated: share(statedSum, chanceN),
      observed: share(hits, chanceN),
      brier: share(brierSum, chanceN),
      bins: bins.map((b) => ({
        from: b.from,
        to: b.to,
        n: b.n,
        meanStated: share(b.stated, b.n),
        observed: share(b.hits, b.n),
      })),
    },
    miss: {
      n: missN,
      unit: oneUnit ? [...units][0] : null,
      meanAbs: oneUnit ? share(absSum, missN) : null,
      bias: oneUnit ? share(biasSum, missN) : null,
    },
  };
}

function groupBy<K extends string>(
  scored: ScoredForecast[],
  key: (item: ScoredForecast) => K | undefined
): Partial<Record<K, TrackRecord>> {
  const groups = new Map<K, ScoredForecast[]>();
  for (const item of scored) {
    const k = key(item);
    if (k === undefined) continue;
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  const out: Partial<Record<K, TrackRecord>> = {};
  for (const [k, items] of groups) out[k] = summarize(items);
  return out;
}

/** The track record overall and split by kind, by lift and by how much history there was. */
export function trackRecord(scored: ScoredForecast[]): TrackRecordSplit {
  return {
    overall: summarize(scored),
    byKind: groupBy(scored, (item) => item.forecast.kind),
    byLift: groupBy(scored, (item) => item.forecast.exerciseId) as Record<string, TrackRecord>,
    byBasis: groupBy(scored, (item) => item.forecast.basis),
  };
}

/**
 * The kind whose ranges decide a kind's widening. The chance of a new best and of a
 * pass have no range of their own: they come from the reps model, so they widen with it.
 */
export const RANGE_SOURCE_KIND: Record<ForecastKind, ForecastKind> = {
  amrapReps: "amrapReps",
  newBest: "amrapReps",
  liftPass: "amrapReps",
  sessionLength: "sessionLength",
  e1rm4w: "e1rm4w",
  bodyweight4w: "bodyweight4w",
};

const SCALE_TOLERANCE = 1e-9;

/** The widening factor a forecast was made with (`inputs.sdScale`); 1 when not recorded. */
export function sdScaleOf(forecast: Forecast): number {
  const scale = forecast.inputs?.sdScale;
  return typeof scale === "number" && Number.isFinite(scale)
    ? clamp(scale, CALIBRATION.sdScaleMin, CALIBRATION.sdScaleMax)
    : CALIBRATION.sdScaleMin;
}

/**
 * The widening factor the next forecast of `kind` should use, from the record so far.
 *
 * It starts at CALIBRATION.sdScaleMin and never goes down. The factor in force is the
 * largest any stored forecast of the kind was made with. Once
 * CALIBRATION.minResolvedForCorrection forecasts made at that factor have resolved
 * and fewer than widenBelowCoverage of them landed inside their range, the factor
 * goes up by sdScaleStep, to at most sdScaleMax. Each further step needs that many
 * results again at the new factor, so one bad stretch cannot run it to the limit.
 * Nothing is stored: the factor each forecast used is on its row, and the adjustment
 * log reads the steps from there (`sdScaleChanges`).
 */
export function sdScaleFor(kind: ForecastKind, record: ScoredForecast[]): number {
  const source = RANGE_SOURCE_KIND[kind];
  const rows = record.filter((item) => item.forecast.kind === source);
  if (rows.length === 0) return CALIBRATION.sdScaleMin;

  const current = rows.reduce<number>(
    (largest, item) => Math.max(largest, sdScaleOf(item.forecast)),
    CALIBRATION.sdScaleMin
  );
  let n = 0;
  let inside = 0;
  for (const { forecast, status } of rows) {
    if (status.state !== "resolved" || status.inside === undefined) continue;
    if (Math.abs(sdScaleOf(forecast) - current) > SCALE_TOLERANCE) continue;
    n += 1;
    if (status.inside) inside += 1;
  }
  if (n < CALIBRATION.minResolvedForCorrection) return current;
  if (inside / n >= CALIBRATION.widenBelowCoverage) return current;
  const next = Math.round((current + CALIBRATION.sdScaleStep) * 100) / 100;
  return Math.min(CALIBRATION.sdScaleMax, next);
}

/** `sdScaleFor` for every kind: what `ForecastSource.sdScale` takes. */
export function sdScales(record: ScoredForecast[]): Record<ForecastKind, number> {
  const scales = {} as Record<ForecastKind, number>;
  for (const kind of FORECAST_KIND_IDS) scales[kind] = sdScaleFor(kind, record);
  return scales;
}

export interface SdScaleChange {
  kind: ForecastKind;
  /** When the first forecast at the new factor was made. */
  at: Date;
  from: number;
  to: number;
  forecastId: string;
}

/**
 * Every time a kind's widening factor went up, read from the stored rows (oldest
 * first): the points where a forecast was made with a larger factor than any before
 * it. Only kinds with ranges of their own are listed. For the adjustment log.
 */
export function sdScaleChanges(forecasts: Forecast[]): SdScaleChange[] {
  const changes: SdScaleChange[] = [];
  const inForce = new Map<ForecastKind, number>();
  for (const forecast of earliestPerSlot(forecasts)) {
    if (RANGE_SOURCE_KIND[forecast.kind] !== forecast.kind) continue;
    const before = inForce.get(forecast.kind) ?? CALIBRATION.sdScaleMin;
    const scale = sdScaleOf(forecast);
    if (scale > before + SCALE_TOLERANCE) {
      changes.push({
        kind: forecast.kind,
        at: new Date(toMs(forecast.madeAt)),
        from: before,
        to: scale,
        forecastId: forecast.id,
      });
      inForce.set(forecast.kind, scale);
    }
  }
  return changes;
}
