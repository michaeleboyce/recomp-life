"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { LiftDetail } from "@/components/Lift/LiftDetail";
import { isMainLift } from "@/components/Progress/lifts";

/**
 * `?as=<substituteId>` shows the lift as its home substitute; `?from=today` sends the
 * back link to Today. Query parameters, not route segments: the iPhone build is static.
 */
function LiftPageContent() {
  const params = useParams<{ id: string }>();
  const query = useSearchParams();
  const id = params?.id;

  return isMainLift(id) ? (
    <LiftDetail exerciseId={id} as={query?.get("as")} from={query?.get("from")} />
  ) : (
    <EmptyState
      icon={<SearchX />}
      title="No such lift"
      body="Lift pages cover squat, bench press, deadlift and overhead press."
      action={
        <Button asChild variant="outline">
          <Link href="/progress">Back to Progress</Link>
        </Button>
      }
    />
  );
}

export function LiftPageClient() {
  return (
    <PageShell>
      {/* Suspense is required around useSearchParams. */}
      <Suspense fallback={<SkeletonCard />}>
        <LiftPageContent />
      </Suspense>
    </PageShell>
  );
}
