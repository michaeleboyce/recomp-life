"use client";

import { useParams, useRouter } from "next/navigation";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { WorkoutDetail } from "@/components/LogEdit";
import { SessionPRCallout } from "@/components/Log/SessionPRCallout";
import { WhatItDid } from "@/components/Log/WhatItDid";

/** One logged workout: every set, editable, and what it did to each lift at the time. */
export default function LogWorkoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params?.id ?? "");

  return (
    <PageShell className="space-y-6">
      <PageHeader title="Workout" backHref="/log" />
      <WorkoutDetail workoutId={id} onDeleted={() => router.push("/log")} />
      <SessionPRCallout workoutId={id} />
      <WhatItDid workoutId={id} />
    </PageShell>
  );
}
