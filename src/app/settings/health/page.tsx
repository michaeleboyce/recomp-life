"use client";

import { AppleHealthSettings } from "@/components/Settings/AppleHealthSettings";
import { Stripes } from "@/components/ui/stripes";
import { PageHeader, PageShell } from "@/components/ui/page-shell";

/** /settings/health: connect Apple Health and choose what to import. */
export default function AppleHealthPage() {
  return (
    <PageShell className="space-y-4">
      <div className="flex flex-col gap-3">
        <PageHeader title="Apple Health" backHref="/settings" />
        <Stripes />
      </div>
      <AppleHealthSettings />
    </PageShell>
  );
}
