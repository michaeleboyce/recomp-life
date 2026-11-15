"use client";

import { PageShell } from "@/components/ui/page-shell";
import { ForecastsScreen } from "@/components/Forecast/ForecastsScreen";

export default function ForecastsPage() {
  return (
    <PageShell className="pt-2">
      <ForecastsScreen />
    </PageShell>
  );
}
