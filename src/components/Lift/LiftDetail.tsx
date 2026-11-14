"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { useLiftAdjustments, useMetricSource } from "@/hooks";
import { EXERCISES } from "@/lib/exercises";
import type { RangeKey } from "@/lib/metrics/types";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { AdjustLiftSheet } from "@/components/LogEdit";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import { LiftHeadline } from "./LiftHeadline";
import { LiftStats, ProjectionLink } from "./LiftStats";
import { MoreCharts } from "./MoreCharts";
import { PrLine } from "./PrLine";
import { SessionList } from "./SessionList";
import { WeightChanges } from "./WeightChanges";
import { liftMetrics, liftStats, liftTeaser, nextT1Opportunity } from "./liftSeries";
import { liftSessions } from "./sessions";

/**
 * Lift detail: e1RM headline and chart, next session's weight with "Adjust weight",
 * stats, more charts, the dated weight changes and the sessions.
 */
export function LiftDetail({ exerciseId }: { exerciseId: MainLiftId }) {
  const source = useMetricSource();
  const adjustments = useLiftAdjustments(exerciseId);
  const [range, setRange] = useState<RangeKey>("3m");
  const [now] = useState(() => Date.now());
  const name = EXERCISES[exerciseId]?.name ?? LIFT_NAMES[exerciseId].label;

  const view = useMemo(() => {
    if (!source) return undefined;
    const metrics = liftMetrics(source, exerciseId, range, now);
    const liftState = source.liftStates.find((s) => s.exerciseId === exerciseId);
    const best = metrics.e1rm.full.points.reduce<number | null>(
      (max, p) => (max === null || p.v > max ? p.v : max),
      null
    );
    return {
      metrics,
      stats: liftStats(metrics),
      next: nextT1Opportunity(exerciseId, liftState, best),
      // The whole history, so the figure matches the projection screen and does not
      // move with the range tab.
      teaser: liftTeaser(source, exerciseId, metrics.e1rm.full.points, now),
      sessions: liftSessions(source.workouts, source.e1rms, exerciseId),
    };
  }, [source, exerciseId, range, now]);

  const header = (
    <PageHeader
      title={name}
      backHref="/progress"
      action={
        <Link href={`/exercises/${exerciseId}`} className="py-3 text-[13px] font-bold text-accent-primary">
          Form and muscles
        </Link>
      }
    />
  );

  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <SkeletonCard />
      </div>
    );
  }

  const hasData = view.metrics.e1rm.full.points.length > 0 || view.sessions.length > 0;
  const short = LIFT_NAMES[exerciseId].short;

  // The next session's weight, and the way to change it, belong together.
  const nextSession = (opportunity: typeof view.next.opportunity) => (
    <section aria-label="Next session" className="flex flex-col gap-2">
      <PrLine liftShort={short} weight={view.next.weight} opportunity={opportunity} />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          Wrong weight for next time? Set it yourself.
        </p>
        <AdjustLiftSheet exerciseId={exerciseId} />
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-5">
      {header}
      {hasData ? (
        <>
          <LiftHeadline e1rm={view.metrics.e1rm} liftName={name} range={range} onRangeChange={setRange} />
          {nextSession(view.next.opportunity)}
          <LiftStats stats={view.stats} />
          <ProjectionLink exerciseId={exerciseId} teaser={view.teaser} />
          <MoreCharts metrics={view.metrics} liftName={name} />
          <WeightChanges adjustments={adjustments} />
          <SessionList sessions={view.sessions} />
        </>
      ) : (
        <>
          <EmptyState
            icon={<LineChart />}
            title={`No ${short} sessions yet`}
            body="Log a workout with this lift and its estimated 1RM, stats and every set show up here."
          />
          {nextSession(null)}
          <WeightChanges adjustments={adjustments} />
        </>
      )}
    </div>
  );
}
