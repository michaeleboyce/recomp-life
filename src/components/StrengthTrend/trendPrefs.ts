// The strength trend chart's window and smoothing, remembered on this device. Storage
// may be missing or throw (private mode, blocked site data): every read falls back to
// the defaults and every write is skipped, so the chart works the same without it.
import { ALL_RANGE_KEYS } from "@/lib/metrics/window";
import type { RangeKey } from "@/lib/metrics/types";
import { SMOOTHING_KEYS, type SmoothingKey } from "@/lib/strength";

export const TREND_PREFS_KEY = "recomp.strengthTrend.v1";

export interface TrendPrefs {
  range: RangeKey | null;
  smoothing: SmoothingKey;
}

export const DEFAULT_TREND_PREFS: TrendPrefs = { range: null, smoothing: "standard" };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readTrendPrefs(): TrendPrefs {
  try {
    const raw = storage()?.getItem(TREND_PREFS_KEY);
    if (!raw) return DEFAULT_TREND_PREFS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof TrendPrefs, unknown>>;
    const range = ALL_RANGE_KEYS.includes(parsed.range as RangeKey) ? (parsed.range as RangeKey) : null;
    const smoothing = SMOOTHING_KEYS.includes(parsed.smoothing as SmoothingKey)
      ? (parsed.smoothing as SmoothingKey)
      : DEFAULT_TREND_PREFS.smoothing;
    return { range, smoothing };
  } catch {
    return DEFAULT_TREND_PREFS;
  }
}

export function writeTrendPrefs(change: Partial<TrendPrefs>): void {
  try {
    const next = { ...readTrendPrefs(), ...change };
    storage()?.setItem(TREND_PREFS_KEY, JSON.stringify(next));
  } catch {
    // Not remembered; the chart still works.
  }
}
