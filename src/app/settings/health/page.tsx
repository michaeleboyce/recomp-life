"use client";

import { AppleHealthSettings } from "@/components/Settings/AppleHealthSettings";
import { PageHeader, PageShell } from "@/components/ui/page-shell";

/** /settings/health: connect Apple Health and choose what to import. */
export default function AppleHealthPage() {
  return (
    <PageShell>
      <PageHeader title="Apple Health" backHref="/settings" />
      <AppleHealthSettings />
    </PageShell>
  );
}
