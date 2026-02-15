"use client";

import type { SetLog, WorkoutLocation } from "@/types";
import { getExercise } from "@/lib/exercises";
import { Separator } from "@/components/ui/separator";

interface CompletedSetsProps {
  sets: SetLog[];
  exerciseId: string;
  location: WorkoutLocation;
}

export function CompletedSets({
  sets,
  exerciseId,
  location,
}: CompletedSetsProps) {
  const exerciseSets = sets.filter((s) => {
    const matchId = s.substituteExerciseId || s.exerciseId;
    return matchId === exerciseId || s.exerciseId === exerciseId;
  });

  if (exerciseSets.length === 0) return null;

  const exercise = getExercise(exerciseId);

  return (
    <div className="px-4 py-3">
      <Separator className="mb-3" />
      <div className="space-y-1.5">
        {exerciseSets.map((set, idx) => {
          const weightLabel =
            exercise.grip === "per_hand"
              ? `${set.weight}/h`
              : `${set.weight}`;

          return (
            <div
              key={set.id}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="text-green-500 font-medium">
                &#10003;
              </span>
              <span>
                Set {idx + 1}: {weightLabel} x {set.actualReps}
              </span>
              {set.rpe !== undefined && (
                <span className="text-xs opacity-70">RPE {set.rpe}</span>
              )}
              {set.isAMRAP && (
                <span className="text-xs text-amber-400 ml-1">AMRAP</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
