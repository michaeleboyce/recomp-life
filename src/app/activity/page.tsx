"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import RunLogger from "@/components/RunLogger";
import ActivityLogger from "@/components/Activity/ActivityLogger";
import { ACTIVITY_KINDS, ACTIVITY_KIND_LABELS } from "@/lib/activities";
import { backTarget } from "@/components/nav/backTarget";
import type { ActivityKind } from "@/types";

type Choice = "run" | ActivityKind;

const CHOICES: { value: Choice; label: string }[] = [
  { value: "run", label: "Run" },
  ...ACTIVITY_KINDS.map((kind) => ({ value: kind, label: ACTIVITY_KIND_LABELS[kind] })),
];

function ActivityScreen() {
  const [choice, setChoice] = useState<Choice>("run");
  // Only a known `from` is used; anything else goes back to Today.
  const target = backTarget(useSearchParams()?.get("from"));

  return (
    <div className="min-h-screen bg-background">
      <PageShell className="space-y-4">
        <PageHeader title="Log activity" backHref={target.href} />

        <div className="flex flex-wrap gap-2" role="group" aria-label="Activity type">
          {CHOICES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={choice === value}
              onClick={() => setChoice(value)}
              className={`rounded-md border px-3 py-2 text-sm transition-all duration-150 ${
                choice === value
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {choice === "run" ? <RunLogger returnTo={target.href} /> : <ActivityLogger key={choice} kind={choice} returnTo={target.href} />}
      </PageShell>
    </div>
  );
}

export default function ActivityPage() {
  return (
    // Reading the query string suspends while the page is prerendered.
    <Suspense fallback={null}>
      <ActivityScreen />
    </Suspense>
  );
}
