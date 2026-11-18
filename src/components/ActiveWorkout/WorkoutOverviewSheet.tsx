"use client";

import { useState } from "react";
import { ArrowRight, Check, Circle, Pencil, Repeat2, Trash2 } from "lucide-react";
import { repsInReserveLabel } from "@/lib/effort";
import { getExercise } from "@/lib/exercises";
import { isDroppedEntry } from "@/lib/swap";
import type { LogChange } from "@/lib/rebuild";
import { entrySetsFor } from "@/lib/workout/setSelectors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/ui/tier-badge";
import { SessionMuscleFigure } from "@/components/Anatomy/SessionMuscleFigure";
import { SetEditSheet } from "@/components/LogEdit";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { SetLog } from "@/types";
import { attachDrops, isDropSet, roleLabel } from "./setPlan";

interface WorkoutOverviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: WorkoutExerciseState[];
  /** Every set logged so far; each exercise lists its working sets. */
  sets?: SetLog[];
  currentExerciseIndex: number;
  /** Jumps to an exercise. Left out (the workout is over), the rows are not tappable. */
  onSelectExercise?: (index: number) => void;
  elapsedTime: string;
  /** Left out when the workout has already been ended. */
  onEndWorkout?: () => void;
  onDiscard: () => void;
  /** The workout in progress. With `onCorrectSet`, logged sets can be corrected. */
  workoutId?: string;
  /**
   * Saves a correction to a logged set (an `editSet` or `deleteSet` change). Resolve
   * false to keep the edit sheet open, with `correctionError` saying why.
   */
  onCorrectSet?: (change: LogChange) => Promise<boolean>;
  correctionError?: string | null;
  /** Called when the edit sheet opens, so an old error is not shown for a new set. */
  onCorrectionStart?: () => void;
  /** Opens the swap sheet for an exercise not yet finished, by its index (W11). */
  onSwapExercise?: (index: number) => void;
  /** Removes an exercise with no set logged, by its index (W11). */
  onRemoveExercise?: (index: number) => void;
}

function setSummary(set: SetLog, perHand: boolean): string {
  const reps = `${set.actualReps} ${set.actualReps === 1 ? "rep" : "reps"}`;
  const weight = `${set.weight} ${perHand ? "lbs per hand" : "lbs"}`;
  const effort = set.repsInReserve != null ? `, ${repsInReserveLabel(set.repsInReserve)}` : "";
  const missed = set.status === "failed" ? `, below the target of ${set.targetReps}` : "";
  return `${reps} at ${weight}${effort}${missed}`;
}

