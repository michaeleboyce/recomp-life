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
    <section className="flex flex-col items-center gap-1 text-center">
      <div className="flex max-w-full items-center gap-2">
        <ExerciseMuscleThumb
          exerciseId={exerciseInfo.id}
          views="auto"
          className="h-11 shrink-0"
        />
        <TierBadge tier={exercise.tier} className="rounded-md font-bold" />
        <TermIcon id={TIER_TERM[exercise.tier]} hideLinks className="-ml-1.5" />
        <h1 className="min-w-0 truncate text-xl font-bold">{exerciseInfo.name}</h1>
        <FormSheetButton
          exerciseId={exerciseInfo.id}
          location={location}
          className="shrink-0 border-0 px-1 py-3 text-[13px] font-semibold text-accent-primary"
        />
      </div>
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] text-muted-foreground">
        <span className="font-mono tabular-nums">
          {exercise.isWarmUp
            ? `Warm-up · ${exercise.targetReps} ${exercise.targetReps === 1 ? "rep" : "reps"}`
            : `Set ${currentSet} of ${exercise.targetSets}`}
        </span>
        {isAMRAPSet && (
          <>
            <span aria-hidden="true">{"·"}</span>
            <AMRAPIndicator tier={exercise.tier} />
          </>
        )}
      </p>
    </section>
  );
}
