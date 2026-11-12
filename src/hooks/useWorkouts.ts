import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { LiftState, WorkoutSession } from "@/types";

/** Unfinished sessions older than this are not offered for resume. */
const UNFINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;

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

/** Workouts with a completion time, newest first. */
export function useCompletedWorkouts(): WorkoutSession[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.workouts.orderBy("startedAt").reverse().toArray();
    return all.filter((w) => w.completedAt !== null);
  }, []);
}

/** The most recent unfinished workout started in the last 24 hours, else `null`. */
export function useUnfinishedWorkout(): WorkoutSession | null | undefined {
  return useLiveQuery(async () => {
    const cutoff = Date.now() - UNFINISHED_WINDOW_MS;
    const newestFirst = await db.workouts.orderBy("startedAt").reverse().toArray();
    return (
      newestFirst.find(
        (w) => w.completedAt === null && new Date(w.startedAt).getTime() > cutoff
      ) ?? null
    );
  }, []);
}
