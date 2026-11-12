"use client";

import { useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { TrendChartSkeleton } from "@/components/chart-kit";
import { Callout } from "@/components/ui/callout";
import { ChipGroup } from "@/components/ui/chip-group";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-shell";
import { useProjection } from "@/hooks";
import { liftShortName, type ProjectionScenario } from "@/lib/projection";
import { HowItWorks } from "./HowItWorks";
import { ProjectionChart } from "./ProjectionChart";
import { ScenarioControls } from "./ScenarioControls";
import { WorkSources } from "./WorkSources";

export const HORIZONS = [4, 8, 12] as const;
const HORIZON_OPTIONS = HORIZONS.map((w) => ({ value: String(w), label: `${w}w` }));

/** The projection screen for one known lift (U18). */
export function ProjectionView({ exerciseId }: { exerciseId: string }) {
  const [weeks, setWeeks] = useState<number>(12);
  const [scenario, setScenario] = useState<ProjectionScenario>({});
  const result = useProjection(exerciseId, scenario, weeks);

  const short = liftShortName(exerciseId);
  const title = `${short[0].toUpperCase()}${short.slice(1)}`;
  const backHref = `/progress/lift/${exerciseId}`;

  const header = (
    <PageHeader
      title={`${title} projection`}
      backHref={backHref}
      action={
        <ChipGroup
          ariaLabel="Projection horizon"
          size="sm"
          options={HORIZON_OPTIONS}
          value={String(weeks)}
          onChange={(v) => setWeeks(Number(v))}
          className="gap-1"
        />
      }
    />
  );

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <TrendChartSkeleton height={220} />
      </div>
    );
  }

  const { baseline, current, history, summary, now } = result;

  if (current.status === "insufficient-data") {
    const n = result.resultsNeeded;
    return (
      <div className="flex flex-col gap-4">
        {header}
        <EmptyState
          icon={<LineChart />}
          title="Not enough data to project yet"
          body={`Log ${n} more T1 AMRAP set${n === 1 ? "" : "s"} of ${short} to see where your estimated 1RM is heading.`}
          action={
            <Link href={backHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Back to {short}
            </Link>
          }
        />
      </div>
    );
  }

  const flat = current.status === "flat-trend";
  const changed = !flat && Object.keys(scenario).length > 0;
  const shown = changed ? result.scenario : current;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <p className="text-base leading-relaxed text-foreground" aria-live="polite" data-testid="projection-summary">
        {summary}
      </p>
      <ProjectionChart
        liftLabel={title}
        history={history}
        current={current}
        alternative={changed ? result.scenario : undefined}
        now={now}
      />
      {flat ? (
        <Callout variant="info" title="Your recent estimates are not rising">
          {current.assumptions.slice(0, 2).join(" ")}
        </Callout>
      ) : (
        <ScenarioControls
          baseline={baseline}
          scenario={scenario}
          onChange={setScenario}
          onReset={() => setScenario({})}
        />
      )}
      <WorkSources baseline={baseline} relatedTrend={current.relatedTrend} />
      <HowItWorks projection={shown} dataWeeks={baseline.windowWeeks} />
    </div>
  );
}
