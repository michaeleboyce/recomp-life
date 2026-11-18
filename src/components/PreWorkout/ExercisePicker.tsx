"use client";

import { ChevronLeft } from "lucide-react";
import { getExercise } from "@/lib/exercises";

/**
 * A list of exercises to choose from (the edit sheet's "Add exercise"), each with what
 * it would be done at when `prescriptionOf` gives it, in the swap sheet's row design.
 */
export function ExercisePicker({
  title,
  exerciseIds,
  prescriptionOf,
  onPick,
  onBack,
}: {
  title: string;
  exerciseIds: string[];
  /** "45 lbs × 3 × 12" for an exercise; absent, only names are shown. */
  prescriptionOf?: (exerciseId: string) => string;
  onPick: (exerciseId: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-11 items-center gap-1 self-start rounded-lg pr-3 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back
      </button>
      <p className="text-sm font-semibold">{title}</p>
      {exerciseIds.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nothing else fits here.</p>
      ) : (
        <ul aria-label="Choices" className="flex flex-col gap-1.5 py-1">
          {exerciseIds.map((id) => {
            const exercise = getExercise(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-label={exercise.name}
                  onClick={() => onPick(id)}
                  className="flex min-h-11 w-full items-baseline justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 truncate text-[14px] font-semibold">{exercise.name}</span>
                  {prescriptionOf && (
                    <span data-testid="pick-prescription" className="shrink-0 font-mono text-xs font-semibold tabular-nums">
                      {prescriptionOf(id)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
