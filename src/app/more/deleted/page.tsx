"use client";

import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { RecentlyDeleted } from "@/components/LogEdit";

export default function RecentlyDeletedPage() {
  return (
    <PageShell className="flex flex-col gap-4">
      <PageHeader title="Recently deleted" backHref="/more" />
      <p className="text-sm text-muted-foreground">
        Workouts, runs, activities, weigh-ins and pain entries you deleted in the last 30 days.
        Restoring one puts it back in your log.
      </p>
      <RecentlyDeleted />
    </PageShell>
  );
}
