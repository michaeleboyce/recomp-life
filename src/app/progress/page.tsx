"use client";

import { Suspense } from "react";
import Link from "next/link";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ProgressHub } from "@/components/Progress/ProgressHub";

export default function ProgressPage() {
  return (
    <PageShell className="space-y-4">
      <PageHeader
        title="Progress"
        action={
          <Link href="/progress/review" className="text-[13px] font-semibold text-primary">
            Weekly review
          </Link>
        }
      />
      <Suspense fallback={<SkeletonCard />}>
        <ProgressHub />
      </Suspense>
    </PageShell>
  );
}
