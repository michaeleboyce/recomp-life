"use client";

import { Badge } from "@/components/ui/badge";
import { getExercise } from "@/lib/exercises";
import { dumbbellToBarbell } from "@/lib/dbConversion";
import type { WorkoutExerciseState } from "@/stores/workoutStore";
import type { WorkoutLocation } from "@/types";

interface ExerciseBlockProps {
  exercise: WorkoutExerciseState;
  location: WorkoutLocation;
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

export function ExerciseBlock({ exercise, location }: ExerciseBlockProps) {
  const exerciseInfo = getExercise(
    exercise.substituteExerciseId || exercise.exerciseId
  );
  const isSubstituted = !!exercise.substituteExerciseId;
  const isHome = location === "home";
  const isDumbbell = exerciseInfo.type === "dumbbell";

  const weightLabel =
    isDumbbell && isHome
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
    <div className="px-4 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <Badge className={getTierColor(exercise.tier)}>
          {exercise.tier === "warmup" ? "Warm-up" : exercise.tier}
        </Badge>
        <h2 className="text-lg font-semibold">{exerciseInfo.name}</h2>
      </div>

      <div className="text-muted-foreground text-sm space-y-0.5">
        <p>
          {formatScheme(exercise)} at {weightLabel}
        </p>
        {barbellEquiv !== null && (
          <p className="text-xs text-muted-foreground/70">
            (= {barbellEquiv} lbs barbell equiv.)
          </p>
        )}
      </div>

      <div className="pt-2">
        <p className="text-base font-medium">
          Set {currentSet} of {exercise.targetSets}
        </p>
        <p className="text-sm text-muted-foreground">
          Target: {targetRepsDisplay}
        </p>
      </div>
    </div>
  );
}
