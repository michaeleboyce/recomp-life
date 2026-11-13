"use client";

import { useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { TrendChartSkeleton } from "@/components/chart-kit";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-shell";
import { Term } from "@/components/ui/term";
import { useProjection } from "@/hooks";
import { liftShortName, type Projection, type ProjectionScenario } from "@/lib/projection";
import { HorizonChips } from "./HorizonChips";
import { HowItWorks } from "./HowItWorks";
import { ProjectionChart } from "./ProjectionChart";
import { ScenarioControls } from "./ScenarioControls";
import { WorkSources } from "./WorkSources";

export const HORIZONS = [4, 8, 12] as const;
const LONGEST = HORIZONS[HORIZONS.length - 1];
/** Older than this, the screen says the projection starts from a stale estimate. */
const STALE_RESULT_WEEKS = 4;

const MARKER = ". On your current trend";

/**
 * `summarizeScenario` prints both numbers even when they round to the same value;
 * then say plainly that the change is too small to tell apart.
 */
export function plainSummary(summary: string, scenario: Projection, current: Projection): string {
  const end = scenario.points.at(-1)?.v;
  const now = current.points.at(-1)?.v;
  if (scenario.status !== "ok" || end === undefined || now === undefined) return summary;
  if (Math.round(end) !== Math.round(now)) return summary;
  const at = summary.indexOf(MARKER);
  if (at < 0 || !summary.startsWith("With ")) return summary;
  return `${summary.slice(0, at)}, about the same as your current trend: within the range, this change is too small to tell apart.`;
}

/** The projection screen for one known lift (U18). */
export function ProjectionView({ exerciseId }: { exerciseId: string }) {
  // null: the longest horizon the history supports.
  const [chosen, setChosen] = useState<number | null>(null);
  const [scenario, setScenario] = useState<ProjectionScenario>({});
  const requested = chosen ?? LONGEST;
  const result = useProjection(exerciseId, scenario, requested);

  // How far ahead the history supports looking; it does not depend on the horizon.
  const fitted = result && result.current.status !== "insufficient-data";
  const maxWeeks = fitted ? result.current.maxReliableWeeks : LONGEST;
  const largestAllowed = [...HORIZONS].reverse().find((w) => w <= maxWeeks) ?? HORIZONS[0];
  if (fitted && requested > maxWeeks && requested !== largestAllowed) {
    // Clamp during render (React's "adjust state while rendering" pattern).
    setChosen(largestAllowed);
  }
  const weeks = Math.min(requested, largestAllowed);
  const someDisabled = fitted && HORIZONS.some((w) => w > maxWeeks);

  const short = liftShortName(exerciseId);
  const title = `${short[0].toUpperCase()}${short.slice(1)}`;
  const backHref = `/progress/lift/${exerciseId}`;

  const header = (
    <div className="flex flex-col gap-1.5">
      <PageHeader
        title={
          <>
            {title} <Term id="projection">projection</Term>
          </>
        }
        backHref={backHref}
        action={
          <HorizonChips
            horizons={HORIZONS}
            value={weeks}
            maxWeeks={maxWeeks}
            onChange={setChosen}
          />
        }
      />
      {someDisabled && result && (
        <p data-testid="horizon-note" className="text-xs text-muted-foreground">
          {result.current.reliableHorizonNote}
        </p>
      )}
    </div>
  );

  if (!result || requested !== weeks) {
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
  const staleWeeks = Math.round(current.lastResultWeeksAgo);

  return (
    <div className="flex flex-col gap-5">
      {header}
      <p className="text-base leading-relaxed text-foreground" aria-live="polite" data-testid="projection-summary">
        {changed ? plainSummary(summary, result.scenario, current) : summary}
      </p>
      {current.lastResultWeeksAgo > STALE_RESULT_WEEKS && (
        <Callout variant="info" title={`Your last ${short} estimate is ${staleWeeks} weeks old`}>
          The projection starts from that last result, as if no time had passed. Log a new T1
          AMRAP set to bring it up to date.
        </Callout>
      )}
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
      <HowItWorks projection={shown} dataWeeks={shown.fitWindowWeeks} />
    </div>
  );
}
