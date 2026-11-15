"use client";

import { ChevronLeft } from "lucide-react";
import { getExercise } from "@/lib/exercises";

/** A list of exercises to choose from, used to pick a swap or an addition. */
export function ExercisePicker({
  title,
  exerciseIds,
  onPick,
  onBack,
}: {
  title: string;
  exerciseIds: string[];
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
        <ul aria-label="Choices" className="divide-y divide-border">
          {exerciseIds.map((id) => {
            const exercise = getExercise(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  className="flex min-h-11 w-full items-center py-2 text-left text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {exercise.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
