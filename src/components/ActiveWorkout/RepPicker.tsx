"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_REPS, MIN_REPS, repChips } from "./activeWorkoutLogic";

interface RepPickerProps {
  targetReps: number;
  isAMRAP: boolean;
  value: number;
  onChange: (reps: number) => void;
  /** On an AMRAP set: rep counts from here up would be a new best. */
  highlightFrom?: number | null;
}

const STEP_BUTTON =
  "flex size-[60px] shrink-0 items-center justify-center rounded-2xl bg-card text-foreground transition-colors active:bg-card-raised disabled:opacity-40";

/**
 * Rep count for the set. The target arrives selected, so a set that hits target
 * needs no input here at all; the stepper and chips are for when it did not.
 */
export function RepPicker({
  targetReps,
  isAMRAP,
  value,
  onChange,
  highlightFrom = null,
}: RepPickerProps) {
  return (
    <section className="flex flex-col gap-2.5" aria-label="Reps">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Reps
      </h2>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="One fewer rep"
          className={STEP_BUTTON}
          disabled={value <= MIN_REPS}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-6" aria-hidden="true" />
        </button>
        <div className="flex flex-1 flex-col items-center">
          <span
            data-testid="rep-count"
            aria-live="polite"
            className="font-mono text-[44px] font-bold leading-none tabular-nums"
          >
            {value}
          </span>
          <span className="text-xs text-muted-foreground">
            target {targetReps}
            {isAMRAP ? "+" : ""}
          </span>
        </div>
        <button
          type="button"
          aria-label="One more rep"
          className={STEP_BUTTON}
          disabled={value >= MAX_REPS}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {repChips(targetReps).map((reps) => {
          const selected = reps === value;
          const wouldBeBest = isAMRAP && highlightFrom != null && reps >= highlightFrom;
          return (
            <button
              key={reps}
              type="button"
              aria-pressed={selected}
              aria-label={`${reps} ${reps === 1 ? "rep" : "reps"}${wouldBeBest ? ", new best" : ""}`}
              data-best={wouldBeBest || undefined}
              onClick={() => onChange(reps)}
              className={cn(
                "h-11 rounded-[10px] border-[1.5px] font-mono text-[15px] tabular-nums transition-colors",
                selected
                  ? "border-accent-primary bg-accent-primary-soft font-bold text-foreground"
                  : "border-transparent bg-card font-medium",
                !selected && (wouldBeBest ? "font-bold text-accent-primary" : "text-foreground"),
                !selected && reps < targetReps && "text-muted-foreground"
              )}
            >
              {reps}
            </button>
          );
        })}
      </div>
    </section>
  );
}
