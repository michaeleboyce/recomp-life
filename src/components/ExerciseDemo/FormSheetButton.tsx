"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { EXERCISES } from "@/lib/exercises";
import { getExerciseMedia } from "@/lib/exerciseMedia";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PreferenceControl } from "@/components/Exercises/PreferenceControl";
import type { WorkoutLocation } from "@/types";

// The viewer pulls in the 3D code; load it only when the sheet is opened.
const ExerciseViewer = dynamic(
  () => import("./ExerciseViewer").then((m) => m.ExerciseViewer),
  { ssr: false }
);

interface FormSheetButtonProps {
  /** Where the workout is happening; preselects that scope for preferences. */
  location?: WorkoutLocation;
  exerciseId: string;
  className?: string;
}

/**
 * "Form" button for the active workout: opens a bottom sheet with the
 * exercise's visuals and how-to steps without leaving the workout.
 */
export function FormSheetButton({ exerciseId, location, className }: FormSheetButtonProps) {
  const [open, setOpen] = useState(false);
  const exercise = EXERCISES[exerciseId];
  if (!exercise) return null;
  const media = getExerciseMedia(exerciseId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
      >
        Form
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{exercise.name}</SheetTitle>
            <SheetDescription>Muscles worked and how to do it.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-6 space-y-4">
            {open && <ExerciseViewer exerciseId={exerciseId} heightClassName="h-64" />}
            <PreferenceControl exerciseId={exerciseId} defaultScope={location ?? "all"} />
            {media && (
              <ol className="space-y-1.5">
                {media.instructions.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed">
                    <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
