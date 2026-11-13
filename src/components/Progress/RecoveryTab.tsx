"use client";

import { useState } from "react";
import { Moon } from "lucide-react";
import { ChartFrame, LazyTrendChart, RangeTabs } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getMetric } from "@/lib/metrics";
import type { RangeKey } from "@/lib/metrics/types";
import { ReadinessSection } from "./recovery/ReadinessSection";
import { useRecoveryData, type HealthTrend } from "./recovery/useRecoveryData";

/** One Apple Health trend: the latest value, its change over the range, and the line. */
function HealthChart({ trend }: { trend: HealthTrend }) {
  const { label, unit, better, format } = getMetric(trend.id);
  const { latest, change } = trend.summary;
  return (
    <ChartFrame
      title={label}
      value={latest ? format(latest.v) : "—"}
      change={
        <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
          {/* Sleep's value already reads "7h 12m"; the others need their unit. */}
          {unit !== "h" && <span>{unit}</span>}
          {change !== null && change !== 0 && (
            <Delta value={change} better={better} format={format} />
          )}
        </span>
      }
    >
      <LazyTrendChart
        series={trend.series}
        height={140}
        formatValue={format}
        ariaLabel={`${label} by day`}
        emptyMessage="No Apple Health data in this range"
      />
    </ChartFrame>
  );
}

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

      {data.hasHealth && (
        <section className="flex flex-col gap-3" aria-label="From Apple Health">
          {data.health
            .filter((trend) => trend.hasAny)
            .map((trend) => (
              <HealthChart key={trend.id} trend={trend} />
            ))}
          <p className="text-xs text-muted-foreground">
            From Apple Health. Shown for your information; the app does not change weights or
            suggestions based on these.
          </p>
        </section>
      )}

      {data.hasReadiness && (
        <ReadinessSection sleep={data.sleep} stress={data.stress} comparison={data.comparison} />
      )}
    </div>
  );
}
