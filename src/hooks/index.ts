// Read hooks over the local database. Every hook returns `undefined` while its first
// query is loading (the dexie-react-hooks `useLiveQuery` convention) and then stays
// live: it re-renders when the underlying rows change.
//
// Contract stubs: the data-layer package implements these, splitting them into one
// file per area and re-exporting from here. Signatures must not change.
import type {
  BodyweightLog,
  Estimated1RM,
  LiftState,
  PainSorenessEntry,
  RunLog,
  UserProfile,
  UserSettings,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";
import type { NextWorkoutDescription } from "@/lib/workout/types";

const NOT_IMPLEMENTED = "not implemented: src/hooks contract stub";

/** The single user profile; `null` once loaded if none exists. */
export function useProfile(): UserProfile | null | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/** The profile's settings; `null` once loaded if there is no profile. */
export function useSettings(): UserSettings | null | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

export function useLiftStates(): LiftState[] | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/** One workout by id; `null` once loaded if it does not exist or no id was given. */
export function useWorkout(id: string | null | undefined): WorkoutSession | null | undefined {
  void id;
  throw new Error(NOT_IMPLEMENTED);
}

/** Workouts with a completion time, newest first. */
export function useCompletedWorkouts(): WorkoutSession[] | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/** The most recent unfinished workout started in the last 24 hours, else `null`. */
export function useUnfinishedWorkout(): WorkoutSession | null | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/** Bodyweight entries, oldest first. */
export function useBodyweightLog(): BodyweightLog[] | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/** Pain and soreness entries, newest first. */
export function usePainEntries(): PainSorenessEntry[] | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/** Estimated 1RM rows, oldest first, for one exercise or for all when omitted. */
export function useE1RMs(exerciseId?: string): Estimated1RM[] | undefined {
  void exerciseId;
  throw new Error(NOT_IMPLEMENTED);
}

/** Runs, newest first. */
export function useRuns(): RunLog[] | undefined {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * The upcoming workout in the rotation with its plan for the given location
 * (defaults to the profile's default location, else "gym"). Warm-ups follow the
 * `showWarmUps` setting; no accessories.
 */
export function useNextWorkout(location?: WorkoutLocation): NextWorkoutDescription | undefined {
  void location;
  throw new Error(NOT_IMPLEMENTED);
}
