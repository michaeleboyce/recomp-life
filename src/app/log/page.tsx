"use client";

import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { LogHistory } from "@/components/Log/LogHistory";

/** The log: every workout, run, activity and weigh-in, newest first. */
export default function LogPage() {
  return (
    <PageShell className="space-y-4">
      <PageHeader title="Log" />
      <LogHistory />
    </PageShell>
  );
}
