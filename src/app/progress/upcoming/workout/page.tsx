"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { UpcomingWorkoutView } from "@/components/Upcoming/UpcomingWorkoutView";
import { parseLocation, parsePosition } from "@/components/Upcoming/upcomingView";

/**
 * One coming workout in full: `?n=<position>` (0 is the next workout) and
 * `?location=<gym|home>`; `?from=today` when opened from Today. A query, not a path
 * segment: the iPhone build is a static export.
 */
function UpcomingWorkoutFromUrl() {
  const params = useSearchParams();
  const position = parsePosition(params?.get("n") ?? "0");
  const location = parseLocation(params?.get("location"));
  const from = params?.get("from") === "today" ? "today" : null;
  return <UpcomingWorkoutView position={position ?? -1} location={location} from={from} />;
}

export default function UpcomingWorkoutPage() {
  return (
    // Suspense is required around useSearchParams in the static build.
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-lg flex-col gap-2.5 px-4 pt-[calc(4px+env(safe-area-inset-top))] pb-6">
          <Skeleton className="h-[150px] rounded-[18px]" />
        </div>
      }
    >
      <UpcomingWorkoutFromUrl />
    </Suspense>
  );
}
