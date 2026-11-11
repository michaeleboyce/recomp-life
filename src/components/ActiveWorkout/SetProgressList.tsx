"use client";

import type { SetLog, WorkoutLocation } from "@/types";
import type { WorkoutExerciseState } from "@/stores/workoutStore";
import { getExercise } from "@/lib/exercises";
import { workingSetsFor } from "@/lib/workout/setSelectors";

interface SetProgressListProps {
  exercise: WorkoutExerciseState;
  completedSets: SetLog[];
  location: WorkoutLocation;
}

export function SetProgressList({
  exercise,
  completedSets,
}: SetProgressListProps) {
  const exerciseId = exercise.substituteExerciseId || exercise.exerciseId;
  const exerciseInfo = getExercise(exerciseId);

  // Sets logged for THIS plan entry: same template exercise and same tier, so a
  // T1 row never shows the exercise's warm-up sets.
  const exerciseSets = workingSetsFor(
    completedSets,
    exercise.exerciseId,
    exercise.tier
  );

  const currentSetNumber = exercise.completedSets + 1;
  const isDumbbell = exerciseInfo.grip === "per_hand";

  const formatWeight = (weight: number) =>
    isDumbbell ? `${weight}/h` : `${weight}`;

  return (
    <div className="px-4 py-3 space-y-1">
      {Array.from({ length: exercise.targetSets }, (_, i) => {
        const setNum = i + 1;
        const loggedSet = exerciseSets[i];
        const isCurrent = setNum === currentSetNumber;
        const isCompleted = setNum < currentSetNumber;
        const isRemaining = setNum > currentSetNumber;
        const isAMRAPSet = exercise.isAMRAP && setNum === exercise.targetSets;

        return (
          <div
            key={setNum}
            className={`flex items-center gap-2 text-sm py-1 rounded-md px-2 ${
              isCurrent
                ? "bg-accent-primary/10 text-foreground font-medium"
                : isCompleted
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50"
            }`}
          >
            {/* Status indicator */}
            <span className="w-5 text-center shrink-0">
              {isCompleted && (
                <span className="text-success font-medium">&#10003;</span>
              )}
              {isCurrent && (
                <span className="text-accent-primary font-bold">&rarr;</span>
              )}
              {isRemaining && (
                <span className="opacity-40">&#9675;</span>
              )}
            </span>

            {/* Set label */}
            <span className="font-mono tabular-nums w-12 shrink-0">
              Set {setNum}
            </span>

            {/* Weight x reps */}
            <span className="font-mono tabular-nums flex-1">
              {isCompleted && loggedSet ? (
                <>
                  {formatWeight(loggedSet.weight)} &times; {loggedSet.actualReps}
                  {loggedSet.isAMRAP && (
                    <span className="text-warning ml-1 text-xs">AMRAP</span>
                  )}
                </>
              ) : (
                <>
                  {formatWeight(exercise.weight)} &times;{" "}
                  {exercise.targetReps}{isAMRAPSet ? "+" : ""}{" "}
                  <span className="text-xs opacity-60">target</span>
                </>
              )}
            </span>

            {/* RPE if available */}
            {isCompleted && loggedSet?.rpe != null && (
              <span className="text-xs opacity-60 shrink-0">
                RPE {loggedSet.rpe}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
