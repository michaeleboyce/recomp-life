import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { ActivityLog, BodyweightLog, Estimated1RM, PainSorenessEntry, RunLog } from "@/types";
import { liveRows } from "./liveRows";

/**
 * Sorts rows by their `date` in JavaScript. Rows synced from another device before the
 * date fix hold ISO strings, and IndexedDB orders every Date before every string, so
 * index order is not chronological. A missing or unreadable date sorts as the oldest.
 */
function byDate<T extends { date: Date | string }>(rows: T[], order: "oldest" | "newest"): T[] {
  const time = (row: T) => {
    const ms = new Date(row.date).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };
  const direction = order === "oldest" ? 1 : -1;
  return rows.sort((a, b) => direction * (time(a) - time(b)));
}

/** Bodyweight entries, oldest first. */
export function useBodyweightLog(): BodyweightLog[] | undefined {
  return useLiveQuery(async () => byDate(liveRows(await db.bodyweight.toArray()), "oldest"), []);
}

/** Pain and soreness entries, newest first. */
export function usePainEntries(): PainSorenessEntry[] | undefined {
  return useLiveQuery(async () => byDate(liveRows(await db.painEntries.toArray()), "newest"), []);
}

/** Estimated 1RM rows, oldest first, for one exercise or for all when omitted. */
export function useE1RMs(exerciseId?: string): Estimated1RM[] | undefined {
  return useLiveQuery(
    async () =>
      byDate(
        exerciseId
          ? await db.estimated1RMs.where("exerciseId").equals(exerciseId).toArray()
          : await db.estimated1RMs.toArray(),
        "oldest"
      ),
    [exerciseId]
  );
}

/** Runs, newest first. */
export function useRuns(): RunLog[] | undefined {
  return useLiveQuery(async () => byDate(liveRows(await db.runs.toArray()), "newest"), []);
}

/** Non-running activities (yoga, cycling, hiking...), newest first. */
export function useActivities(): ActivityLog[] | undefined {
  return useLiveQuery(async () => byDate(liveRows(await db.activities.toArray()), "newest"), []);
}
