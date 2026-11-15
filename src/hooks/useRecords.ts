import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type {
  ActivityLog,
  BodyweightLog,
  Estimated1RM,
  FavoriteWorkout,
  HealthDailyLog,
  LiftAdjustment,
  PainSorenessEntry,
  RunLog,
} from "@/types";
import { listFavorites } from "@/lib/favorites";
import { dailyRowId, localDateKey } from "@/lib/health/daily";
import { liveRow, liveRows } from "./liveRows";

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

/** Saved workouts that have not been deleted, most recently used (or created) first. */
export function useFavoriteWorkouts(): FavoriteWorkout[] | undefined {
  return useLiveQuery(async () => listFavorites(await db.favoriteWorkouts.toArray()), []);
}

/** Non-running activities (yoga, cycling, hiking...), newest first. */
export function useActivities(): ActivityLog[] | undefined {
  return useLiveQuery(async () => byDate(liveRows(await db.activities.toArray()), "newest"), []);
}

/** One row of Apple Health values per day, oldest first. Empty when nothing was imported. */
export function useHealthDaily(): HealthDailyLog[] | undefined {
  return useLiveQuery(
    async () => liveRows(await db.healthDaily.toArray()).sort((a, b) => a.day.localeCompare(b.day)),
    []
  );
}

/**
 * Minutes asleep last night according to Apple Health (the night counted toward
 * today), or null when there is none. `undefined` while loading.
 */
export function useLastNightSleep(): number | null | undefined {
  return useLiveQuery(async () => {
    const row = liveRow(await db.healthDaily.get(dailyRowId(localDateKey(new Date()))));
    return row?.sleepMinutes ?? null;
  }, []);
}

/**
 * Dated changes to lifts made outside a workout (starting weights, manual changes,
 * accepted time-off reductions), newest first, for one lift or for all when omitted.
 */
export function useLiftAdjustments(exerciseId?: string): LiftAdjustment[] | undefined {
  return useLiveQuery(async () => {
    const rows = liveRows(
      exerciseId
        ? await db.liftAdjustments.where("exerciseId").equals(exerciseId).toArray()
        : await db.liftAdjustments.toArray()
    );
    const time = (row: LiftAdjustment) => new Date(row.at).getTime() || 0;
    return rows.sort((a, b) => time(b) - time(a));
  }, [exerciseId]);
}
