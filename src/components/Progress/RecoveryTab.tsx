"use client";

import { useState } from "react";
import { Moon } from "lucide-react";
import { RangeTabs } from "@/components/chart-kit";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { RangeKey } from "@/lib/metrics/types";
import { ReadinessSection } from "./recovery/ReadinessSection";
import { HealthTrendCharts } from "./health/HealthTrendCharts";
import { useRecoveryData } from "./recovery/useRecoveryData";

/**
 * The Recovery tab of /progress: sleep, resting heart rate and heart rate
 * variability from Apple Health, and the sleep and energy answers given before
 * workouts. The Apple Health values are shown as trends only; they never change
 * a weight or a suggestion.
 */
export function RecoveryTab() {
  const [range, setRange] = useState<RangeKey>("3m");
  const data = useRecoveryData(range);

  if (!data) return <Skeleton className="h-64 w-full" />;

  if (!data.hasHealth && !data.hasReadiness) {
    return (
      <EmptyState
        icon={<Moon />}
        title="No recovery data yet"
        body="Your sleep and energy answers before workouts show up here. In the iPhone app, connecting Apple Health adds nightly sleep, resting heart rate and heart rate variability."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <RangeTabs value={range} onChange={setRange} className="self-end" />

      <HealthTrendCharts trends={data.health} label="From Apple Health" />

      {data.hasReadiness && (
        <ReadinessSection sleep={data.sleep} stress={data.stress} comparison={data.comparison} />
      )}
    </div>
  );
}
