"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { minWeightFor, weightStepFor } from "@/components/ActiveWorkout/setPlan";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SwapPanel } from "@/components/Swap/SwapSheet";
import { prescriptionText } from "@/components/Swap/swapSheetModel";
import { useSwapContext } from "@/components/Swap/useSwapContext";
import { applyPreferences } from "@/lib/exercisePreferences";
import { EXERCISES, getExercise } from "@/lib/exercises";
import { prescribeSwap, replacementAddEdit, swapEdits, type SwapCandidate, type SwapSlot } from "@/lib/swap";
import { cn } from "@/lib/utils";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { PlannedSet, PrescribedEntry, Tier } from "@/types";
import { EditEntryRow } from "./EditEntryRow";
import { ExercisePicker } from "./ExercisePicker";
import { ImpactLine } from "./ImpactLine";
import type { WorkoutSetup } from "./useWorkoutSetup";

type Picking = { mode: "swap"; exerciseId: string; shownId: string; tier: Tier; slot: SwapSlot } | { mode: "add" } | null;

/** The swap sheet's picking state for a plan entry: that lift, its slot as planned. */
function swapPickingFor(entry: WorkoutExerciseState): Picking {
  return {
    mode: "swap",
    exerciseId: entry.exerciseId,
    shownId: entry.substituteExerciseId || entry.exerciseId,
    tier: entry.tier,
    slot: {
      tier: entry.tier,
      sets: entry.targetSets,
      reps: entry.targetReps,
      isAMRAP: entry.isAMRAP,
      weight: entry.weight,
      ...(entry.originalWeight != null ? { originalWeight: entry.originalWeight } : {}),
    },
  };
}

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
 *
 * With `swapLift` (Ready's home panel, "Change") it opens straight on that lift's swap
 * sheet, and leaving the swap sheet closes it.
 */
export function EditWorkoutSheet({
  setup,
  open,
  onOpenChange,
  swapLift = null,
}: {
  setup: WorkoutSetup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swapLift?: { exerciseId: string; tier: Tier } | null;
}) {
  const [chosen, setPicking] = useState<Picking>(null);
  const { plan, impact, edits, location, exercisePreferences, equipment } = setup;

  const rows = useMemo(() => plan.filter((entry) => !entry.isWarmUp), [plan]);
  const inPlan = useMemo(
    () => rows.flatMap((e) => [e.exerciseId, e.substituteExerciseId].filter((id): id is string => !!id)),
    [rows]
  );
  const notDone = impact.filter((item) => item.status === "not-done");
  const forcedEntry = swapLift
    ? rows.find((entry) => entry.exerciseId === swapLift.exerciseId && entry.tier === swapLift.tier)
    : undefined;
  const picking = useMemo(() => (forcedEntry ? swapPickingFor(forcedEntry) : chosen), [forcedEntry, chosen]);

  // What the swap sheet ranks from, for the entry being swapped (W10).
  const swapContext = useSwapContext({
    location,
    exclude: inPlan,
    ...(picking?.mode === "swap" ? { slot: picking.slot, liftId: picking.exerciseId } : {}),
    now: setup.accessorySource.now,
  });

  const choices = useMemo(() => {
    if (picking?.mode !== "add") return [];
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
  // Opened on one lift: leaving its swap sheet closes the whole sheet.
  const leaveSwap = () => (forcedEntry ? handleOpenChange(false) : setPicking(null));

  // An added exercise comes at its own prescription, as an accessory would (the swap logic's).
  const addPrescription = (exerciseId: string) =>
    swapContext ? prescribeSwap(exerciseId, exerciseId, { ...swapContext, slot: undefined }) : null;
  const add = (exerciseId: string) => {
    const prescription = addPrescription(exerciseId);
    if (prescription) setup.applyEdits([replacementAddEdit({ exerciseId, prescription })]);
    setPicking(null);
  };
  const swap = (picks: SwapCandidate[]) => {
    if (picking?.mode !== "swap") return;
    const [first, ...rest] = picks;
    if (first?.countsAs) {
      // One of the lift's home versions at home: done as the lift through the home-
      // substitute path (its own weight, progresses), not a swap. Any further pick is an
      // ordinary added exercise.
      setup.chooseSubstitute(picking.exerciseId, first.exerciseId);
      if (rest.length > 0) setup.applyEdits(rest.map((r) => replacementAddEdit(r)));
      return;
    }
    setup.applyEdits(swapEdits(picking.exerciseId, picking.tier, picks));
  };

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

        {picking?.mode === "swap" ? (
          <SwapPanel
            exerciseId={picking.exerciseId}
            shownId={picking.shownId}
            tier={picking.tier}
            context={swapContext}
            onConfirm={swap}
            onBack={leaveSwap}
            onDone={leaveSwap}
          />
        ) : picking?.mode === "add" ? (
          <ExercisePicker
            title="Add an exercise"
            exerciseIds={choices}
            prescriptionOf={(id) => {
              const p = addPrescription(id);
              return p ? prescriptionText(id, p, "accessory") : "";
            }}
            onPick={add}
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
                  onSwap={() => setPicking(swapPickingFor(entry))}
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
