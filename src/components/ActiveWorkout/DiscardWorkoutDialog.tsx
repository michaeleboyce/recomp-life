"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DiscardWorkoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setsLogged: number;
  onDiscard: () => void;
}

export function DiscardWorkoutDialog({
  open,
  onOpenChange,
  setsLogged,
  onDiscard,
}: DiscardWorkoutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Discard Workout?</DialogTitle>
          <DialogDescription>
            {setsLogged > 0
              ? `You've logged ${setsLogged} set${setsLogged > 1 ? "s" : ""}. Discarding deletes all of them.`
              : "This workout will be discarded entirely."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep Going
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Discard Workout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
