import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { buildAdjustmentFeed, undoAdjustment } from "@/lib/adjustments";
import type { AdjustmentFeedInput, AdjustmentUndo } from "@/lib/adjustments";
import { rebuildDerived } from "@/lib/rebuild";
import type { AdjustmentEntry } from "@/types";
import { useCoachEvents } from "./useCoachEvents";
import { useForecasts } from "./useForecasts";
import { useSettings } from "./useProfile";

export interface AdjustmentFeed {
  /** Newest first, the order `buildAdjustmentFeed` returns. */
  entries: AdjustmentEntry[];
  /** What undoing an entry would record, or null when it can no longer be undone. */
  undoFor: (entry: AdjustmentEntry) => AdjustmentUndo | null;
}

/**
 * The adjustment log: every change to the plan, a forecast or a rule, with its reason.
 * `undefined` while the first read is loading. Assembled from the same rows the
 * rebuild reads, so the log and the lift states cannot disagree.
 */
export function useAdjustmentFeed(): AdjustmentFeed | undefined {
  const rows = useLiveQuery(
    async () => ({
      workouts: await db.workouts.toArray(),
      adjustments: await db.liftAdjustments.toArray(),
    }),
    []
  );
  const settings = useSettings();
  const forecasts = useForecasts();
  const coachEvents = useCoachEvents();

  return useMemo(() => {
    if (!rows || settings === undefined || !forecasts || !coachEvents) return undefined;
    const rebuild = rebuildDerived({
      workouts: rows.workouts,
      adjustments: rows.adjustments,
      settings: settings ?? DEFAULT_USER_PROFILE.settings,
    });
    const input: AdjustmentFeedInput = {
      workouts: rows.workouts,
      adjustments: rows.adjustments,
      rebuild,
      forecasts,
      coachEvents,
    };
    return {
      entries: buildAdjustmentFeed(input),
      undoFor: (entry) =>
        entry.undo ? undoAdjustment(input, entry.undo.adjustmentId) : null,
    };
  }, [rows, settings, forecasts, coachEvents]);
}
