"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, House, LineChart } from "lucide-react";
import { useLiftAdjustments } from "@/hooks";
import type { RangeKey } from "@/lib/metrics/types";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/nav/BackButton";
import { EmptyState } from "@/components/ui/empty-state";
import { ExerciseImage, hasExercisePhoto } from "@/components/ui/exercise-image";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/term";
import { WorkoutFigure } from "@/components/ui/workout-figure";
import { AdjustLiftSheet } from "@/components/LogEdit";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import { displayLiftName, nameInSentence, photoPosition } from "@/components/Today/todayModel";
import { homeNextSession } from "./homeVersion";
import { LiftHeadline } from "./LiftHeadline";
import { LiftStats, ProjectionLink } from "./LiftStats";
import { MoreCharts } from "./MoreCharts";
import { HomeNextWeight } from "./PrLine";
import { SessionList } from "./SessionList";
import { useHomePlanContext } from "./useHomePlanContext";
import { useLiftView } from "./useLiftView";
import { WeightChanges } from "./WeightChanges";

const EYEBROW = "font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-primary";

/** Clear over the photo, then the page colour under the name. */
const BANNER_FADE =
  "bg-[linear-gradient(180deg,transparent_0%,transparent_45%,color-mix(in_srgb,var(--background)_80%,transparent)_80%,var(--background)_100%)]";

/**
 * The lift page opened as a home version (`?as=`), e.g. a Bulgarian split squat tapped
 * on Today at home: the page is that exercise's. Its name, photo (or muscle figure)
 * and form link head it; then its next session at the weight Today shows, its own
 * sessions, and last the program lift's progress, which the home sessions count toward.
 */
export function HomeVersionDetail({
  exerciseId,
  substituteId,
  backHref,
}: {
  exerciseId: MainLiftId;
  substituteId: string;
  backHref: string;
}) {
  const plan = useHomePlanContext();
  const adjustments = useLiftAdjustments(exerciseId);
  const [range, setRange] = useState<RangeKey>("3m");
  const view = useLiftView(exerciseId, range);

  const { label, short } = LIFT_NAMES[exerciseId];
  const title = displayLiftName(substituteId);
  const inSentence = nameInSentence(substituteId);

  // From the plan, as Today builds it: the home exercise's own weight, its seed or re-entry.
  const next = useMemo(
    () => (plan ? homeNextSession(exerciseId, substituteId, plan) : undefined),
    [plan, exerciseId, substituteId]
  );

  const homeSessions = useMemo(
    () => view?.sessions.filter((s) => s.substituteExerciseId === substituteId) ?? [],
    [view, substituteId]
  );

  const header = (
    <HomeHeader
      substituteId={substituteId}
      title={title}
      eyebrow={`Home version of ${label}`}
      backHref={backHref}
    />
  );

  if (!view || !next || !plan) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <SkeletonCard />
      </div>
    );
  }

  const hasData = view.metrics.e1rm.full.points.length > 0 || view.sessions.length > 0;
  const name = `Barbell ${short}`;

  return (
    <div className="flex flex-col gap-6">
      {header}

      {/* The sheet edits this exercise's own weight; the barbell lift is left alone. */}
      <section aria-label="Next session" className="flex flex-col gap-2">
        <SectionHeader title="Next session at home" />
        <HomeNextWeight
          exerciseId={exerciseId}
          substituteId={substituteId}
          liftShort={short}
          next={next}
          equipment={plan.equipment}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            Wrong weight for next time? Set the {inSentence} weight; the barbell {short} stays as it is.
          </p>
          <AdjustLiftSheet exerciseId={exerciseId} home={{ substituteId, tier: next.tier }} />
        </div>
      </section>

      <SessionList
        sessions={homeSessions}
        title={`${title} sessions`}
        homeOnly
        empty={`No ${title} sessions yet. They will appear here and count toward your ${short}.`}
      />

      <section aria-label={`${label} progress`} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <SectionHeader
            title={`${label} progress`}
            action={
              <Link
                href={`/progress/lift/${exerciseId}`}
                className="-my-3 flex min-h-11 items-center gap-0.5 font-bold text-accent-primary"
              >
                Open {label}
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <p data-testid="progress-note" className="text-[13px] text-muted-foreground">
            Home sessions keep {short} progression going, while the <Term id="e1rm">estimated 1RM</Term>{" "}
            comes from barbell {short} sets.
          </p>
        </div>
        {hasData ? (
          <>
            <LiftHeadline
              e1rm={view.metrics.e1rm}
              liftName={name}
              subject={name}
              range={range}
              onRangeChange={setRange}
            />
            <LiftStats stats={view.stats} />
            <ProjectionLink exerciseId={exerciseId} teaser={view.teaser} />
            <MoreCharts metrics={view.metrics} liftName={name} />
            <WeightChanges adjustments={adjustments} />
            <SessionList sessions={view.sessions} title={`All ${short} sessions`} />
          </>
        ) : (
          <>
            <EmptyState
              icon={<LineChart />}
              title={`No ${short} sessions yet`}
              body="Log a workout with this lift and its estimated 1RM, stats and every set show up here."
            />
            <WeightChanges adjustments={adjustments} />
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Back and "Form and muscles" on top; under them the exercise's photo with the
 * eyebrow and name over its foot, or, with no photo, the name beside its muscle figure.
 */
function HomeHeader({
  substituteId,
  title,
  eyebrow,
  backHref,
}: {
  substituteId: string;
  title: string;
  eyebrow: string;
  backHref: string;
}) {
  const photo = hasExercisePhoto(substituteId);
  const heading = (
    <div className="flex min-w-0 flex-col gap-1">
      <span data-testid="home-eyebrow" className={cn(EYEBROW, "flex items-center gap-1.5")}>
        <House className="size-3.5 shrink-0" aria-hidden="true" />
        {eyebrow}
      </span>
      <h1 className="font-display text-[30px] leading-[1.05] font-extrabold text-foreground">{title}</h1>
    </div>
  );

  return (
    <header data-testid="home-version" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback={backHref} />
        <Link href={`/exercises/${substituteId}`} className="py-3 text-[13px] font-bold text-accent-primary">
          Form and muscles
        </Link>
      </div>
      {photo ? (
        <div className="relative h-[230px] overflow-hidden rounded-2xl">
          <ExerciseImage
            exerciseId={substituteId}
            variant="hero"
            fade={false}
            // Framed as on Today's photo, where the user saw it before tapping.
            position={photoPosition(substituteId, "hero")}
            className="absolute inset-0 aspect-auto h-full"
          />
          <span aria-hidden="true" className={cn("absolute inset-0", BANNER_FADE)} />
          <div className="absolute inset-x-4 bottom-3">{heading}</div>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3 rounded-2xl bg-card p-4">
          {heading}
          <WorkoutFigure exerciseIds={[substituteId]} className="h-[120px] shrink-0" />
        </div>
      )}
    </header>
  );
}
