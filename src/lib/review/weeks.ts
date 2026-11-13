// Week handling for the weekly review: Monday to Sunday in local time, built only on
// getMonday (src/lib/dates) and nextWeekMs (the metrics layer's week step). Pure.
import { getMonday } from "@/lib/dates";
import { nextWeekMs, toMs, weekStartMs } from "@/lib/metrics/helpers";
import type { ReviewSource } from "./types";

/** Monday 00:00 of the week containing `date`. */
export const weekOf = (date: Date | number): Date => getMonday(new Date(date));

/** The Monday after `weekStart`. */
export const nextWeek = (weekStart: Date): Date => new Date(nextWeekMs(weekOf(weekStart).getTime()));

/** The Monday before `weekStart` (the Monday of the moment just before it). */
export const previousWeek = (weekStart: Date): Date => weekOf(weekOf(weekStart).getTime() - 1);

/** True when `t` (epoch ms) falls in the week starting `weekStart`. */
export const inWeek = (t: number, weekStart: Date): boolean =>
  Number.isFinite(t) && weekStartMs(t) === weekOf(weekStart).getTime();

/** "2026-11-02" for the URL. */
export function weekKey(weekStart: Date): string {
  const d = weekOf(weekStart);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses "YYYY-MM-DD" (local) to the Monday of its week; null when not a valid date. */
export function parseWeekKey(key: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return weekOf(date);
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric" });

/** "Nov 3 – 9", or "Oct 27 – Nov 2" across a month. */
export function formatWeekRange(weekStart: Date): string {
  const start = weekOf(weekStart);
  // Sunday: the moment before the next Monday.
  const sunday = new Date(nextWeek(start).getTime() - 1);
  const end = sunday.getMonth() === start.getMonth() ? DAY.format(sunday) : MONTH_DAY.format(sunday);
  return `${MONTH_DAY.format(start)} – ${end}`;
}

/**
 * Week starts with any workout, weigh-in, run or activity, newest first, plus the week
 * containing `now` (always first). Records dated after `now`'s week are ignored.
 */
export function reviewWeeks(source: ReviewSource, now: Date): Date[] {
  const current = weekOf(now).getTime();
  const starts = new Set<number>([current]);
  const add = (value: Date | string) => {
    const t = toMs(value);
    if (Number.isFinite(t)) starts.add(weekStartMs(t));
  };
  source.workouts.forEach((w) => add(w.startedAt));
  source.bodyweight.forEach((b) => add(b.date));
  source.runs.forEach((r) => add(r.date));
  (source.activities ?? []).forEach((a) => add(a.date));
  return [...starts]
    .filter((t) => t <= current)
    .sort((a, b) => b - a)
    .map((t) => new Date(t));
}
