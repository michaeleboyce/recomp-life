import { useMemo } from "react";
import { useLiftTimeline } from "@/hooks";
import type { RangeKey } from "@/lib/metrics/types";
import { liftEstimate, type LiftEstimate } from "./strength";

/**
 * A lift's number where it is shown on its own (Today's lift tiles): `liftEstimate`
 * over the same timeline the lift page headline reads (`useLiftTimeline`, imported
 * sessions included), so both show the planner's pooled estimate. Null when the lift has
 * no estimate; `undefined` while loading.
 */
export function useLiftEstimate(liftId: string, window: RangeKey): LiftEstimate | null | undefined {
  const timeline = useLiftTimeline(liftId);
  return useMemo(() => (timeline === undefined ? undefined : liftEstimate(timeline, window)), [timeline, window]);
}
