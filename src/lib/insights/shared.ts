// Small helpers shared by the insight rules. Pure.
import { EXERCISES } from "@/lib/exercises";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Records synced from another device may carry ISO strings; always normalise. */
export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isValidDate(d: Date): boolean {
  return Number.isFinite(d.getTime());
}

/** Display name of an exercise, falling back to its id. */
export function liftName(exerciseId: string): string {
  return EXERCISES[exerciseId]?.name ?? exerciseId;
}

/** 226 -> "226", 226.44 -> "226.4". */
export function formatLbs(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Bodyweight entries as the rate/stall functions take them: valid, not in the future, oldest first. */
export function sortedWeights(
  entries: ReadonlyArray<{ date: Date | string; weight: number }>,
  now: Date
): { date: Date; weight: number }[] {
  return entries
    .map((e) => ({ date: toDate(e.date), weight: e.weight }))
    .filter((e) => isValidDate(e.date) && e.date.getTime() <= now.getTime() && Number.isFinite(e.weight))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
