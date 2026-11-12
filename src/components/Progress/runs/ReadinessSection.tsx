"use client";

import { ChartFrame, LazyTrendChart } from "@/components/chart-kit";
import { SectionHeader } from "@/components/ui/section-header";
import { getMetric } from "@/lib/metrics";
import type { MetricId, Series } from "@/lib/metrics/types";
import { describeSleepEffort, type SleepEffortComparison } from "./runsMath";

const LEVELS = [1, 2, 3];

/** "1 = <5 h, 2 = 5-7 h, 3 = 7+ h": the words the metric's own format gives each level. */
function levelKey(id: MetricId): string {
  const { format } = getMetric(id);
  return LEVELS.map((level) => `${level} = ${format(level)}`).join(", ");
}

function LevelChart({ id, series }: { id: MetricId; series: Series }) {
  const { label, format } = getMetric(id);
  return (
    <ChartFrame title={label} footer={levelKey(id)}>
      <LazyTrendChart
        series={series}
        height={120}
        yDomain={[0, 3]}
        formatValue={format}
        ariaLabel={`${label} before workouts`}
        emptyMessage="No check-ins in this range"
      />
    </ChartFrame>
  );
}

/** Sleep and stress / energy answers before workouts (the readiness check), with a plain comparison with effort. */
export function ReadinessSection({
  sleep,
  stress,
  comparison,
}: {
  sleep: Series;
  stress: Series;
  comparison: SleepEffortComparison | null;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label="Sleep and energy before workouts">
      <SectionHeader title="Sleep and energy before workouts" />
      <LevelChart id="sleep" series={sleep} />
      <LevelChart id="stress" series={stress} />
      {comparison && <p className="text-sm text-muted-foreground">{describeSleepEffort(comparison)}</p>}
    </section>
  );
}
