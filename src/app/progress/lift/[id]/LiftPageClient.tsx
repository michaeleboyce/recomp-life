"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ExercisePage, exerciseBackHref } from "@/components/ExercisePage/ExercisePage";
import { validHomeSubstitute } from "@/components/Lift/homeVersion";
import { isMainLift } from "@/components/Progress/lifts";
import { exercisePageHref } from "@/components/Today/todayModel";

/**
 * The barbell lift's page, the same exercise page as `/exercises/<id>`. An old link
 * with `?as=<home version>` is replaced by that exercise's own page (E1, E10), keeping
 * `from`; an `as` that is not one of the lift's home versions is ignored. Query
 * parameters, not route segments: the iPhone build is static.
 */
function LiftPageContent() {
  const params = useParams<{ id: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const id = params?.id;
  const from = query?.get("from");
  const homeId = isMainLift(id) ? validHomeSubstitute(id, query?.get("as")) : undefined;

  useEffect(() => {
    if (homeId) router.replace(exercisePageHref(homeId, from === "today" ? { from: "today" } : {}));
  }, [homeId, from, router]);

  if (!isMainLift(id)) {
    return (
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
  if (homeId) return <SkeletonCard />;
  return <ExercisePage exerciseId={id} backHref={exerciseBackHref(from, "/progress")} />;
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
