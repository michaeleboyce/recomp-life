"use client";

import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { describeSessionOutcomes } from "@/components/Log/outcomes";
import { useWorkoutSnapshots } from "@/components/Log/useWorkoutSnapshots";
import { AccessoryOutcomeRow, useAccessoryOutcomes } from "@/components/Log/AccessoryOutcomes";
import { GradeChip } from "@/components/ui/grade-chip";
import { useWorkout } from "@/hooks";
import { getRule, isRuleId } from "@/lib/evidence";
import { cn } from "@/lib/utils";

/** "+10", "−15", or nothing when the weight did not move. */
function delta(from: number, to: number): string | null {
  const d = Math.round((to - from) * 10) / 10;
  if (d === 0) return null;
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

/**
 * What the program did to each lift after this workout, and why, with the grade of
 * the rule behind each outcome. The outcomes are the ones the Log's "What it did"
 * shows (`describeSessionOutcomes`), read as of this workout: at home, each home
 * exercise with its own next weight as lifted ("a hand" where it is per hand), since
 * the barbell weight does not move there; at the gym, each lift's next weight.
 */
export function WhatItChanged({ workoutId }: { workoutId: string }) {
  const workout = useWorkout(workoutId);
  const snapshots = useWorkoutSnapshots(workoutId);
  // Each accessory: what double progression does with it next time (A10).
  const accessories = useAccessoryOutcomes(workout);
  if (!workout || !snapshots) return null;
  const rows = describeSessionOutcomes(workout, snapshots.outcomes, snapshots.variantOutcomes, snapshots.equipment);
  if (rows.length === 0 && !accessories?.length) return null;

  return (
    <section aria-label="What it did" className="flex flex-col">
      <h2 className="font-display text-[12px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        What the app changed, and why
      </h2>
      <ul className="mt-1.5">
        {rows.map((row) => {
          const rule = isRuleId(row.ruleId) ? getRule(row.ruleId) : null;
          const change = delta(row.from, row.to);
          return (
            <li
              key={row.key}
              data-outcome={row.kind}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border py-2"
            >
              <div className="min-w-0">
                <b className="text-[14px] font-semibold">
                  {row.name} <span className="font-mono text-xs font-normal text-muted-foreground">{row.tier}</span>
                </b>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <span>{row.text}</span>
                  {rule && <GradeChip strength={rule.strength} />}
                  {rule && <EvidenceLine ruleId={rule.id} variant="icon" />}
                </p>
              </div>
              {change && (
                <span
                  className={cn(
                    "font-display text-xl font-extrabold tabular-nums",
                    row.raised ? "text-tier-t3" : "text-tier-t2"
                  )}
                >
                  {change}
                </span>
              )}
            </li>
          );
        })}
        {accessories?.map((outcome) => <AccessoryOutcomeRow key={outcome.exerciseId} outcome={outcome} compact />)}
      </ul>
    </section>
  );
}
