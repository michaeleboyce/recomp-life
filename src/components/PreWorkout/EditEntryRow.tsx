"use client";

import { Repeat2, Trash2 } from "lucide-react";
import { TierBadge } from "@/components/ui/tier-badge";
import { getExercise } from "@/lib/exercises";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { ImpactLine } from "./ImpactLine";
import type { ImpactItem } from "./impact";
import { Stepper } from "./Stepper";

export const WEIGHT_STEP_LBS = 5;

const iconButton =
  "inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** One working entry in the edit sheet: swap, remove, sets, reps, weight and its impact. */
export function EditEntryRow({
  entry,
  impact,
  onSwap,
  onRemove,
  onScheme,
  onWeight,
}: {
  entry: WorkoutExerciseState;
  /** Set when the entry is a program lift of an edited day and has been edited. */
  impact: ImpactItem | undefined;
  onSwap: () => void;
  onRemove: () => void;
  onScheme: (sets: number, reps: number) => void;
  onWeight: (weight: number) => void;
}) {
  const name = getExercise(entry.substituteExerciseId || entry.exerciseId).name;
  return (
    <li data-testid="edit-entry" className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <TierBadge tier={entry.tier} variant="soft" className="w-10 rounded-md" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
        <button type="button" className={iconButton} aria-label={`Swap ${name}`} onClick={onSwap}>
          <Repeat2 className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={iconButton} aria-label={`Remove ${name}`} onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stepper
          label={`${name} sets`}
          value={entry.targetSets}
          min={1}
          onChange={(sets) => onScheme(sets, entry.targetReps)}
        />
        <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">×</span>
        <Stepper
          label={`${name} reps`}
          value={entry.targetReps}
          min={1}
          onChange={(reps) => onScheme(entry.targetSets, reps)}
        />
        <Stepper
          label={`${name} weight`}
          value={entry.weight}
          unit="lbs"
          step={WEIGHT_STEP_LBS}
          onChange={onWeight}
        />
      </div>
      {impact && <ImpactLine status={impact.status} heavier={impact.heavier} />}
    </li>
  );
}
