"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { WorkoutDetail } from "@/components/LogEdit";
import { FavoriteStar } from "@/components/Favorites/FavoriteStar";
import { SessionPRCallout } from "@/components/Log/SessionPRCallout";
import { DoneHero } from "@/components/WorkoutSummary/DoneHero";
import { ForecastAgainstResult } from "@/components/WorkoutSummary/ForecastAgainstResult";
import MusclesWorkedCard from "@/components/WorkoutSummary/MusclesWorkedCard";
import PostWorkoutBodyCheck from "@/components/WorkoutSummary/PostWorkoutBodyCheck";
import { WhatItChanged } from "@/components/WorkoutSummary/WhatItChanged";
import { useWorkout } from "@/hooks";

const CTA =
  "flex h-[58px] items-center justify-center rounded-full font-display text-[17px] leading-none font-extrabold tracking-[0.14em] uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function DoneButton() {
  return (
    <Button asChild className="h-12 w-full text-base font-semibold">
      <Link href="/">Done</Link>
    </Button>
  );
}

function CompleteHeader() {
  return (
    <PageHeader
      title={
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          Workout complete
        </span>
      }
    />
  );
}

function SummaryContent() {
  const sessionId = useSearchParams().get("sessionId");
  const workout = useWorkout(sessionId);

  if (!sessionId) {
    return (
      <>
        <CompleteHeader />
        <EmptyState
          title="No workout to show"
          body="Open a workout from the Log."
          action={
            <div className="flex w-full flex-col gap-2">
              <Button asChild variant="outline" className="h-12 w-full text-base font-semibold">
                <Link href="/log">Open the Log</Link>
              </Button>
              <DoneButton />
            </div>
          }
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {workout ? <DoneHero workout={workout} /> : <CompleteHeader />}
      {workout && (
        <>
          <ForecastAgainstResult workoutId={sessionId} />
          <WhatItChanged workoutId={sessionId} />
        </>
      )}
      <WorkoutDetail workoutId={sessionId} headerExtra={<FavoriteStar sessionId={sessionId} />} />
      {workout && (
        <>
          <SessionPRCallout workoutId={sessionId} />
          <MusclesWorkedCard sets={workout.sets} />
          <PostWorkoutBodyCheck />
        </>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
        <Link href="/log" className={`${CTA} bg-secondary text-secondary-foreground`}>
          Full log
        </Link>
        <Link href="/" className={`${CTA} bg-primary text-primary-foreground`}>
          Done
        </Link>
      </div>
    </div>
  );
}

/**
 * Shown when a workout is finished: the day, done; every forecast made at start
 * against what happened; what the program changed and why, with the grade of each
 * rule; then the same detail as the Log, and a body check.
 */
export default function WorkoutSummaryPage() {
  return (
    <PageShell className="space-y-4">
      <Suspense fallback={<SkeletonCard />}>
        <SummaryContent />
      </Suspense>
    </PageShell>
  );
}
