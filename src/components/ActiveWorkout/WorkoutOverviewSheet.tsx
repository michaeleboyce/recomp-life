"use client";

import { ArrowRight, Check, Circle } from "lucide-react";
import { getExercise } from "@/lib/exercises";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/ui/tier-badge";
import { SessionMuscleFigure } from "@/components/Anatomy/SessionMuscleFigure";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { SetLog } from "@/types";

interface WorkoutOverviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: WorkoutExerciseState[];
  /** Every set logged so far; each row shows the reps done for its exercise. */
  sets?: SetLog[];
  currentExerciseIndex: number;
  onSelectExercise: (index: number) => void;
  elapsedTime: string;
  onEndWorkout: () => void;
  onDiscard: () => void;
}

/**
 * The whole workout at a glance: muscles worked, every exercise with its progress
 * (tap one to jump to it), and the ways out (end early, discard).
 */
export function WorkoutOverviewSheet({
  open,
  onOpenChange,
  exercises,
  sets = [],
  currentExerciseIndex,
  onSelectExercise,
  elapsedTime,
  onEndWorkout,
  onDiscard,
}: WorkoutOverviewSheetProps) {
  // Warm-ups are not listed, but the original indices are kept for jumping.
  const mainExercises = exercises
    .map((e, i) => ({ exercise: e, originalIndex: i }))
    .filter((item) => !item.exercise.isWarmUp);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Workout Overview</SheetTitle>
          <SheetDescription className="sr-only">
            Progress through each exercise. Tap one to jump to it.
          </SheetDescription>
        </SheetHeader>

        <SessionMuscleFigure
          className="px-4 pb-2"
          exercises={mainExercises.map(({ exercise }) => ({
            exerciseId: exercise.substituteExerciseId || exercise.exerciseId,
            completedSets: exercise.completedSets,
          }))}
        />

        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {mainExercises.map(({ exercise, originalIndex }, idx) => {
            const exerciseInfo = getExercise(
              exercise.substituteExerciseId || exercise.exerciseId
            );
            const isCurrent = originalIndex === currentExerciseIndex;
            const isCompleted = exercise.completedSets >= exercise.targetSets;
            const weightLabel =
              exerciseInfo.grip === "per_hand"
                ? `${exercise.weight}/h`
                : `${exercise.weight} lbs`;
            const loggedReps = workingSetsFor(sets, exercise.exerciseId, exercise.tier).map(
              (set) => set.actualReps
            );

            return (
              <button
                key={`${exercise.exerciseId}-${exercise.tier}-${idx}`}
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                disabled={isCompleted}
                onClick={() => {
                  onSelectExercise(originalIndex);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                  isCurrent
                    ? "bg-accent-primary/10 ring-1 ring-accent-primary/30"
                    : "active:bg-muted/50",
                  isCompleted && "opacity-60"
                )}
              >
                <span className="flex w-5 shrink-0 justify-center">
                  {isCompleted ? (
                    <Check className="size-4 text-success" aria-label="Done" />
                  ) : isCurrent ? (
                    <ArrowRight className="size-4 text-accent-primary" aria-label="Current" />
                  ) : (
                    <Circle className="size-3 text-muted-foreground/40" aria-hidden="true" />
                  )}
                </span>

                <TierBadge tier={exercise.tier} variant="soft" className="text-[10px]" />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{exerciseInfo.name}</span>
                  {loggedReps.length > 0 && (
                    <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                      reps: {loggedReps.join(" · ")}
                    </span>
                  )}
                </span>

                <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  {weightLabel}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {exercise.completedSets}/{exercise.targetSets}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3 border-t px-4 pt-3 pb-5">
          <p className="text-center font-mono text-sm tabular-nums text-muted-foreground">
            Elapsed: {elapsedTime}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => {
                onOpenChange(false);
                onEndWorkout();
              }}
            >
              End workout
            </Button>
            <Button
              variant="ghost"
              className="h-11 flex-1 text-destructive hover:text-destructive"
              onClick={() => {
                onOpenChange(false);
                onDiscard();
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
