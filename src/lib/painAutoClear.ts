import type { PainSorenessEntry } from "@/types";

/**
 * Get pain entries that have expired (older than `expiryDays`).
 *
 * Only entries with sensation === "pain" are considered for expiry.
 * Soreness entries are never returned — soreness is expected to resolve
 * naturally and doesn't need a "still bothering you?" prompt.
 *
 * @param entries       All current pain/soreness entries
 * @param currentDate   The reference date (typically now)
 * @param expiryDays    Number of days after which a pain entry expires (default 7)
 * @returns             Pain entries older than expiryDays
 */
export function getExpiredPainEntries(
  entries: PainSorenessEntry[],
  currentDate: Date,
  expiryDays: number = 7
): PainSorenessEntry[] {
  const cutoffMs = expiryDays * 24 * 60 * 60 * 1000;

  return entries.filter((entry) => {
    if (entry.sensation !== "pain") return false;

    const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
    const ageMs = currentDate.getTime() - entryDate.getTime();

    return ageMs > cutoffMs;
  });
}
