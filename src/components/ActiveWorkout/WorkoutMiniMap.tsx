"use client";

import { tierStyle } from "@/lib/tierStyle";
import type { WorkoutExerciseState } from "@/stores/workoutStore";

interface WorkoutMiniMapProps {
  exercises: WorkoutExerciseState[];
  currentExerciseIndex: number;
  onTap: () => void;
}

export function WorkoutMiniMap({
  exercises,
  currentExerciseIndex,
  onTap,
}: WorkoutMiniMapProps) {
  // Filter out warm-ups, track original indices
  const mainExerciseIndices = exercises
    .map((e, i) => ({ exercise: e, index: i }))
    .filter((item) => !item.exercise.isWarmUp);

  return (
    <button
      onClick={onTap}
      className="w-full px-4 py-2 flex items-center gap-2 active:bg-muted/30 transition-colors"
      aria-label="Open workout overview"
    >
      {mainExerciseIndices.map(({ exercise, index }, groupIdx) => {
        return (
          <div
            key={`${exercise.exerciseId}-${exercise.tier}-${groupIdx}`}
            className="flex gap-0.5 flex-1"
          >
            {Array.from({ length: exercise.targetSets }, (_, setIdx) => {
              const setDone = setIdx < exercise.completedSets;
              const isCurrent = index === currentExerciseIndex;
              const isCurrentSet =
                isCurrent && setIdx === exercise.completedSets;

              return (
                <div
                  key={setIdx}
                  className={`h-2 flex-1 rounded-full transition-all ${
                    setDone
                      ? tierStyle(exercise.tier).dot
                      : isCurrentSet
                        ? `${tierStyle(exercise.tier).dot} animate-pulse`
                        : tierStyle(exercise.tier).dotMuted
                  }`}
                />
              );
            })}
          </div>
        );
      })}

      {/* Chevron indicator */}
      <span className="text-muted-foreground text-xs ml-1 shrink-0">&#9660;</span>
    </button>
  );
}
