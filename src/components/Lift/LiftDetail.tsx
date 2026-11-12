"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { useMetricSource } from "@/hooks";
import { EXERCISES } from "@/lib/exercises";
import type { RangeKey } from "@/lib/metrics/types";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import { LiftHeadline } from "./LiftHeadline";
import { LiftStats, ProjectionLink } from "./LiftStats";
import { MoreCharts } from "./MoreCharts";
import { PrLine } from "./PrLine";
import { SessionList } from "./SessionList";
import { liftMetrics, liftStats, nextT1Opportunity, projectionTeaser } from "./liftSeries";
import { liftSessions } from "./sessions";

/** Lift detail: e1RM headline and chart, next PR chance, stats, more charts, sessions. */
export function LiftDetail({ exerciseId }: { exerciseId: MainLiftId }) {
  const source = useMetricSource();
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
      teaser: projectionTeaser(metrics.e1rm.series.points, now),
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

  return (
    <div className="flex flex-col gap-5">
      {header}
      {hasData ? (
        <>
          <LiftHeadline e1rm={view.metrics.e1rm} liftName={name} range={range} onRangeChange={setRange} />
          <PrLine
            liftShort={LIFT_NAMES[exerciseId].short}
            weight={view.next.weight}
            opportunity={view.next.opportunity}
          />
          <LiftStats stats={view.stats} />
          <ProjectionLink exerciseId={exerciseId} teaser={view.teaser} />
          <MoreCharts metrics={view.metrics} liftName={name} />
          <SessionList sessions={view.sessions} />
        </>
      ) : (
        <>
          <EmptyState
            icon={<LineChart />}
            title={`No ${LIFT_NAMES[exerciseId].short} sessions yet`}
            body="Log a workout with this lift and its estimated 1RM, stats and every set show up here."
          />
          <PrLine liftShort={LIFT_NAMES[exerciseId].short} weight={view.next.weight} opportunity={null} />
        </>
      )}
    </div>
  );
}
