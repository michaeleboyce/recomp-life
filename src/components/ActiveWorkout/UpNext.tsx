"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getExercise } from "@/lib/exercises";
import type { WorkoutExerciseState } from "@/stores/workoutStore";

interface UpNextProps {
  exercises: WorkoutExerciseState[];
  currentExerciseIndex: number;
}

function getTierBadgeVariant(
  tier: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (tier) {
    case "T1":
      return "destructive";
    case "T2":
      return "default";
    case "T3":
      return "secondary";
    default:
      return "outline";
  }
}

export function UpNext({ exercises, currentExerciseIndex }: UpNextProps) {
  const upcomingExercises = exercises
    .slice(currentExerciseIndex + 1)
    .filter((e) => !e.isWarmUp);

  if (upcomingExercises.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <Separator className="mb-3" />
      <p className="text-sm font-medium text-muted-foreground mb-2">
        Up Next:
      </p>
      <div className="space-y-1.5">
        {upcomingExercises.map((exercise, idx) => {
          const exerciseInfo = getExercise(
            exercise.substituteExerciseId || exercise.exerciseId
          );
          const scheme = `${exercise.targetSets}x${exercise.targetReps}${
            exercise.isAMRAP ? "+" : ""
          }`;

          return (
            <div
              key={`${exercise.exerciseId}-${exercise.tier}-${idx}`}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Badge
                variant={getTierBadgeVariant(exercise.tier)}
                className="text-[10px] px-1.5 py-0"
              >
                {exercise.tier}
              </Badge>
              <span>{exerciseInfo.name}</span>
              <span className="text-xs opacity-60">
                {scheme} @ {exercise.weight}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
