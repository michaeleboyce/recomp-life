// Text helpers for the import screen.

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export { plural };

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

/** "a, b and c". */
export function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
