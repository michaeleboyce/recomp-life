"use client";

import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { Stripes } from "@/components/ui/stripes";
import { LogHistory } from "@/components/Log/LogHistory";

/** The log: every workout, run, activity and weigh-in, newest first. */
export default function LogPage() {
  return (
    <PageShell className="space-y-4">
      <div className="flex flex-col gap-3">
        <PageHeader title="Log" />
        <Stripes />
      </div>
      <LogHistory />
    </PageShell>
  );
}
