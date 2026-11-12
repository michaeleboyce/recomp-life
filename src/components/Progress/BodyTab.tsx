"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Scale } from "lucide-react";
import { ChartFrame, RangeTabs, RANGE_LABELS, formatShortDate } from "@/components/chart-kit";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Button } from "@/components/ui/button";
import { Delta } from "@/components/ui/delta";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { getMetric } from "@/lib/metrics";
import type { RangeKey } from "@/lib/metrics/types";
import { BodyChart } from "./body/BodyChart";
import { formatSigned, paceStatus, type PaceWord } from "./body/bodyMath";
import { useBodySeries } from "./body/useBodySeries";

const weightFormat = getMetric("bodyweight").format;
const rateFormat = getMetric("lossRate").format;

const PACE_TONE: Record<PaceWord, string> = {
  "on pace": "text-success",
  slow: "text-warning",
  fast: "text-warning",
};

/** The Body tab of /progress: bodyweight headline, one chart, three tiles and a way in to the detail. */
export function BodyTab() {
  const [range, setRange] = useState<RangeKey>("3m");
  const body = useBodySeries(range);

  if (!body) return <Skeleton className="h-64 w-full" />;

  if (body.log.length === 0) {
    return (
      <EmptyState
        icon={<Scale />}
        title="No weigh-ins yet"
        body="Log your weight to see its trend and your rate of change."
        action={
          <Button asChild>
            <Link href="/weigh-in">Log weight</Link>
          </Button>
        }
      />
    );
  }

  const better = body.weight.better;
  const { latest, first, change } = body.weightSummary;
  const pace = body.cutting ? paceStatus(body.log.map((e) => ({ date: new Date(e.date), weight: e.weight }))) : null;

  return (
    <div className="flex flex-col gap-5">
      <ChartFrame
        title="Bodyweight"
        value={latest ? weightFormat(latest.v) : "—"}
        change={
          change !== null ? (
            <>
              <Delta value={change} unit="lbs" better={better} />
              <span className="ml-1 text-xs text-muted-foreground">in {RANGE_LABELS[range]}</span>
            </>
          ) : undefined
        }
        actions={<RangeTabs value={range} onChange={setRange} />}
      >
        <BodyChart average={body.average} weight={body.weight} />
      </ChartFrame>

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="7-day average"
          value={body.latestAverage !== null ? weightFormat(body.latestAverage) : "—"}
          unit="lbs"
        />
        <StatTile
          label="Rate of change"
          value={body.latestRate !== null ? rateFormat(body.latestRate) : "—"}
          unit="lb/wk"
          delta={pace && <span className={`text-xs font-medium ${PACE_TONE[pace]}`}>{pace}</span>}
        />
        <StatTile
          label="Total change"
          value={change !== null ? formatSigned(change) : "—"}
          unit="lbs"
          delta={first && <span className="text-xs text-muted-foreground">since {formatShortDate(first.t)}</span>}
        />
      </div>

      {body.cutting && <EvidenceLine ruleId="rate-of-loss" />}

      <div>
        <ListRow
          href="/progress/body"
          title="All weigh-ins and details"
          subtitle={`${body.log.length} ${body.log.length === 1 ? "weigh-in" : "weigh-ins"}`}
        />
        <ListRow
          href="/weigh-in"
          title="Log weight"
          leading={<Plus className="size-4 text-muted-foreground" aria-hidden="true" />}
        />
      </div>
    </div>
  );
}
