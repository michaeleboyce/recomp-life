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
import { Term } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";

interface RemainingExercise {
  name: string;
  tier: string;
  setsCompleted: number;
  targetSets: number;
}

interface EndWorkoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** End now and save what was logged. */
  onConfirm: () => void;
  /** Leave the screen with everything kept; Today offers Resume. */
  onLeave: () => void;
  /** Discard the whole workout. */
  onCancel: () => void;
  remainingExercises: RemainingExercise[];
  setsLogged: number;
}

const TIER_TERM: Record<string, TermId> = { T1: "t1", T2: "t2", T3: "t3" };

/**
 * Opened by Back and by "End workout" in the overview. Keep going is the default
 * (focused, first); leaving keeps everything for later; ending saves what was
 * logged; discarding is last and the only destructive choice.
 */
export function EndWorkoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onLeave,
  onCancel,
  remainingExercises,
  setsLogged,
}: EndWorkoutConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Stop here?</DialogTitle>
          <DialogDescription>
            {setsLogged === 0
              ? "You haven't logged any sets yet."
              : "The following exercises are incomplete:"}
          </DialogDescription>
        </DialogHeader>

        {setsLogged > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {remainingExercises.map((ex) => {
              const term = TIER_TERM[ex.tier];
              return (
                <li key={`${ex.name}-${ex.tier}`}>
                  {ex.name} (
                  {term ? (
                    <Term id={term} hideLinks>
                      {ex.tier}
                    </Term>
                  ) : (
                    ex.tier
                  )}
                  ) &mdash;{" "}
                  {ex.setsCompleted === 0 ? "skipped" : `${ex.setsCompleted}/${ex.targetSets} sets`}
                </li>
              );
            })}
          </ul>
        )}

        {setsLogged > 0 && (
          <p className="text-sm text-muted-foreground">
            Ending now freezes skipped and partial exercises: their weights and{" "}
            <Term id="stage" hideLinks>
              stages
            </Term>{" "}
            won&apos;t change.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button autoFocus onClick={() => onOpenChange(false)}>
            Keep going
          </Button>
          <Button variant="outline" onClick={onLeave}>
            Leave, resume later
          </Button>
          {setsLogged > 0 && (
            <Button variant="outline" onClick={onConfirm}>
              End &amp; Save Progress
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={onCancel}
          >
            {setsLogged === 0 ? "Discard workout" : "Discard workout and all its sets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
