"use client";

import { Repeat2 } from "lucide-react";
import { TierBadge } from "@/components/ui/tier-badge";
import { ExerciseMuscleThumb } from "@/components/Anatomy/ExerciseMuscleThumb";
import { FormSheetButton } from "@/components/ExerciseDemo/FormSheetButton";
import { getExercise } from "@/lib/exercises";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { TermIcon } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";
import type { Tier, WorkoutLocation } from "@/types";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { AMRAPIndicator } from "./AMRAPIndicator";
import { roleLabel } from "./setPlan";

/** The glossary entry for each tier badge; warm-ups and accessories have one too. */
const TIER_TERM: Record<Tier, TermId> = {
  T1: "t1",
  T2: "t2",
  T3: "t3",
  accessory: "accessory",
  warmup: "warm-up",
};

interface ExerciseBlockProps {
  exercise: WorkoutExerciseState;
  /** Where the workout is happening: the Form sheet's preference control starts there. */
  location: WorkoutLocation;
  isAMRAPSet?: boolean;
  /** An accessory's rep range: every set is taken toward the top (double progression). */
  repRange?: { min: number; max: number };
  /** Opens the swap sheet for this exercise (W11); left out, no Swap button. */
  onSwap?: () => void;
  /** A T3's last set: the reps that move its weight up ("20 to move up", `t3MoveUpHint`). */
  moveUpHint?: string;
}

/**
 * What is being done right now: tier, exercise (the substitute when there is one),
 * the muscles it works, a way to check form, and one line of context for the set.
 */
export function ExerciseBlock({ exercise, location, isAMRAPSet = false, repRange, moveUpHint, onSwap }: ExerciseBlockProps) {
  const exerciseInfo = getExercise(exercise.substituteExerciseId || exercise.exerciseId);
  const currentSet = Math.min(exercise.completedSets + 1, exercise.targetSets);
  // A ramp or back-off set says so; a working set reads as always.
  const role = roleLabel(exercise.perSet?.[exercise.completedSets]?.role);

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
          <TierBadge tier={exercise.tier} className="rounded-md font-bold" />
          <TermIcon id={TIER_TERM[exercise.tier]} hideLinks className="-ml-1.5" />
          <span className="font-display text-[12px] font-semibold tracking-[0.16em] uppercase">
            {exercise.isWarmUp
              ? `Warm-up · ${exercise.targetReps} ${exercise.targetReps === 1 ? "rep" : "reps"}`
              : `Set ${currentSet} of ${exercise.targetSets}${role ? ` · ${role}` : ""}`}
          </span>
        </p>
        {/* Long names wrap to a second line rather than being cut off. */}
        <h1 className="line-clamp-2 min-w-0 font-display text-[30px] leading-[0.95] font-extrabold break-words uppercase">
          {exerciseInfo.name}
        </h1>
        {repRange && exercise.tier === "accessory" ? (
          <p data-testid="accessory-range" className="text-[13px] leading-snug text-muted-foreground">
            <b className="font-mono font-semibold text-foreground tabular-nums">
              {repRange.min === repRange.max ? repRange.max : `${repRange.min}–${repRange.max}`} reps
            </b>{" "}
            · take every set toward {repRange.max}; all at {repRange.max} adds weight next time
            <EvidenceLine ruleId="accessory-progression" variant="icon" hideLibraryLink className="ml-1 inline-flex align-middle" />
          </p>
        ) : (
          isAMRAPSet && (
            <p className="text-[13px] text-muted-foreground">
              <AMRAPIndicator tier={exercise.tier} />
              {moveUpHint && (
                <span data-testid="t3-move-up" className="ml-1.5 inline-flex items-center gap-1 align-middle">
                  · <b className="font-semibold text-foreground">{moveUpHint}</b>
                  <EvidenceLine ruleId="t3-progression" variant="icon" hideLibraryLink />
                </span>
              )}
            </p>
          )
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <ExerciseMuscleThumb exerciseId={exerciseInfo.id} views="auto" className="h-20 shrink-0" />
        <FormSheetButton
          exerciseId={exerciseInfo.id}
          location={location}
          className="h-8 shrink-0 rounded-full border-0 bg-card px-3 text-xs font-semibold text-accent-primary"
        />
        {onSwap && (
          <button
            type="button"
            onClick={onSwap}
            aria-label={`Swap ${exerciseInfo.name}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Repeat2 className="size-3.5" aria-hidden="true" />
            Swap
          </button>
        )}
      </div>
    </section>
  );
}
