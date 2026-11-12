"use client";

import { ListChecks } from "lucide-react";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { WorkoutMiniMap } from "./WorkoutMiniMap";

interface WorkoutHeaderProps {
  title: string;
  /** m:ss since the workout started. */
  elapsed: string;
  exercises?: WorkoutExerciseState[];
  currentExerciseIndex?: number;
  /** Shows the overview button when given. */
  onOpenOverview?: () => void;
}

export function WorkoutHeader({
  title,
  elapsed,
  exercises,
  currentExerciseIndex = -1,
  onOpenOverview,
}: WorkoutHeaderProps) {
  return (
    <header className="flex items-center gap-3">
      {onOpenOverview && (
        <button
          type="button"
          onClick={onOpenOverview}
          aria-label="Workout overview"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-foreground transition-colors active:bg-card-raised"
        >
          <ListChecks className="size-5" aria-hidden="true" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-[13px] text-muted-foreground">{title}</span>
        {exercises && exercises.length > 0 && (
          <WorkoutMiniMap exercises={exercises} currentExerciseIndex={currentExerciseIndex} />
        )}
      </div>
      <span
        className="font-mono text-[15px] font-medium tabular-nums text-muted-foreground"
        aria-label="Elapsed time"
      >
        {elapsed}
      </span>
    </header>
  );
}
