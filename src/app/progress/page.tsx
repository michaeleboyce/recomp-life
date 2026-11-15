"use client";

import { Suspense } from "react";
import Link from "next/link";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { Stripes } from "@/components/ui/stripes";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ProgressHub } from "@/components/Progress/ProgressHub";

export default function ProgressPage() {
  return (
    <PageShell className="space-y-4">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Progress"
          action={
            <Link
              href="/progress/review"
              className="inline-flex min-h-11 items-center px-1 text-[13px] font-semibold text-primary"
            >
              Weekly review
            </Link>
          }
        />
        <Stripes />
      </div>
      <Suspense fallback={<SkeletonCard />}>
        <ProgressHub />
      </Suspense>
    </PageShell>
  );
}
