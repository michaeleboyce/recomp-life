import { DAY_MS } from "@/lib/dates";
// When to import from Apple Health and how far back to look. Pure.

/** How far back the very first import reaches. */
export const HEALTH_FIRST_IMPORT_DAYS = 365;

/**
 * Later imports re-read this many days before the previous one. A watch can
 * deliver a workout or a night's sleep to the phone hours late, and re-reading
 * costs nothing: rows already imported are skipped.
 */
export const HEALTH_OVERLAP_DAYS = 3;

/** Opening the app imports automatically at most this often. */
export const HEALTH_AUTO_IMPORT_MINUTES = 15;


/** The moment to import from, given when the last import ran (null: never). */
export function importSince(lastImportAt: number | null, now: Date): Date {
  const firstReach = now.getTime() - HEALTH_FIRST_IMPORT_DAYS * DAY_MS;
  if (lastImportAt === null) return new Date(firstReach);
  return new Date(Math.max(firstReach, lastImportAt - HEALTH_OVERLAP_DAYS * DAY_MS));
}

/** Whether enough time has passed for an automatic import. */
export function autoImportDue(lastImportAt: number | null, now: Date): boolean {
  if (lastImportAt === null) return true;
  return now.getTime() - lastImportAt >= HEALTH_AUTO_IMPORT_MINUTES * 60 * 1000;
}
