"use client";

import { getExercise } from "@/lib/exercises";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { WorkoutExerciseState } from "@/stores/workoutStore";

interface WorkoutOverviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: WorkoutExerciseState[];
  currentExerciseIndex: number;
  onSelectExercise: (index: number) => void;
  elapsedTime: string;
}

function getTierColor(tier: string): string {
  switch (tier) {
    case "T1": return "bg-red-600 text-white";
    case "T2": return "bg-orange-500 text-white";
    case "T3": return "bg-blue-500 text-white";
    case "accessory": return "bg-green-600 text-white";
    default: return "bg-muted text-muted-foreground";
  }
}

export function WorkoutOverviewSheet({
  open,
  onOpenChange,
  exercises,
  currentExerciseIndex,
  onSelectExercise,
  elapsedTime,
}: WorkoutOverviewSheetProps) {
  // Filter out warm-ups but track original indices
  const mainExercises = exercises
    .map((e, i) => ({ exercise: e, originalIndex: i }))
    .filter((item) => !item.exercise.isWarmUp);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Workout Overview</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto flex-1 py-2 space-y-1">
          {mainExercises.map(({ exercise, originalIndex }, idx) => {
            const exerciseInfo = getExercise(
              exercise.substituteExerciseId || exercise.exerciseId
            );
            const isCurrent = originalIndex === currentExerciseIndex;
            const isCompleted =
              exercise.completedSets >= exercise.targetSets;
            const isDumbbell = exerciseInfo.grip === "per_hand";
            const weightLabel = isDumbbell
              ? `${exercise.weight}/h`
              : `${exercise.weight} lbs`;

            return (
              <button
                key={`${exercise.exerciseId}-${exercise.tier}-${idx}`}
                onClick={() => {
                  onSelectExercise(originalIndex);
                  onOpenChange(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                  isCurrent
                    ? "bg-accent-primary/10 ring-1 ring-accent-primary/30"
                    : "active:bg-muted/50"
                } ${isCompleted ? "opacity-60" : ""}`}
              >
                {/* Status indicator */}
                <span className="w-5 text-center shrink-0">
                  {isCompleted && (
                    <span className="text-green-500">&#10003;</span>
                  )}
                  {isCurrent && !isCompleted && (
                    <span className="text-accent-primary font-bold">&rarr;</span>
                  )}
                  {!isCompleted && !isCurrent && (
                    <span className="text-muted-foreground/40">&#9675;</span>
                  )}
                </span>

                {/* Tier badge */}
                <Badge className={`${getTierColor(exercise.tier)} text-[10px] px-1.5 py-0 shrink-0`}>
                  {exercise.tier === "accessory" ? "Acc" : exercise.tier}
                </Badge>

                {/* Exercise name */}
                <span className="flex-1 truncate text-sm">
                  {exerciseInfo.name}
                </span>

                {/* Weight */}
                <span className="text-sm font-mono tabular-nums text-muted-foreground shrink-0">
                  {weightLabel}
                </span>

                {/* Set progress */}
                <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                  {exercise.completedSets}/{exercise.targetSets}
                </span>
              </button>
            );
          })}
        </div>

        {/* Elapsed time */}
        <div className="pt-2 pb-4 text-center text-sm text-muted-foreground font-mono tabular-nums border-t">
          Elapsed: {elapsedTime}
        </div>
      </SheetContent>
    </Sheet>
  );
}
