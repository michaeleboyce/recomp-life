// Pure helpers for the Body tab and the bodyweight detail page.
import type { BodyweightLog, TimeOfDay } from "@/types";

// The pace helpers live in `@/lib/rateOfLoss` so code in src/lib does not import from components.
export { CUT_TARGET_PERCENT, cutTargetBand, paceStatus } from "@/lib/rateOfLoss";
export type { PaceWord } from "@/lib/rateOfLoss";

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
