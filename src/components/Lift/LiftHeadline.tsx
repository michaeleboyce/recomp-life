"use client";

import { useCallback, useEffect } from "react";
import { TrendChartSkeleton } from "@/components/chart-kit";
import { StrengthTrendPanel } from "@/components/StrengthTrend/StrengthTrendPanel";
import { Term } from "@/components/ui/term";
import { useLiftTimeline } from "@/hooks";
import type { RangeKey } from "@/lib/metrics/types";
import type { WindowSpan } from "@/lib/metrics/window";
import { liftWindowKey, useChartSpan, useChartWindowStore } from "@/stores/chartWindowStore";
import type { RangedMetric } from "./liftSeries";

/**
 * "Estimated 1RM": the planner's estimate (`pooledLiftEstimate` over every session the
 * plans read), the smooth line's change over the window, and the estimated-max chart:
 * the line, the sessions behind it by source (this lift, imported, related exercises
 * through their ratios), the today marker and the strip of what carries it (M4 to M7).
 * The window is the page's: presets go through `onRangeChange` and a zoom through the
 * chart window store, which the page's stats read too (`useLiftView`).
 *
 * `e1rm` is the page's estimated-max series; the chart reads the lift id from it and,
 * when it holds no imported points while the lift has imported sessions, leaves the
 * imported history out (the page's "Show imported history" switch). `subject` names
 * whose estimate it is when the page is about something else, e.g. "Barbell squat"
 * under a home version.
 */
export function LiftHeadline({
  e1rm,
  liftName,
  range,
  onRangeChange,
  subject,
}: {
  e1rm: RangedMetric;
  liftName: string;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  subject?: string;
}) {
  const liftId = e1rm.full.params.exerciseId ?? "";
  const full = useLiftTimeline(liftId, true);
  const importedShown = e1rm.full.points.some((p) => p.imported);
  const hasImported = full?.points.some((p) => p.sourceId === "imported") ?? false;
  const hideImported = hasImported && !importedShown;
  const shown = useLiftTimeline(liftId, !hideImported);

  const key = liftWindowKey(liftId);
  const span = useChartSpan(key);
  const setSpan = useChartWindowStore((s) => s.setSpan);
  const onSpanChange = useCallback((next: WindowSpan | null) => setSpan(key, next), [setSpan, key]);
  // A zoom lasts while the page is open.
  useEffect(() => () => setSpan(key, null), [setSpan, key]);

  const timeline = hideImported ? shown : full;
  const ownDots = timeline?.points.filter((p) => (p.sourceId === "own" || p.sourceId === "imported") && p.t <= timeline.now);
  const latestOwnImported = ownDots && ownDots.length > 0 ? ownDots[ownDots.length - 1].imported : false;
  const withImported = full?.anchor?.value;
  const note =
    hideImported && withImported !== undefined && withImported !== timeline?.anchor?.value
      ? `Imported history is hidden here. With it, which is what the plan uses, the estimate is ${withImported} lbs.`
      : undefined;

  return (
    <section className="flex flex-col gap-1.5" aria-label="Estimated 1RM">
      {timeline === undefined ? (
        <TrendChartSkeleton height={200} />
      ) : (
        <StrengthTrendPanel
          timeline={timeline}
          range={range}
          onRangeChange={onRangeChange}
          span={span}
          onSpanChange={onSpanChange}
          title={
            <>
              {subject && <span className="font-semibold text-foreground">{subject} · </span>}
              <Term id="e1rm">Estimated 1RM</Term>
            </>
          }
          titleExtra={
            latestOwnImported ? (
              <span data-testid="e1rm-latest-imported" className="font-semibold">
                {" · "}Imported
              </span>
            ) : undefined
          }
          note={note}
          ariaLabel={`${liftName} estimated 1RM over time`}
          anchorLabel="Plan"
          anchorTestId="e1rm-latest"
          changeTestId="e1rm-change"
          emptyMessage="No estimates in this window"
        />
      )}
    </section>
  );
}
