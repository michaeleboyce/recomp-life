"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { WorkoutDetail } from "@/components/LogEdit";
import { FavoriteStar } from "@/components/Favorites/FavoriteStar";
import { SessionPRCallout } from "@/components/Log/SessionPRCallout";
import { WhatItDid } from "@/components/Log/WhatItDid";

function LogWorkout() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";

  return (
    <PageShell className="space-y-6">
      <PageHeader title="Workout" backHref="/log" />
      <WorkoutDetail
        workoutId={id}
        headerExtra={<FavoriteStar sessionId={id} />}
        onDeleted={() => router.push("/log")}
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
