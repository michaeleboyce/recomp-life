"use client";

import { Badge } from "@/components/ui/badge";
import { AMRAPGlow } from "@/components/ui/amrap-glow";
import { ExerciseMuscleThumb } from "@/components/Anatomy/ExerciseMuscleThumb";
import { FormSheetButton } from "@/components/ExerciseDemo/FormSheetButton";
import { getExercise } from "@/lib/exercises";
import { dumbbellToBarbell } from "@/lib/dbConversion";
import type { WorkoutExerciseState } from "@/stores/workoutStore";
import type { WorkoutLocation } from "@/types";

interface ExerciseBlockProps {
  exercise: WorkoutExerciseState;
  location: WorkoutLocation;
  isAMRAPSet?: boolean;
}

function getTierColor(tier: string): string {
  switch (tier) {
    case "T1":
      return "bg-red-600 text-white";
    case "T2":
      return "bg-orange-500 text-white";
    case "T3":
      return "bg-blue-500 text-white";
    case "accessory":
      return "bg-green-600 text-white";
    case "warmup":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function formatScheme(exercise: WorkoutExerciseState): string {
  const amrapSuffix = exercise.isAMRAP ? "+" : "";
  return `${exercise.targetSets}x${exercise.targetReps}${amrapSuffix}`;
}

export function ExerciseBlock({ exercise, location, isAMRAPSet }: ExerciseBlockProps) {
  const exerciseInfo = getExercise(
    exercise.substituteExerciseId || exercise.exerciseId
  );
  const isSubstituted = !!exercise.substituteExerciseId;
  const isHome = location === "home";
  const isDumbbell = exerciseInfo.type === "dumbbell";

  const weightLabel =
    isDumbbell && exerciseInfo.grip === "per_hand"
      ? `${exercise.weight} lbs/hand`
      : `${exercise.weight} lbs`;

  const barbellEquiv =
    isHome && isDumbbell && isSubstituted
      ? dumbbellToBarbell(exercise.weight)
      : null;

  const currentSet = exercise.completedSets + 1;
  const isLastSet = currentSet === exercise.targetSets;
  const targetRepsDisplay = isLastSet && exercise.isAMRAP
    ? `${exercise.targetReps}+ (AMRAP)`
    : `${exercise.targetReps} reps`;

  return (
    <AMRAPGlow active={!!isAMRAPSet} className="mx-4">
      <div className="relative py-4 px-4 space-y-2">
        <ExerciseMuscleThumb
          exerciseId={exerciseInfo.id}
          className="absolute right-4 top-4 h-16"
        />
        <div className="flex items-center gap-2 pr-20">
          <Badge className={getTierColor(exercise.tier)}>
            {exercise.tier === "warmup" ? "Warm-up" : exercise.tier}
          </Badge>
          <h2 className="text-lg font-semibold">{exerciseInfo.name}</h2>
        </div>
        <FormSheetButton exerciseId={exerciseInfo.id} />

        <div className="text-muted-foreground text-sm space-y-0.5">
          <p className="font-mono tabular-nums">
            {formatScheme(exercise)} at {weightLabel}
          </p>
          {barbellEquiv !== null && (
            <p className="text-xs text-muted-foreground/70 font-mono tabular-nums">
              (= {barbellEquiv} lbs barbell equiv.)
            </p>
          )}
        </div>

        <div className="pt-2">
          <p className="text-base font-medium font-mono tabular-nums">
            Set {currentSet} of {exercise.targetSets}
          </p>
          <p className="text-sm text-muted-foreground">
            Target: {targetRepsDisplay}
          </p>
        </div>
      </div>
    </AMRAPGlow>
  );
}
