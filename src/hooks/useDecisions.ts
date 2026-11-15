// Read hooks for the decision traces: live for the next workout, and as saved for a
// workout that has started. The explain functions live in src/lib/trace.
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { nextWorkoutFrom, readinessTodayFrom, traceContextFrom } from "@/lib/data/forecasts";
import { DECISIONS, explainDecision } from "@/lib/trace";
import type { DecisionKind, DecisionTrace, StoredTrace, Tier, WorkoutLocation } from "@/types";
import { liveRow } from "./liveRows";
import { useLedgerRecords } from "./useLedgerRecords";

/**
 * How the app reached one number of the next workout, worked out live: the weight of
 * a lift by default, or its sets and reps, rest or home substitute (`kind`). The
 * accessory limit is about the session, not a lift; for it `exerciseId` and `tier`
 * are ignored. `location` is where the workout would be done (the saved default when
 * omitted).
 *
 * `undefined` while loading; `null` when the next workout does not have that lift at
 * that tier. Once a workout has started, show what was saved with it instead
 * (`useStoredDecisions`): that text never changes.
 */
export function useDecisionTrace(input: {
  exerciseId: string;
  tier: Tier;
  kind?: DecisionKind;
  location?: WorkoutLocation;
}): DecisionTrace | null | undefined {
  const records = useLedgerRecords();
  const { exerciseId, tier, kind = "weight", location } = input;

  return useMemo(() => {
    if (!records) return undefined;
    const now = records.readAt;
    const next = nextWorkoutFrom(records, location);
    const entry = next.plan.find(
      (candidate) =>
        !candidate.isWarmUp && candidate.exerciseId === exerciseId && candidate.tier === tier
    );
    const forSession = DECISIONS[kind].scope === "session";
    if (!entry && !forSession) return null;

    const readiness = readinessTodayFrom(records, { now, location });
    const context = traceContextFrom(records, {
      now,
      location: location ?? records.settings.defaultLocation ?? "gym",
      liftStates: records.liftStates,
      readiness: readiness ? { score: readiness.score } : undefined,
    });
    return explainDecision(kind, context, entry, next.plan);
  }, [records, exerciseId, tier, kind, location]);
}

/**
 * The traces saved when a workout started (weight and rest for each planned lift),
 * exactly as they were shown then; read one with `findStoredDecision` from
 * src/lib/trace. `undefined` while loading; `null` when the workout is missing or
 * deleted, has none saved (it was started before traces were kept), or no id is given.
 */
export function useStoredDecisions(
  workoutId: string | null | undefined
): StoredTrace[] | null | undefined {
  return useLiveQuery(async () => {
    if (!workoutId) return null;
    return liveRow(await db.workouts.get(workoutId))?.decisions ?? null;
  }, [workoutId]);
}
