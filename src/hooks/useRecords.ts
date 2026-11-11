import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { BodyweightLog, Estimated1RM, PainSorenessEntry, RunLog } from "@/types";

/** Bodyweight entries, oldest first. */
export function useBodyweightLog(): BodyweightLog[] | undefined {
  return useLiveQuery(() => db.bodyweight.orderBy("date").toArray(), []);
}

/** Pain and soreness entries, newest first. */
export function usePainEntries(): PainSorenessEntry[] | undefined {
  return useLiveQuery(() => db.painEntries.orderBy("date").reverse().toArray(), []);
}

/** Estimated 1RM rows, oldest first, for one exercise or for all when omitted. */
export function useE1RMs(exerciseId?: string): Estimated1RM[] | undefined {
  return useLiveQuery(
    () =>
      exerciseId
        ? db.estimated1RMs.where("exerciseId").equals(exerciseId).sortBy("date")
        : db.estimated1RMs.orderBy("date").toArray(),
    [exerciseId]
  );
}

/** Runs, newest first. */
export function useRuns(): RunLog[] | undefined {
  return useLiveQuery(() => db.runs.orderBy("date").reverse().toArray(), []);
}
