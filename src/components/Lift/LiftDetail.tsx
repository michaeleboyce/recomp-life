"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { House, LineChart } from "lucide-react";
import { useLiftAdjustments, useMetricSource, useSettings } from "@/hooks";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { EXERCISES } from "@/lib/exercises";
import type { RangeKey } from "@/lib/metrics/types";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { AdjustLiftSheet } from "@/components/LogEdit";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import { displayLiftName, nameInSentence } from "@/components/Today/todayModel";
import { homeVersionWeight, isPerHand, validHomeSubstitute } from "./homeVersion";
import { LiftHeadline } from "./LiftHeadline";
import { LiftStats, ProjectionLink } from "./LiftStats";
import { MoreCharts } from "./MoreCharts";
import { PrLine, type HomeNext } from "./PrLine";
import { SessionList } from "./SessionList";
import { WeightChanges } from "./WeightChanges";
import { liftMetrics, liftStats, liftTeaser, nextT1Opportunity } from "./liftSeries";
import { liftSessions } from "./sessions";

/** Where the back link goes: Today when opened from there, else Progress. */
export function liftBackHref(from: string | null | undefined): string {
  return from === "today" ? "/" : "/progress";
}

/**
 * Lift detail: e1RM headline and chart, next session's weight with "Adjust weight",
 * stats, more charts, the dated weight changes and the sessions.
 *
 * `as` (from `?as=`) names a home substitute the user is looking at, e.g. a goblet
 * squat opened from Today at home. When it is one of this lift's substitutes, the
 * page keeps the lift's title and history but says the home version counts toward
 * it, gives the next session at the home weight and opens the substitute's form page.
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
  const source = useMetricSource();
  const settings = useSettings();
  const adjustments = useLiftAdjustments(exerciseId);
  const [range, setRange] = useState<RangeKey>("3m");
  const [now] = useState(() => Date.now());
  const name = EXERCISES[exerciseId]?.name ?? LIFT_NAMES[exerciseId].label;
  const homeId = validHomeSubstitute(exerciseId, as);
  const equipment = (settings ?? DEFAULT_USER_PROFILE.settings).equipment;

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

  const home: HomeNext | undefined =
    homeId && view
      ? {
          name: nameInSentence(homeId),
          weight: homeVersionWeight(exerciseId, homeId, view.next.weight, equipment),
          perHand: isPerHand(homeId),
        }
      : undefined;

  const header = (
    <div className="flex flex-col gap-1">
      <PageHeader
        title={name}
        backHref={liftBackHref(from)}
        action={
          <Link
            href={`/exercises/${homeId ?? exerciseId}`}
            className="py-3 text-[13px] font-bold text-accent-primary"
          >
            Form and muscles
          </Link>
        }
      />
      {homeId && (
        <p data-testid="home-version" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <House className="size-4 shrink-0 text-accent-primary" aria-hidden="true" />
          <span>
            At home: <b className="font-semibold text-foreground">{displayLiftName(homeId)}</b>. It
            counts toward {LIFT_NAMES[exerciseId].label}.
          </span>
        </p>
      )}
    </div>
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

  // The next session's weight, and the way to change it, belong together. The sheet
  // always edits the barbell weight; at home it says so, as the home weight follows.
  const nextSession = (opportunity: typeof view.next.opportunity) => (
    <section aria-label="Next session" className="flex flex-col gap-2">
      <PrLine
        liftShort={short}
        weight={view.next.weight}
        opportunity={home ? null : opportunity}
        home={home}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          {home
            ? `Wrong weight for next time? Set the barbell weight; the ${home.name} weight follows from it.`
            : "Wrong weight for next time? Set it yourself."}
        </p>
        <AdjustLiftSheet
          exerciseId={exerciseId}
          weightHint={
            home ? `The barbell weight. At home the ${home.name} weight follows from it.` : undefined
          }
        />
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
