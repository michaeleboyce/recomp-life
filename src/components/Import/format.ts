// Text helpers for the import screen.

export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Mar 4, 2021 to Jun 2, 2024", one date when both are the same day, or an empty string. */
export function formatRange(first: Date | null, last: Date | null): string {
  if (!first || !last) return "";
  const a = formatDay(first);
  const b = formatDay(last);
  return a === b ? a : `${a} to ${b}`;
}
