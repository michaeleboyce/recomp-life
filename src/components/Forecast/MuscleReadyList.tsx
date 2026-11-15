"use client";

import { useMemo } from "react";
import { useCompletedWorkouts, useSettings } from "@/hooks";
import { muscleReadyTimes, type MuscleReadyExplanation } from "@/lib/forecast";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { GradeChip } from "@/components/ui/grade-chip";
import { getRule } from "@/lib/evidence";

const WHEN = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric" });

/** "Ready now", or "Ready Thu, 5 PM". */
export function readyWords(at: number, now: number): string {
  return at <= now ? "Ready now" : `Ready ${WHEN.format(new Date(at))}`;
}

/** "At its best from Fri, 5 PM", or "At its best now". */
export function bestWords(at: number, now: number): string {
  return at <= now ? "At its best now" : `At its best from ${WHEN.format(new Date(at))}`;
}

/**
 * When the muscles the last workout trained should be ready again, from the recovery
 * windows. An explanation, not a forecast: it is not stored or scored, and it says so.
 */
export function MuscleReadyList({
  explanation,
  now,
}: {
  explanation: MuscleReadyExplanation;
  now: Date;
}) {
  const rule = getRule("forecast-muscle-ready");
  const t = now.getTime();
  return (
    <section
      aria-labelledby="forecasts-muscles"
      data-slot="muscle-ready"
      className="flex flex-col gap-2 rounded-[18px] bg-card px-3.5 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="forecasts-muscles"
          className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase"
        >
          Muscles ready again
        </h2>
        <GradeChip strength={rule.strength} />
      </div>
      <ul className="flex flex-col">
        {explanation.muscles.map((m) => (
          <li
            key={m.muscle}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-border py-1.5 first:border-t-0"
          >
            <span className="text-sm font-semibold text-foreground">{m.label}</span>
            <span className="text-right text-[13px] text-foreground">
              {readyWords(m.readyAt, t)}
              <small className="block text-xs text-muted-foreground">{bestWords(m.primedAt, t)}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-snug text-muted-foreground">
        Read from the recovery times after your last workout. Not scored like the forecasts
        above: nothing in your log says when a muscle has recovered.
      </p>
      <EvidenceLine ruleId="forecast-muscle-ready" />
    </section>
  );
}

/** The list for the latest finished workout, or nothing before there is one. */
export function MuscleReadySection() {
  const workouts = useCompletedWorkouts();
  const settings = useSettings();
  const view = useMemo(() => {
    const phase = settings?.trainingPhase;
    if (!workouts || !phase) return null;
    const now = new Date();
    const explanation = muscleReadyTimes(workouts, phase, now);
    return explanation && explanation.muscles.length > 0 ? { explanation, now } : null;
  }, [workouts, settings]);
  if (!view) return null;
  return <MuscleReadyList explanation={view.explanation} now={view.now} />;
}
