"use client";

import { Button } from "@/components/ui/button";
import { WorkoutComplete } from "@/components/ui/workout-complete";

interface WorkoutFinishedProps {
  setsLogged: number;
  /** m:ss */
  duration: string;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  error?: string | null;
}

/**
 * Shown when every set is done or the workout was ended early: save it and see
 * the summary. With nothing logged the first offer is to discard instead.
 */
export function WorkoutFinished({
  setsLogged,
  duration,
  isSaving,
  onSave,
  onDiscard,
  error,
}: WorkoutFinishedProps) {
  if (setsLogged === 0) {
    return (
      <div className="space-y-6 pt-8 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-bold">No Sets Logged</h1>
          <p className="text-sm text-muted-foreground">
            You completed the workout without logging any sets.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="space-y-3">
          <Button variant="destructive" className="h-12 w-full" onClick={onDiscard}>
            Discard Workout
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Anyway"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WorkoutComplete setsCompleted={setsLogged} duration={duration} />
      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="h-14 w-full text-base font-bold" onClick={onSave} disabled={isSaving}>
        {isSaving ? "Saving..." : "Finish & View Summary"}
      </Button>
    </div>
  );
}
