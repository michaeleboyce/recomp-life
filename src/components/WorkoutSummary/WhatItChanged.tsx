"use client";

import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { describeOutcomes } from "@/components/Log/outcomes";
import { outcomeLiftName } from "@/components/Log/WhatItDid";
import { useWorkoutSnapshots } from "@/components/Log/useWorkoutSnapshots";
import { GradeChip } from "@/components/ui/grade-chip";
import { useWorkout } from "@/hooks";
import { getRule, isRuleId } from "@/lib/evidence";
import { cn } from "@/lib/utils";

const RAISED = new Set(["passed", "t3Up"]);

/** "+10", "−15", or nothing when the weight did not move. */
function delta(from: number, to: number): string | null {
  const d = Math.round((to - from) * 10) / 10;
  if (d === 0) return null;
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

/**
 * What the program did to each lift after this workout, and why, with the grade of
 * the rule behind each outcome. The outcomes are the ones the Log's "What it did"
 * shows (`describeOutcomes`), read as of this workout.
 */
export function WhatItChanged({ workoutId }: { workoutId: string }) {
  const workout = useWorkout(workoutId);
  const snapshots = useWorkoutSnapshots(workoutId);
  if (!workout || !snapshots) return null;
  const outcomes = describeOutcomes(workout, snapshots.outcomes);
  if (outcomes.length === 0) return null;

  return (
    <section aria-label="What it did" className="flex flex-col">
      <h2 className="font-display text-[12px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        What the app changed, and why
      </h2>
      <ul className="mt-1.5">
        {outcomes.map((outcome) => {
          const rule = isRuleId(outcome.ruleId) ? getRule(outcome.ruleId) : null;
          const change = delta(outcome.from.weight, outcome.to.weight);
          return (
            <li
              key={`${outcome.exerciseId}:${outcome.tier}`}
              data-outcome={outcome.kind}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border py-2"
            >
              <div className="min-w-0">
                <b className="text-[14px] font-semibold">
                  {outcomeLiftName(outcome.exerciseId, outcome.tier, workout.sets ?? [])}{" "}
                  <span className="font-mono text-xs font-normal text-muted-foreground">{outcome.tier}</span>
                </b>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <span>{outcome.text}</span>
                  {rule && <GradeChip strength={rule.strength} />}
                  {rule && <EvidenceLine ruleId={rule.id} variant="icon" />}
                </p>
              </div>
              {change && (
                <span
                  className={cn(
                    "font-display text-xl font-extrabold tabular-nums",
                    RAISED.has(outcome.kind) ? "text-tier-t3" : "text-tier-t2"
                  )}
                >
                  {change}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
