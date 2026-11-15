"use client";

import { ArrowDownRight, ArrowUpRight, CircleSlash, Minus, Pause, RotateCcw } from "lucide-react";
import type { ComponentType } from "react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { liftName } from "@/components/LogEdit/format";
import { SectionHeader } from "@/components/ui/section-header";
import { TierBadge } from "@/components/ui/tier-badge";
import { nameInSentence } from "@/components/Today/todayModel";
import { useWorkout } from "@/hooks";
import { EXERCISES } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import type { SetLog, Tier } from "@/types";
import { describeOutcomes, type LiftOutcome, type OutcomeKind } from "./outcomes";
import { useWorkoutSnapshots } from "./useWorkoutSnapshots";

const ICON: Record<OutcomeKind, ComponentType<{ className?: string }>> = {
  passed: ArrowUpRight,
  t3Up: ArrowUpRight,
  stageDown: ArrowDownRight,
  reset: RotateCcw,
  held: Pause,
  partial: Minus,
  loggedOnly: Minus,
  t3Same: Minus,
  notDone: CircleSlash,
};

const TONE: Partial<Record<OutcomeKind, string>> = {
  passed: "text-success",
  t3Up: "text-success",
  stageDown: "text-warning",
  reset: "text-warning",
};

/**
 * The program lift's name, with the home substitute it was done as when the session's
 * sets for that lift and tier were substituted: "Squat (goblet squat at home)", so the
 * line matches the set list beside it while saying which lift it moved.
 */
export function outcomeLiftName(
  exerciseId: string,
  tier: Tier,
  sets: readonly Pick<SetLog, "exerciseId" | "tier" | "isSubstituted" | "substituteExerciseId">[]
): string {
  const substitute = sets.find(
    (s) => s.exerciseId === exerciseId && s.tier === tier && s.substituteExerciseId && EXERCISES[s.substituteExerciseId]
  )?.substituteExerciseId;
  const name = liftName(exerciseId);
  return substitute ? `${name} (${nameInSentence(substitute)} at home)` : name;
}

function OutcomeRow({
  outcome,
  name,
  hideLibraryLink,
}: {
  outcome: LiftOutcome;
  name: string;
  hideLibraryLink: boolean;
}) {
  const Icon = ICON[outcome.kind];
  return (
    <li data-outcome={outcome.kind} className="flex flex-col gap-1 border-b border-border py-2.5 last:border-b-0">
      <div className="flex min-h-11 items-center gap-3">
        <TierBadge tier={outcome.tier} variant="soft" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">{name}</p>
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
 * What a finished workout did to each program lift, as of that workout: the outcomes
 * the progression rules reported when the rebuild replayed it, so a past session shows
 * what it did then, not what the lift looks like today.
 */
export function WhatItDid({ workoutId, hideLibraryLink = false }: { workoutId: string; hideLibraryLink?: boolean }) {
  const workout = useWorkout(workoutId);
  const snapshots = useWorkoutSnapshots(workoutId);
  if (!workout || !snapshots) return null;
  const outcomes = describeOutcomes(workout, snapshots.outcomes);
  if (outcomes.length === 0) return null;

  return (
    <section aria-label="What it did" className="flex flex-col gap-1">
      <SectionHeader title="What it did" />
      <ul>
        {outcomes.map((o) => (
          <OutcomeRow
            key={`${o.exerciseId}:${o.tier}`}
            outcome={o}
            name={outcomeLiftName(o.exerciseId, o.tier, workout.sets ?? [])}
            hideLibraryLink={hideLibraryLink}
          />
        ))}
      </ul>
    </section>
  );
}
