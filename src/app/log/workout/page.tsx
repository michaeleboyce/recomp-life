"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { backTarget } from "@/components/nav/backTarget";
import { useGoBack } from "@/components/nav/useNavHistory";
import { WorkoutDetail } from "@/components/LogEdit";
import { FavoriteStar } from "@/components/Favorites/FavoriteStar";
import { SessionPRCallout } from "@/components/Log/SessionPRCallout";
import { WhatItDid } from "@/components/Log/WhatItDid";

function LogWorkout() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  // Back goes to the previous screen; with none, to the Log unless a known `from`
  // says otherwise. Deleting the workout leaves the same way.
  const back = backTarget(params.get("from"), "log");
  const goBack = useGoBack(back.href);

  return (
    <PageShell className="space-y-6">
      <PageHeader title="Workout" backHref={back.href} />
      <WorkoutDetail
        workoutId={id}
        headerExtra={<FavoriteStar sessionId={id} />}
        onDeleted={goBack}
      />
      <SessionPRCallout workoutId={id} />
      <WhatItDid workoutId={id} />
    </PageShell>
  );
}

/**
 * /log/workout?id=<id>: one logged workout, every set, editable, and what it did
 * to each lift at the time. The id is in the query string so the page can be part
 * of the iPhone app's static build (see src/lib/routes.ts).
 */
export default function LogWorkoutPage() {
  return (
    // Reading the query string suspends while the page is prerendered.
    <Suspense fallback={null}>
      <LogWorkout />
    </Suspense>
  );
}
