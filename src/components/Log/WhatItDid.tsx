"use client";

import { ArrowDownRight, ArrowUpRight, CircleSlash, Minus, Pause, RotateCcw } from "lucide-react";
import type { ComponentType } from "react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { liftName } from "@/components/LogEdit/format";
import { SectionHeader } from "@/components/ui/section-header";
import { TierBadge } from "@/components/ui/tier-badge";
import { useWorkout } from "@/hooks";
import { cn } from "@/lib/utils";
import { describeOutcomes, type LiftOutcome, type OutcomeKind } from "./outcomes";
import { useWorkoutSnapshots } from "./useWorkoutSnapshots";

const ICON: Record<OutcomeKind, ComponentType<{ className?: string }>> = {
  passed: ArrowUpRight,
  t3Up: ArrowUpRight,
  missed: ArrowDownRight,
  reset: RotateCcw,
  held: Pause,
  partial: Minus,
  unchanged: Minus,
  t3Same: Minus,
  notDone: CircleSlash,
};

const TONE: Partial<Record<OutcomeKind, string>> = {
  passed: "text-success",
  t3Up: "text-success",
  missed: "text-warning",
  reset: "text-warning",
};

function OutcomeRow({ outcome, hideLibraryLink }: { outcome: LiftOutcome; hideLibraryLink: boolean }) {
  const Icon = ICON[outcome.kind];
  return (
    <li data-outcome={outcome.kind} className="flex flex-col gap-1 border-b border-border py-2.5 last:border-b-0">
      <div className="flex min-h-11 items-center gap-3">
        <TierBadge tier={outcome.tier} variant="soft" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">{liftName(outcome.exerciseId)}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className={cn("size-4 shrink-0", TONE[outcome.kind])} aria-hidden="true" />
            <span>{outcome.text}</span>
          </p>
        </div>
        {outcome.tier !== "T3" && (
          <EvidenceLine ruleId="gzclp-progression" variant="icon" hideLibraryLink={hideLibraryLink} />
        )}
      </div>
      {outcome.tier === "T3" && <EvidenceLine ruleId="t3-progression" hideLibraryLink={hideLibraryLink} />}
    </li>
  );
}

/**
 * What a finished workout did to each program lift, as of that workout: the lift
 * states the rebuild recorded right after it, so a past session shows what it did then,
 * not what the lift looks like today.
 */
export function WhatItDid({ workoutId, hideLibraryLink = false }: { workoutId: string; hideLibraryLink?: boolean }) {
  const workout = useWorkout(workoutId);
  const snapshots = useWorkoutSnapshots(workoutId);
  if (!workout || !snapshots) return null;
  const outcomes = describeOutcomes(workout, snapshots.after, snapshots.before);
  if (outcomes.length === 0) return null;

  return (
    <section aria-label="What it did" className="flex flex-col gap-1">
      <SectionHeader title="What it did" />
      <ul>
        {outcomes.map((o) => (
          <OutcomeRow key={`${o.exerciseId}:${o.tier}`} outcome={o} hideLibraryLink={hideLibraryLink} />
        ))}
      </ul>
    </section>
  );
}
