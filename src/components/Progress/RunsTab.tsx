"use client";

import { useState } from "react";
import Link from "next/link";
import { Footprints, Plus } from "lucide-react";
import {
  BarSeries,
  ChartFrame,
  RangeTabs,
  formatShortDate,
} from "@/components/chart-kit";
import { Button } from "@/components/ui/button";
import { Delta } from "@/components/ui/delta";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { getMetric } from "@/lib/metrics";
import type { RangeKey } from "@/lib/metrics/types";
import { ActivitySection } from "./runs/ActivitySection";
import { ReadinessSection } from "./runs/ReadinessSection";
import { formatMinutes, weeklyBars } from "./runs/runsMath";
import { useRunsData } from "./runs/useRunsData";

const paceFormat = getMetric("runPace").format;
const MILES = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The Runs tab of /progress: run trends, other activity, and sleep and energy before workouts. */
export function RunsTab() {
  const [range, setRange] = useState<RangeKey>("3m");
  const data = useRunsData(range);

  if (!data) return <Skeleton className="h-64 w-full" />;

  if (!data.hasRuns && !data.hasActivities) {
    return (
      <EmptyState
        icon={<Footprints />}
        title="No runs or activities yet"
        body="Log a run, a ride or a yoga session to see your weekly totals."
        action={
          <Button asChild>
            <Link href="/run">Log a run or activity</Link>
          </Button>
        }
      />
    );
  }

  const paceChange = data.paceSummary.change;

  return (
    <div className="flex flex-col gap-5">
      {data.hasRuns && (
        <>
          <ChartFrame
            title="Distance run"
            value={MILES.format(data.distance)}
            change={
              <span className="text-xs text-muted-foreground">
                mi in {data.runCount} {data.runCount === 1 ? "run" : "runs"}
              </span>
            }
            actions={<RangeTabs value={range} onChange={setRange} />}
          >
            <BarSeries
              orientation="vertical"
              height={150}
              data={weeklyBars(data.weeklyDistance, formatShortDate)}
              formatValue={(v) => MILES.format(v)}
              ariaLabel="Run distance per week, in miles"
              emptyMessage="No runs in this range"
            />
          </ChartFrame>

          <div className="grid grid-cols-3 gap-2">
            <StatTile
              label="Average pace"
              value={data.avgPace !== null ? paceFormat(data.avgPace) : "—"}
              unit="/mi"
              delta={
                paceChange !== null && (
                  <Delta value={paceChange} better="down" format={paceFormat} />
                )
              }
            />
            <StatTile
              label="Average effort"
              value={data.avgEffort !== null ? data.avgEffort.toFixed(1) : "—"}
              unit="/ 5"
            />
            <StatTile label="Total time" value={formatMinutes(data.totalMinutes)} />
          </div>
        </>
      )}

      <ActivitySection totals={data.activities} />

      {data.hasReadiness && (
        <ReadinessSection sleep={data.sleep} stress={data.stress} comparison={data.comparison} />
      )}

      <ListRow
        href="/run"
        title="Log a run or activity"
        leading={<Plus className="size-4 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
