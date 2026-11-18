import { plural } from "./text";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

/**
 * Whole calendar days from `from` to `to` in local time: the number of
 * midnights crossed, so 6pm yesterday to 1pm today is 1.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/** "Today", "Yesterday", "N days ago", or "Never" when there is no date. */
export function formatDaysAgo(date: Date | null | undefined, now: Date): string {
  if (!date) return "Never";
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/**
 * Returns the Monday (00:00 local time) of the week containing `date`.
 * Weeks run Monday to Sunday.
 */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "2026-11-10": the local calendar day of a date (also the value a date input uses). */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "8 weeks ago" below 61 days, else "14 months ago": weeks and months only. */
export function weeksOrMonthsAgo(date: Date, now: Date): string {
  const days = calendarDaysBetween(date, now);
  return days < 61 ? `${plural(Math.round(days / 7), "week")} ago` : `${plural(Math.round(days / 30), "month")} ago`;
}

/** "today", "yesterday", "5 days ago", then as `weeksOrMonthsAgo` from 14 days. */
export function agoText(date: Date, now: Date): string {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return weeksOrMonthsAgo(date, now);
}
