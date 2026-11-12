/**
 * Whole calendar days from `from` to `to` in local time: the number of
 * midnights crossed, so 6pm yesterday to 1pm today is 1.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
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
