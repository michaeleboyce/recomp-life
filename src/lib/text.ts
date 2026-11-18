// Small English helpers for screen text. Pure.

/** "1 session", "3 sessions"; pass `many` for an irregular plural ("activities"). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** As `plural`, with a thousands separator: "11,708 sets". */
export function pluralGrouped(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** Pounds as the plan shows them: 226 -> "226", 226.44 -> "226.4", 202.96 -> "203.0". */
export function formatLbs(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 0.643 -> "64%". */
export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
