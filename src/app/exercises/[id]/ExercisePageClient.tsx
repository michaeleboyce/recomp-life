"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ExercisePage, exerciseBackHref } from "@/components/ExercisePage/ExercisePage";

/** `?from=today` sends the back link to Today; a query parameter because the iPhone build is static. */
function ExercisePageContent({ exerciseId }: { exerciseId: string }) {
  const query = useSearchParams();
  return <ExercisePage exerciseId={exerciseId} backHref={exerciseBackHref(query?.get("from"), "/exercises")} />;
}

export function ExercisePageClient({ exerciseId }: { exerciseId: string }) {
  return (
    <PageShell>
      {/* Suspense is required around useSearchParams. */}
      <Suspense fallback={<SkeletonCard />}>
        <ExercisePageContent exerciseId={exerciseId} />
      </Suspense>
    </PageShell>
  );
}
