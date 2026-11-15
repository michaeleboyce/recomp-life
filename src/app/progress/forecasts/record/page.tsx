"use client";

import { PageShell } from "@/components/ui/page-shell";
import { TrackRecordScreen } from "@/components/Forecast/TrackRecordScreen";

export default function TrackRecordPage() {
  return (
    <PageShell className="pt-2">
      <TrackRecordScreen />
    </PageShell>
  );
}