/**
 * The whole workout at a glance: muscles worked, every exercise with its progress
 * (tap one to jump to it) and its logged sets (tap one to correct or delete it),
 * and the ways out (end early, discard).
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
  workoutId,
  onCorrectSet,
  correctionError,
  onCorrectionStart,
  onSwapExercise,
  onRemoveExercise,
}: WorkoutOverviewSheetProps) {
  // The set in the edit sheet. Kept after closing so the sheet can animate out.
  const [editing, setEditing] = useState<SetLog | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const canCorrect = !!workoutId && !!onCorrectSet;

  // Warm-ups are not listed, nor exercises removed or swapped out before a set; the
  // original indices are kept for jumping.
  const mainExercises = exercises
    .map((e, i) => ({ exercise: e, originalIndex: i }))
    .filter((item) => !item.exercise.isWarmUp && !isDroppedEntry(item.exercise));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Workout Overview</SheetTitle>
            <SheetDescription className="sr-only">
              Progress through each exercise. Tap an exercise to jump to it, or a logged set
              to correct it.
            </SheetDescription>
          </SheetHeader>

          <SessionMuscleFigure
            className="px-4 pb-2"
            exercises={mainExercises.map(({ exercise }) => ({
              exerciseId: exercise.substituteExerciseId || exercise.exerciseId,
              completedSets: exercise.completedSets,
            }))}
          />

          <ul className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
            {mainExercises.map(({ exercise, originalIndex }, idx) => {
              const exerciseInfo = getExercise(
                exercise.substituteExerciseId || exercise.exerciseId
              );
              const perHand = exerciseInfo.grip === "per_hand";
              const isCurrent = originalIndex === currentExerciseIndex;
              const isCompleted = exercise.completedSets >= exercise.targetSets;
              const weightLabel = perHand ? `${exercise.weight}/h` : `${exercise.weight} lbs`;
              // Every set logged for the entry (ramp and back-off sets too), each followed
              // by its drops, so any of them can be corrected.
              const logged = attachDrops(entrySetsFor(sets, exercise.exerciseId, exercise.tier)).flatMap(
                (row) => [row.set, ...row.drops]
              );

              const rowClass = cn(
                "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                isCurrent
                  ? "bg-accent-primary/10 ring-1 ring-accent-primary/30"
                  : onSelectExercise && "active:bg-muted/50",
                isCompleted && "opacity-60"
              );
              const row = (
                <>
                  <span className="flex w-5 shrink-0 justify-center">
                    {isCompleted ? (
                      <Check className="size-4 text-success" aria-label="Done" />
                    ) : isCurrent ? (
                      <ArrowRight className="size-4 text-accent-primary" aria-label="Current" />
                    ) : (
                      <Circle className="size-3 text-muted-foreground/40" aria-hidden="true" />
                    )}
                  </span>

                  <TierBadge tier={exercise.tier} variant="soft" className="text-[12px]" />

                  <span className="min-w-0 flex-1 truncate text-sm">{exerciseInfo.name}</span>

                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {weightLabel}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {exercise.completedSets}/{exercise.targetSets}
                  </span>
                </>
              );

              return (
                <li key={`${exercise.exerciseId}-${exercise.tier}-${idx}`}>
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      {onSelectExercise ? (
                        <button
                          type="button"
                          aria-current={isCurrent ? "step" : undefined}
                          disabled={isCompleted}
                          onClick={() => {
                            onSelectExercise(originalIndex);
                            onOpenChange(false);
                          }}
                          className={rowClass}
                        >
                          {row}
                        </button>
                      ) : (
                        <div className={rowClass}>{row}</div>
                      )}
                    </div>
                    {!isCompleted && onSwapExercise && (
                      <button
                        type="button"
                        aria-label={`Swap ${exerciseInfo.name}`}
                        onClick={() => {
                          onOpenChange(false);
                          onSwapExercise(originalIndex);
                        }}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <Repeat2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                    {exercise.completedSets === 0 && !isCompleted && onRemoveExercise && (
                      <button
                        type="button"
                        aria-label={`Remove ${exerciseInfo.name}`}
                        onClick={() => onRemoveExercise(originalIndex)}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {logged.length > 0 && (
                    <ul
                      aria-label={`${exerciseInfo.name} logged sets`}
                      className="flex flex-wrap gap-2 pt-1 pr-3 pb-2 pl-11"
                    >
                      {logged.map((set) => {
                        const drop = isDropSet(set);
                        const role = roleLabel(set.role);
                        const text = drop ? (
                          <>
                            <span aria-hidden="true" className="text-muted-foreground">↳</span>
                            <span className="font-semibold text-foreground">
                              {set.weight}×{set.actualReps}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              Set {set.setNumber}
                              {role ? ` · ${role.toLowerCase()}` : ""}
                            </span>
                            <span className="font-semibold text-foreground">
                              {set.actualReps} {set.actualReps === 1 ? "rep" : "reps"}
                            </span>
                            {set.status === "failed" && (
                              <span className="text-muted-foreground">missed</span>
                            )}
                          </>
                        );
                        const what = drop
                          ? `drop after set ${set.setNumber}`
                          : `set ${set.setNumber}${role ? ` (${role.toLowerCase()})` : ""}`;
                        const chipClass =
                          "flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 font-mono text-xs tabular-nums";
                        return (
                          <li key={set.id}>
                            {canCorrect ? (
                              <button
                                type="button"
                                aria-label={`Correct ${what} of ${exerciseInfo.name}: ${setSummary(set, perHand)}`}
                                onClick={() => {
                                  onCorrectionStart?.();
                                  setEditing(set);
                                  setEditOpen(true);
                                }}
                                className={cn(chipClass, "transition-colors active:bg-card-raised")}
                              >
                                {text}
                                <Pencil className="size-3.5 text-accent-primary" aria-hidden="true" />
                              </button>
                            ) : (
                              <span className={chipClass}>{text}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="space-y-3 border-t px-4 pt-3 pb-5">
            <p className="text-center font-mono text-sm tabular-nums text-muted-foreground">
              Elapsed: {elapsedTime}
            </p>
            <div className="flex gap-2">
              {onEndWorkout && (
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
              )}
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

      {canCorrect && editing && (
        <SetEditSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          workoutId={workoutId}
          set={editing}
          onSubmit={onCorrectSet}
          error={correctionError}
        />
      )}
    </>
  );
}
