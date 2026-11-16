"use client";

import { ImportHistory } from "@/components/Import/ImportHistory";
import { Stripes } from "@/components/ui/stripes";
import { PageHeader, PageShell } from "@/components/ui/page-shell";

/** /settings/import: bring in training history from another app's export. */
export default function ImportHistoryPage() {
  return (
    <PageShell className="space-y-4">
      <div className="flex flex-col gap-3">
        <PageHeader title="Import history" backHref="/settings" />
        <Stripes />
      </div>
      <ImportHistory />
    </PageShell>
  );
}
