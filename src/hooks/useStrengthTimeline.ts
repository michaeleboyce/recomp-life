import { useMemo, useState } from "react";
import {
  muscleTimeline,
  strengthTimeline,
  type MuscleStrengthIndex,
  type StrengthSet,
  type StrengthTimeline,
} from "@/lib/strength";
import type { MuscleId } from "@/types";
import { useStrengthEvidence } from "./useStrengthEvidence";

/**
 * Timelines worked out per evidence array and lift, so every screen holding the same
 * array (and every re-render) reuses them. Keyed weakly: a new array replaces the old.
 */
const liftCache = new WeakMap<readonly StrengthSet[], Map<string, StrengthTimeline>>();
const withoutImportedCache = new WeakMap<readonly StrengthSet[], StrengthSet[]>();

/** `strengthTimeline` for (sets, lift), worked out once per evidence array. */
export function liftTimelineFor(sets: readonly StrengthSet[], liftId: string, now: number): StrengthTimeline {
  let byLift = liftCache.get(sets);
  if (!byLift) liftCache.set(sets, (byLift = new Map()));
  let timeline = byLift.get(liftId);
  if (!timeline) byLift.set(liftId, (timeline = strengthTimeline(liftId, sets, { now })));
  return timeline;
}

/** The evidence with sessions imported from other apps left out (cached per array). */
export function withoutImported(sets: readonly StrengthSet[]): StrengthSet[] {
  let out = withoutImportedCache.get(sets);
  if (!out) withoutImportedCache.set(sets, (out = sets.filter((s) => !s.imported)));
  return out;
}

/**
 * A lift's strength timeline (dots by source, the planner's estimate as anchor) over the
 * evidence the plans read (`useStrengthEvidence`). With `includeImported` false,
 * imported sessions are left out, as when the lift page hides imported history.
 * `undefined` while loading.
 */
export function useLiftTimeline(liftId: string, includeImported = true): StrengthTimeline | undefined {
  const sets = useStrengthEvidence();
  const [now] = useState(() => Date.now());
  return useMemo(() => {
    if (sets === undefined) return undefined;
    return liftTimelineFor(includeImported ? sets : withoutImported(sets), liftId, now);
  }, [sets, liftId, includeImported, now]);
}

/** Every main lift's timeline from one evidence array (the Strength tab's total). */
export function useLiftTimelines(liftIds: readonly string[]): StrengthTimeline[] | undefined {
  const sets = useStrengthEvidence();
  const [now] = useState(() => Date.now());
  const key = liftIds.join(",");
  return useMemo(() => {
    if (sets === undefined) return undefined;
    return key.split(",").filter(Boolean).map((id) => liftTimelineFor(sets, id, now));
  }, [sets, key, now]);
}

/**
 * A muscle's timeline from the index the Muscles tab shows (`index`, so the chart's
 * latest value is the row's number); the evidence only marks imported sessions.
 */
export function useMuscleTimeline(muscle: MuscleId, index: MuscleStrengthIndex): StrengthTimeline | undefined {
  const sets = useStrengthEvidence();
  const [now] = useState(() => Date.now());
  return useMemo(
    () => (sets === undefined ? undefined : muscleTimeline(muscle, index, sets, { now })),
    [muscle, index, sets, now]
  );
}
