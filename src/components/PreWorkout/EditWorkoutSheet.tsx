"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { minWeightFor, weightStepFor } from "@/components/ActiveWorkout/setPlan";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { applyPreferences } from "@/lib/exercisePreferences";
import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES, getExercise } from "@/lib/exercises";
import { swapCandidates } from "@/lib/swapCandidates";
import { cn } from "@/lib/utils";
import type { PlannedSet, PrescribedEntry, Tier } from "@/types";
import { EditEntryRow } from "./EditEntryRow";
import { ExercisePicker } from "./ExercisePicker";
import { ImpactLine } from "./ImpactLine";
import type { WorkoutSetup } from "./useWorkoutSetup";

/** Sets and reps a newly added exercise starts with. */
export const ADDED_EXERCISE_SETS = 3;
export const ADDED_EXERCISE_REPS = 12;

type Picking = { mode: "swap"; exerciseId: string; tier: Tier } | { mode: "add" } | null;

/**
 * The program's own sets for an entry, for "Plan · You" in the per-set editor: what was
 * prescribed for the lift at its tier (the home exercise's own weight and scheme when it
 * is done as that). Undefined for an entry the program did not prescribe (an accessory,
 * an added exercise, a swap to something else), which then compares with nothing.
 */
export function prescribedSetsFor(
  entry: { exerciseId: string; substituteExerciseId?: string; tier: Tier },
  prescribed: readonly PrescribedEntry[]
): PlannedSet[] | undefined {
  const found = prescribed.find((p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier);
  if (!found) return undefined;
  const performed = entry.substituteExerciseId || entry.exerciseId;
  const source = found.home
    ? found.home.exerciseId === performed
      ? found.home
      : null
    : performed === found.exerciseId
      ? found
      : null;
  if (!source || !(source.sets > 0)) return undefined;
  return Array.from({ length: source.sets }, () => ({ weight: source.weight, reps: source.reps }));
}

/**
 * Edit the day's workout before starting: swap, remove, add, change sets, reps and
 * weight. Every program lift shows whether it still counts toward progression.
 */
export function EditWorkoutSheet({
  setup,
  open,
  onOpenChange,
}: {
  setup: WorkoutSetup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [picking, setPicking] = useState<Picking>(null);
  const { plan, impact, edits, location, exercisePreferences, equipment } = setup;

  const rows = useMemo(() => plan.filter((entry) => !entry.isWarmUp), [plan]);
  const inPlan = useMemo(
    () => rows.flatMap((e) => [e.exerciseId, e.substituteExerciseId].filter((id): id is string => !!id)),
    [rows]
  );
  const notDone = impact.filter((item) => item.status === "not-done");

  const choices = useMemo(() => {
    if (!picking) return [];
    if (picking.mode === "swap") {
      return swapCandidates(picking.exerciseId, {
        location,
        preferences: exercisePreferences,
        exclude: inPlan,
      }).map((exercise) => exercise.id);
    }
    const ids = Object.values(EXERCISES)
      .filter((exercise) => !inPlan.includes(exercise.id))
      .filter((exercise) => location === "gym" || !exercise.requiresGym)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((exercise) => exercise.id);
    return applyPreferences(ids, exercisePreferences);
  }, [picking, location, exercisePreferences, inPlan]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setPicking(null);
    onOpenChange(next);
  };

  const pick = (exerciseId: string) => {
    if (picking?.mode === "swap") {
      setup.swapExercise(picking.exerciseId, picking.tier, exerciseId);
    } else if (picking?.mode === "add") {
      setup.addExercise(exerciseId, {
        sets: ADDED_EXERCISE_SETS,
        reps: ADDED_EXERCISE_REPS,
        weight: DEFAULT_ACCESSORY_WEIGHTS[exerciseId] ?? 0,
        isAMRAP: false,
      });
    }
    setPicking(null);
  };

  const pickerTitle =
    picking?.mode === "swap"
      ? `Swap ${getExercise(picking.exerciseId).name} for`
      : "Add an exercise";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-y-auto rounded-t-3xl border-border bg-card px-5 pt-5",
          "pb-[calc(env(safe-area-inset-bottom)+20px)]"
        )}
      >
        <SheetTitle className="pr-8 text-lg">Edit workout</SheetTitle>
        <SheetDescription className="mb-2 text-sm text-muted-foreground">
          Changes apply to this workout only.
        </SheetDescription>

        {picking ? (
          <ExercisePicker
            title={pickerTitle}
            exerciseIds={choices}
            onPick={pick}
            onBack={() => setPicking(null)}
          />
        ) : (
          <>
            <ul aria-label="Workout exercises" className="divide-y divide-border">
              {rows.map((entry) => (
                <EditEntryRow
                  key={`${entry.exerciseId}-${entry.tier}`}
                  entry={entry}
                  impact={impact.find(
                    (item) =>
                      item.edited &&
                      item.status !== "not-done" &&
                      item.exerciseId === entry.exerciseId &&
                      item.tier === entry.tier
                  )}
                  onSwap={() => setPicking({ mode: "swap", exerciseId: entry.exerciseId, tier: entry.tier })}
                  onRemove={() => setup.removeExercise(entry.exerciseId, entry.tier)}
                  onScheme={(sets, reps) => setup.setScheme(entry.exerciseId, entry.tier, sets, reps)}
                  onWeight={(weight) => setup.setWeight(entry.exerciseId, entry.tier, weight)}
                  onSetWeights={(sets) => setup.setSetWeights(entry.exerciseId, entry.tier, sets)}
                  planSets={prescribedSetsFor(entry, setup.prescribed)}
                  weightStep={weightStepFor(entry.substituteExerciseId || entry.exerciseId, location, equipment)}
                  minWeight={minWeightFor(entry.substituteExerciseId || entry.exerciseId, location, equipment)}
                />
              ))}
            </ul>

            {notDone.length > 0 && (
              <ul aria-label="Not done today" className="flex flex-col gap-2 border-t border-border py-3">
                {notDone.map((item) => (
                  <li key={`${item.exerciseId}-${item.tier}`} className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">{getExercise(item.exerciseId).name}</p>
                    <ImpactLine status="not-done" />
                  </li>
                ))}
              </ul>
            )}

            {edits.length > 0 && (
              <div className="border-t border-border py-3">
                <EvidenceLine ruleId="off-program-credit" hideLibraryLink />
              </div>
            )}

            <div className="flex gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                className="min-h-11 flex-1"
                onClick={() => setPicking({ mode: "add" })}
              >
                <Plus aria-hidden="true" />
                Add exercise
              </Button>
              <Button
                variant="outline"
                className="min-h-11 flex-1"
                disabled={edits.length === 0}
                onClick={setup.resetEdits}
              >
                <RotateCcw aria-hidden="true" />
                Reset to program
              </Button>
            </div>
            <Button className="mt-2 min-h-11" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
