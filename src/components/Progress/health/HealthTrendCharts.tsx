"use client";

import { ChartFrame, LazyTrendChart } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import { getMetric } from "@/lib/metrics";
import type { HealthTrend } from "./useHealthTrends";

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
 * A chart for each of the trends that has data, with a note that these values
 * are for looking at only. Renders nothing when none has data.
 */
export function HealthTrendCharts({ trends, label }: { trends: HealthTrend[]; label: string }) {
  const shown = trends.filter((trend) => trend.hasAny);
  if (shown.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={label}>
      {shown.map((trend) => (
        <HealthChart key={trend.id} trend={trend} />
      ))}
      <p className="text-xs text-muted-foreground">
        From Apple Health. Shown for your information; the app does not change weights or
        suggestions based on these.
      </p>
    </section>
  );
}
