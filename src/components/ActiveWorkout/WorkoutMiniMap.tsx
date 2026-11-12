"use client";

import { cn } from "@/lib/utils";
import { tierStyle } from "@/lib/tierStyle";
import type { WorkoutExerciseState } from "@/lib/workout/types";

interface WorkoutMiniMapProps {
  exercises: WorkoutExerciseState[];
  currentExerciseIndex: number;
  className?: string;
}

/**
 * The workout as a strip: one segment per working set, grouped by exercise and
 * tinted by tier. Done sets are solid, the set on screen is bright, the rest muted.
 * Warm-ups are not drawn.
 */
export function WorkoutMiniMap({
  exercises,
  currentExerciseIndex,
  className,
}: WorkoutMiniMapProps) {
  const groups = exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter((item) => !item.exercise.isWarmUp);

  const total = groups.reduce((sum, g) => sum + g.exercise.targetSets, 0);
  const done = groups.reduce(
    (sum, g) => sum + Math.min(g.exercise.completedSets, g.exercise.targetSets),
    0
  );

  return (
    <div
      role="img"
      aria-label={`${done} of ${total} sets done`}
      className={cn("flex gap-1.5", className)}
    >
      {groups.map(({ exercise, index }, groupIdx) => (
        <div
          key={`${exercise.exerciseId}-${exercise.tier}-${groupIdx}`}
          className="flex gap-[3px]"
          style={{ flexGrow: exercise.targetSets, flexBasis: 0 }}
        >
          {Array.from({ length: exercise.targetSets }, (_, setIdx) => {
            const isDone = setIdx < exercise.completedSets;
            const isCurrent =
              index === currentExerciseIndex && setIdx === exercise.completedSets;
            const style = tierStyle(exercise.tier);
            return (
              <span
                key={setIdx}
                data-state={isDone ? "done" : isCurrent ? "current" : "todo"}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  isDone ? style.dot : isCurrent ? "bg-foreground" : style.dotMuted
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
