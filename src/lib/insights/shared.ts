// Small helpers shared by the insight rules. Pure. Words and numbers come from
// `lib/text`, day lengths from `lib/dates`.

/** Records synced from another device may carry ISO strings; always normalise. */
export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isValidDate(d: Date): boolean {
  return Number.isFinite(d.getTime());
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
