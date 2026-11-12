// Pure helpers for the Body tab and the bodyweight detail page.
import { calculateWeeklyRateOfLoss } from "@/lib/rateOfLoss";
import type { BodyweightLog, TimeOfDay } from "@/types";

/**
 * The green zone of `rateOfLoss.ts` (0.5 to 1.0 percent of bodyweight a week): the
 * target while cutting. Yellow and red above it are "fast", below it "slow".
 */
export const CUT_TARGET_PERCENT = { low: 0.5, high: 1.0 } as const;

export type PaceWord = "on pace" | "slow" | "fast";

/**
 * The target band for the weekly rate of change chart, in lbs/week. The rate metric
 * is negative while losing, so the band sits below zero: `low` is the faster limit.
 * `average` is the current 7-day average bodyweight.
 */
export function cutTargetBand(average: number): { low: number; high: number } {
  return {
    low: -(average * CUT_TARGET_PERCENT.high) / 100,
    high: -(average * CUT_TARGET_PERCENT.low) / 100,
  };
}

/** One word for how the latest weekly rate compares with the cutting target; null without enough weigh-ins. */
export function paceStatus(entries: { date: Date; weight: number }[]): PaceWord | null {
  const rate = calculateWeeklyRateOfLoss(entries);
  if (!rate) return null;
  switch (rate.zone) {
    case "green":
      return "on pace";
    case "red":
      return "fast";
    case "stall":
      return "slow";
    default:
      // Yellow sits on both sides of the green zone.
      return rate.percentPerWeek < CUT_TARGET_PERCENT.low ? "slow" : "fast";
  }
}

export interface WeighInRow {
  id: string;
  date: Date;
  weight: number;
  /** "Morning", "Evening" or "" when not recorded. */
  timeLabel: string;
  /** Weight minus the previous weigh-in; null for the first one ever. */
  diff: number | null;
}

export interface WeighInGroup {
  key: string;
  /** e.g. "November 2026". */
  label: string;
  rows: WeighInRow[];
}

const TIME_LABELS: Record<TimeOfDay, string> = { morning: "Morning", evening: "Evening", other: "" };
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/** A change with its sign: "+0.4", "−6.5", "0.0" (Unicode minus, like the Delta component). */
export function formatSigned(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value > 0 ? "+" : "−"}${text}`;
}

/** Weigh-ins newest first, grouped by month, at most `limit` entries (default all). */
export function weighInGroups(log: BodyweightLog[], limit = Infinity): WeighInGroup[] {
  const sorted = log
    .map((e) => ({ id: e.id, date: new Date(e.date), weight: e.weight, timeOfDay: e.timeOfDay }))
    .filter((e) => Number.isFinite(e.date.getTime()) && Number.isFinite(e.weight))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const rows: WeighInRow[] = sorted
    .map((e, i) => ({
      id: e.id,
      date: e.date,
      weight: e.weight,
      timeLabel: TIME_LABELS[e.timeOfDay] ?? "",
      diff: i === 0 ? null : e.weight - sorted[i - 1].weight,
    }))
    .reverse()
    .slice(0, limit);
  const groups: WeighInGroup[] = [];
  for (const row of rows) {
    const key = `${row.date.getFullYear()}-${row.date.getMonth() + 1}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, label: MONTH.format(row.date), rows: [row] });
  }
  return groups;
}
