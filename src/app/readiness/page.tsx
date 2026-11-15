"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { backTarget, type BackTarget } from "@/components/nav/backTarget";
import { readinessBackTarget } from "@/components/Readiness/backLink";
import { ReadinessScreen } from "@/components/Readiness/ReadinessScreen";

function BackLink() {
  const target = readinessBackTarget(useSearchParams()?.get("from"));
  return <BackLinkTo target={target} />;
}

function BackLinkTo({ target }: { target: BackTarget }) {
  return (
    <Link
      href={target.href}
      aria-label={`Back to ${target.label}`}
      className="-ml-1 flex h-11 w-fit items-center gap-0.5 rounded-lg pr-2 text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {target.label}
    </Link>
  );
}

// Client page: `from` comes from useSearchParams inside Suspense, so a static export
// never needs the search params at build time.
export default function ReadinessPage() {
  return (
    <div
      data-slot="page-shell"
      className="mx-auto flex max-w-lg flex-col gap-2 px-5 pt-[calc(4px+env(safe-area-inset-top))] pb-28"
    >
      <header className="flex items-center justify-between gap-2">
        <Suspense fallback={<BackLinkTo target={backTarget("today")} />}>
          <BackLink />
        </Suspense>
        <Link
          href="/research#readiness-score"
          className="relative inline-flex h-9 items-center rounded-full after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] bg-secondary px-3.5 text-xs font-bold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Research
        </Link>
      </header>
      <h1 className="sr-only">Readiness</h1>
      <ReadinessScreen />
    </div>
  );
}
