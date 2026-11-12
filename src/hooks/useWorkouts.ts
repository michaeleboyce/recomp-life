import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { LiftState, WorkoutSession } from "@/types";

/** Unfinished sessions older than this are not offered for resume. */
const UNFINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Epoch milliseconds of a stored date, 0 when it is missing or unreadable. Rows synced
 * from another device before the date fix hold ISO strings, and IndexedDB orders every
 * Date before every string, so the hooks sort here instead of trusting index order.
 */
function time(value: Date | string | null | undefined): number {
  const ms = value == null ? NaN : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Every workout, most recently started first. */
async function workoutsNewestFirst(): Promise<WorkoutSession[]> {
  const all = await db.workouts.toArray();
  return all.sort((a, b) => time(b.startedAt) - time(a.startedAt));
}

export function useLiftStates(): LiftState[] | undefined {
  return useLiveQuery(() => db.liftStates.toArray(), []);
}

/** One workout by id; `null` once loaded if it does not exist or no id was given. */
export function useWorkout(id: string | null | undefined): WorkoutSession | null | undefined {
  return useLiveQuery(
    async () => (id ? ((await db.workouts.get(id)) ?? null) : null),
    [id]
  );
}

/**
 * Workouts with a completion time (`completedAt != null`, as `describeNextWorkout`
 * counts them), most recently started first.
 */
export function useCompletedWorkouts(): WorkoutSession[] | undefined {
  return useLiveQuery(
    async () => (await workoutsNewestFirst()).filter((w) => w.completedAt != null),
    []
  );
}

/** The most recent unfinished workout started in the last 24 hours, else `null`. */
export function useUnfinishedWorkout(): WorkoutSession | null | undefined {
  return useLiveQuery(async () => {
    const cutoff = Date.now() - UNFINISHED_WINDOW_MS;
    return (
      (await workoutsNewestFirst()).find(
        (w) => w.completedAt == null && time(w.startedAt) > cutoff
      ) ?? null
    );
  }, []);
}
