"use client";

import { Suspense } from "react";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ProgressHub } from "@/components/Progress/ProgressHub";

// The "Weekly review" link (/progress/review) is added with that page.
export default function ProgressPage() {
  return (
    <PageShell className="space-y-4">
      <PageHeader title="Progress" />
      <Suspense fallback={<SkeletonCard />}>
        <ProgressHub />
      </Suspense>
    </PageShell>
  );
}
