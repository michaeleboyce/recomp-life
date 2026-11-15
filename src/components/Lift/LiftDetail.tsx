"use client";

import { useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { useLiftAdjustments } from "@/hooks";
import { EXERCISES } from "@/lib/exercises";
import type { RangeKey } from "@/lib/metrics/types";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { AdjustLiftSheet } from "@/components/LogEdit";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import { validHomeSubstitute } from "./homeVersion";
import { HomeVersionDetail } from "./HomeVersionDetail";
import { LiftHeadline } from "./LiftHeadline";
import { LiftStats, ProjectionLink } from "./LiftStats";
import { MoreCharts } from "./MoreCharts";
import { PrLine } from "./PrLine";
import { SessionList } from "./SessionList";
import { useLiftView } from "./useLiftView";
import { WeightChanges } from "./WeightChanges";

/** Where the back link goes: Today when opened from there, else Progress. */
export function liftBackHref(from: string | null | undefined): string {
  return from === "today" ? "/" : "/progress";
}

/**
 * Lift detail: e1RM headline and chart, next session's weight with "Adjust weight",
 * stats, more charts, the dated weight changes and the sessions.
 *
 * `as` (from `?as=`) names a home substitute the user is looking at, e.g. a Bulgarian
 * split squat opened from Today at home. When it is one of this lift's substitutes
 * the page is that exercise's (`HomeVersionDetail`); any other `as` is ignored.
 */
export function LiftDetail({
  exerciseId,
  as,
  from,
}: {
  exerciseId: MainLiftId;
  as?: string | null;
  from?: string | null;
}) {
  const homeId = validHomeSubstitute(exerciseId, as);
  return homeId ? (
    <HomeVersionDetail exerciseId={exerciseId} substituteId={homeId} backHref={liftBackHref(from)} />
  ) : (
    <ProgramLiftDetail exerciseId={exerciseId} from={from} />
  );
}

function ProgramLiftDetail({ exerciseId, from }: { exerciseId: MainLiftId; from?: string | null }) {
  const adjustments = useLiftAdjustments(exerciseId);
  const [range, setRange] = useState<RangeKey>("3m");
  const view = useLiftView(exerciseId, range);
  const name = EXERCISES[exerciseId]?.name ?? LIFT_NAMES[exerciseId].label;

  const header = (
    <PageHeader
      title={name}
      backHref={liftBackHref(from)}
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
        <p className="min-w-0 text-xs text-muted-foreground">Wrong weight for next time? Set it yourself.</p>
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
