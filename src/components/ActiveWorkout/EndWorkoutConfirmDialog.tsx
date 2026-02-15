"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RemainingExercise {
  name: string;
  tier: string;
  setsCompleted: number;
  targetSets: number;
}

interface EndWorkoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  remainingExercises: RemainingExercise[];
  setsLogged: number;
}

export function EndWorkoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  remainingExercises,
  setsLogged,
}: EndWorkoutConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>End Workout Early?</DialogTitle>
          <DialogDescription>
            {setsLogged === 0
              ? "You haven't logged any sets yet."
              : "The following exercises are incomplete:"}
          </DialogDescription>
        </DialogHeader>

        {setsLogged > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {remainingExercises.map((ex) => (
              <li key={`${ex.name}-${ex.tier}`}>
                {ex.name} ({ex.tier}) &mdash;{" "}
                {ex.setsCompleted === 0
                  ? "skipped"
                  : `${ex.setsCompleted}/${ex.targetSets} sets`}
              </li>
            ))}
          </ul>
        )}

        {setsLogged > 0 && (
          <p className="text-sm text-muted-foreground">
            Skipped and partial exercises will be frozen &mdash; your weights and
            stages won&apos;t change.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep Going
          </Button>
          {setsLogged > 0 && (
            <Button variant="destructive" onClick={onConfirm}>
              End &amp; Save Progress
            </Button>
          )}
          <Button
            variant="outline"
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
            onClick={onCancel}
          >
            {setsLogged === 0 ? "Discard Workout" : "Cancel & Discard All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
