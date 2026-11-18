// The sums behind the weigh-in screen. Pure.
import { DAY_MS } from "@/lib/dates";
import type { TimeOfDay } from "@/types";

/** A typed weight outside this range (lbs) is refused as a typo. */
export const MIN_BODYWEIGHT_LBS = 50;
export const MAX_BODYWEIGHT_LBS = 500;

/** Past this many days since the last weigh-in, the rate of change describes an old stretch, so it is not shown. */
export const STALE_WEIGH_IN_DAYS = 14;

/** The typed weight in lbs, or null when it is not a number in the accepted range. */
export function parseBodyweight(text: string): number | null {
  const weight = parseFloat(text);
  if (isNaN(weight) || weight < MIN_BODYWEIGHT_LBS || weight > MAX_BODYWEIGHT_LBS) return null;
  return weight;
}

/** Before noon a weigh-in is a morning one, after it an evening one. */
export function defaultTimeOfDay(now: Date): TimeOfDay {
  return now.getHours() < 12 ? "morning" : "evening";
}

/** Local midnight at the start of `date`'s day. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The entry already logged on `day` (local time), if any. The log is oldest first,
 * so the earliest entry that day wins.
 */
export function entryOnDay<T extends { date: Date | string }>(log: readonly T[], day: Date): T | null {
  const dayStart = startOfDay(day);
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  return (
    log.find((entry) => {
      const t = new Date(entry.date).getTime();
      return t >= dayStart.getTime() && t < nextDayStart.getTime();
    }) ?? null
  );
}

/** The mean of the first `count` entries (newest first), or null with none. */
export function averageOfLatest(entries: readonly { weight: number }[], count: number): number | null {
  if (entries.length === 0) return null;
  const latest = entries.slice(0, Math.min(count, entries.length));
  return latest.reduce((sum, entry) => sum + entry.weight, 0) / latest.length;
}

/**
 * The latest weekly rate, or null when there is none or it is more than `staleDays`
 * older than `nowMs`.
 */
export function currentRate(
  latest: { t: number; v: number } | undefined,
  nowMs: number,
  staleDays: number
): number | null {
  return latest && nowMs - latest.t <= staleDays * DAY_MS ? latest.v : null;
}
