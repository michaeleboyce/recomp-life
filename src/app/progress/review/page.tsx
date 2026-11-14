"use client";

import { Suspense } from "react";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { WeeklyReviewScreen } from "@/components/Review/WeeklyReviewScreen";

// Client page: the week comes from useSearchParams inside Suspense, so a static
// export never needs the search params at build time.
export default function WeeklyReviewPage() {
  return (
    <PageShell className="space-y-4">
      <PageHeader title="Weekly review" backHref="/progress" />
      <Suspense fallback={<SkeletonCard />}>
        <WeeklyReviewScreen />
      </Suspense>
    </PageShell>
  );
}
