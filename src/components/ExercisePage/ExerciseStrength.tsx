"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { liftTimelineFor } from "@/hooks/useStrengthTimeline";
import type { RangeKey } from "@/lib/metrics/types";
import type { WindowSpan } from "@/lib/metrics/window";
import { liftWindowKey, useChartSpan, useChartWindowStore } from "@/stores/chartWindowStore";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { useSettings } from "@/hooks";
import { T3_INCREASE_REPS_MAX, T3_INCREASE_REPS_MIN } from "@/lib/progression";
import { loadingOf, type StrengthSet } from "@/lib/strength";
import { cn } from "@/lib/utils";
import { TrendChartSkeleton, formatShortDate } from "@/components/chart-kit";
import { StrengthTrendPanel } from "@/components/StrengthTrend/StrengthTrendPanel";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/term";
import type { LiftSession } from "@/components/Lift/sessions";
import { t3LastSets } from "./exercisePageModel";

/**
 * The exercise's own estimated max over time, on the same chart as a barbell lift's
 * (`StrengthTrendPanel`): its own sessions as dots (logged and imported, never another
 * exercise's), the smooth line, the window controls and its latest estimate as the
 * anchor. A dumbbell exercise's is the total load it moved. The window is the page's:
 * presets through `onRangeChange`, a zoom through the chart window store.
 */
export function OwnStrength({
  exerciseId,
  name,
  sets,
  range,
  onRangeChange,
}: {
  exerciseId: string;
  name: string;
  /** Every set as strength evidence (`useStrengthEvidence`); undefined while loading. */
  sets: readonly StrengthSet[] | undefined;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
}) {
  const [now] = useState(() => Date.now());
  const timeline = useMemo(
    () => (sets === undefined ? undefined : liftTimelineFor(sets, exerciseId, now)),
    [sets, exerciseId, now]
  );
  const key = liftWindowKey(exerciseId);
  const span = useChartSpan(key);
  const setSpan = useChartWindowStore((st) => st.setSpan);
  const onSpanChange = useCallback((next: WindowSpan | null) => setSpan(key, next), [setSpan, key]);
  // A zoom lasts while the page is open.
  useEffect(() => () => setSpan(key, null), [setSpan, key]);
  const twoDumbbells = loadingOf(exerciseId) === "two-dumbbells";

  return (
    <section aria-label="Strength" className="flex flex-col gap-1.5">
      <SectionHeader title="Strength" action={<EvidenceLine ruleId="e1rm-estimate" variant="icon" />} />
      {timeline === undefined ? (
        <TrendChartSkeleton height={200} />
      ) : (
        <StrengthTrendPanel
          timeline={timeline}
          range={range}
          onRangeChange={onRangeChange}
          span={span}
          onSpanChange={onSpanChange}
          title={
            <>
              <Term id="e1rm">Estimated max</Term>
              {twoDumbbells && ", both dumbbells together"}
            </>
          }
          ariaLabel={`${name} estimated max over time`}
          anchorLabel="Latest"
          anchorTestId="own-estimate"
          emptyMessage={`A T1 session of ${name} with a last set of 2 or more reps gives its estimate.`}
          headingLevel={3}
          size="md"
        />
      )}
    </section>
  );
}

/**
 * A T3's strength in the program's own terms: each recent session's last set against
 * the rep count that adds weight. `sessions` is undefined while loading.
 */
export function T3Strength({ sessions }: { sessions: readonly LiftSession[] | undefined }) {
  const settings = useSettings();
  const equipment = (settings ?? DEFAULT_USER_PROFILE.settings).equipment;
  const rows = sessions ? t3LastSets(sessions, equipment) : [];
  return (
    <section aria-label="Strength" className="flex flex-col gap-1.5">
      <SectionHeader title="Last set" action={<EvidenceLine ruleId="t3-progression" variant="icon" />} />
      <p data-testid="t3-threshold-note" className="text-[13px] text-muted-foreground">
        Each last set against the reps its weight needed to go up, {T3_INCREASE_REPS_MIN} to{" "}
        {T3_INCREASE_REPS_MAX}: the bigger the jump to the next weight, the more reps.
      </p>
      {sessions === undefined ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No T3 sessions yet.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.key}
              data-testid="t3-last-set"
              className="flex min-h-11 items-center gap-3 border-b border-border py-2 last:border-b-0"
            >
              <span className="w-[52px] shrink-0 font-mono text-xs text-muted-foreground">{formatShortDate(row.t)}</span>
              <span className="font-mono text-sm">{row.weight} lbs</span>
              <span
                className={cn(
                  "ml-auto font-mono text-sm font-bold",
                  row.reached ? "text-accent-primary" : "text-foreground"
                )}
              >
                {row.reps}/{row.threshold}
              </span>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                {row.reached ? "goes up" : `${row.threshold - row.reps} short`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
