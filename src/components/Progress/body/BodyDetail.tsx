"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import Link from "next/link";
import { ChartFrame, LazyTrendChart, RangeTabs, RANGE_LABELS } from "@/components/chart-kit";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Button } from "@/components/ui/button";
import { Delta } from "@/components/ui/delta";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getMetric } from "@/lib/metrics";
import type { RangeKey } from "@/lib/metrics/types";
import { BodyChart } from "./BodyChart";
import { cutTargetBand } from "./bodyMath";
import { useBodySeries } from "./useBodySeries";
import { WeighInList } from "./WeighInList";

const weightFormat = getMetric("bodyweight").format;
const rateFormat = getMetric("lossRate").format;

/** The bodyweight detail page: a taller chart, the weekly rate against the cutting target, every entry. */
export function BodyDetail() {
  const [range, setRange] = useState<RangeKey>("3m");
  const body = useBodySeries(range);

  return (
    <PageShell className="flex flex-col gap-6">
      <PageHeader title="Bodyweight" backHref="/progress?tab=body" />
      {!body ? (
        <Skeleton className="h-72 w-full" />
      ) : body.log.length === 0 ? (
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
      ) : (
        <>
          <ChartFrame
            title="Bodyweight"
            value={body.weightSummary.latest ? weightFormat(body.weightSummary.latest.v) : "—"}
            change={
              body.weightSummary.change !== null ? (
                <>
                  <Delta value={body.weightSummary.change} unit="lbs" better={body.weight.better} />
                  <span className="ml-1 text-xs text-muted-foreground">in {RANGE_LABELS[range]}</span>
                </>
              ) : undefined
            }
            actions={<RangeTabs value={range} onChange={setRange} />}
          >
            <BodyChart average={body.average} weight={body.weight} height={240} />
          </ChartFrame>

          <ChartFrame
            title="Rate of change, lbs per week"
            footer={
              body.cutting && body.latestAverage !== null
                ? "Shaded band: 0.5 to 1.0 percent of bodyweight a week, the target while cutting."
                : undefined
            }
          >
            <LazyTrendChart
              series={body.rate}
              height={170}
              target={
                body.cutting && body.latestAverage !== null
                  ? { ...cutTargetBand(body.latestAverage), label: "Target" }
                  : undefined
              }
              formatValue={rateFormat}
              ariaLabel="Weekly rate of change in lbs per week"
              emptyMessage="Needs two weeks of weigh-ins"
            />
          </ChartFrame>
          {body.cutting && <EvidenceLine ruleId="rate-of-loss" />}

          <WeighInList log={body.log} better={body.weight.better} />
        </>
      )}
    </PageShell>
  );
}
