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
  remainingExercises: RemainingExercise[];
}

export function EndWorkoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  remainingExercises,
}: EndWorkoutConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>End Workout Early?</DialogTitle>
          <DialogDescription>
            The following exercises are incomplete:
          </DialogDescription>
        </DialogHeader>

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

        <p className="text-sm text-muted-foreground">
          Skipped and partial exercises will be frozen &mdash; your weights and
          stages won&apos;t change.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep Going
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            End Workout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
