"use client";

import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { ImportBatches } from "@/components/Import/ImportBatches";
import { RecentlyDeleted } from "@/components/LogEdit";

export default function RecentlyDeletedPage() {
  return (
    <PageShell className="flex flex-col gap-4">
      <PageHeader title="Recently deleted" backHref="/more" />
      <p className="text-sm text-muted-foreground">
        Workouts, runs, activities, weigh-ins and pain entries you deleted in the last 30 days.
        Restoring one puts it back in your log. Imports from other apps are listed below them and
        can be undone or restored as a whole.
      </p>
      <RecentlyDeleted />
      <ImportBatches />
    </PageShell>
  );
}
