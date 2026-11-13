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
import { SessionPRCallout } from "@/components/Log/SessionPRCallout";
import { WhatItDid } from "@/components/Log/WhatItDid";
import MusclesWorkedCard from "@/components/WorkoutSummary/MusclesWorkedCard";
import PostWorkoutBodyCheck from "@/components/WorkoutSummary/PostWorkoutBodyCheck";
import { useWorkout } from "@/hooks";

function DoneButton() {
  return (
    <Button asChild className="h-12 w-full text-base font-semibold">
      <Link href="/">Done</Link>
    </Button>
  );
}

function SummaryContent() {
  const sessionId = useSearchParams().get("sessionId");
  const workout = useWorkout(sessionId);

  if (!sessionId) {
    return <EmptyState title="No workout to show" body="Open a workout from the Log." action={<DoneButton />} />;
  }

  return (
    <div className="space-y-6">
      <WorkoutDetail workoutId={sessionId} />
      {workout && (
        <>
          <SessionPRCallout workoutId={sessionId} />
          <WhatItDid workoutId={sessionId} />
          <MusclesWorkedCard sets={workout.sets} />
          <PostWorkoutBodyCheck />
        </>
      )}
      <DoneButton />
    </div>
  );
}

/** Shown when a workout is finished: the same detail as the Log, plus a body check. */
export default function WorkoutSummaryPage() {
  return (
    <PageShell className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
            Workout complete
          </span>
        }
      />
      <Suspense fallback={<SkeletonCard />}>
        <SummaryContent />
      </Suspense>
    </PageShell>
  );
}
