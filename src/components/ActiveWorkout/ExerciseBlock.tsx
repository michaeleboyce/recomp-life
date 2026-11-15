"use client";

import { TierBadge } from "@/components/ui/tier-badge";
import { ExerciseMuscleThumb } from "@/components/Anatomy/ExerciseMuscleThumb";
import { FormSheetButton } from "@/components/ExerciseDemo/FormSheetButton";
import { getExercise } from "@/lib/exercises";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { TermIcon } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";
import type { Tier, WorkoutLocation } from "@/types";
import { AMRAPIndicator } from "./AMRAPIndicator";

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
}

/**
 * What is being done right now: tier, exercise (the substitute when there is one),
 * the muscles it works, a way to check form, and one line of context for the set.
 */
export function ExerciseBlock({ exercise, location, isAMRAPSet = false }: ExerciseBlockProps) {
  const exerciseInfo = getExercise(exercise.substituteExerciseId || exercise.exerciseId);
  const currentSet = Math.min(exercise.completedSets + 1, exercise.targetSets);

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
          <TierBadge tier={exercise.tier} className="rounded-md font-bold" />
          <TermIcon id={TIER_TERM[exercise.tier]} hideLinks className="-ml-1.5" />
          <span className="font-display text-[11px] font-semibold tracking-[0.16em] uppercase">
            {exercise.isWarmUp
              ? `Warm-up · ${exercise.targetReps} ${exercise.targetReps === 1 ? "rep" : "reps"}`
              : `Set ${currentSet} of ${exercise.targetSets}`}
          </span>
        </p>
        {/* Long names wrap to a second line rather than being cut off. */}
        <h1 className="line-clamp-2 min-w-0 font-display text-[30px] leading-[0.95] font-extrabold break-words uppercase">
          {exerciseInfo.name}
        </h1>
        {isAMRAPSet && (
          <p className="text-[13px] text-muted-foreground">
            <AMRAPIndicator tier={exercise.tier} />
          </p>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <ExerciseMuscleThumb exerciseId={exerciseInfo.id} views="auto" className="h-20 shrink-0" />
        <FormSheetButton
          exerciseId={exerciseInfo.id}
          location={location}
          className="h-8 shrink-0 rounded-full border-0 bg-card px-3 text-xs font-semibold text-accent-primary"
        />
      </div>
    </section>
  );
}
