"use client";

import { AMRAPGlow } from "@/components/ui/amrap-glow";
import { getExercise } from "@/lib/exercises";
import { describePlateLoad } from "@/lib/plates";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { EquipmentProfile, WorkoutLocation } from "@/types";

interface WeightDisplayProps {
  exercise: WorkoutExerciseState;
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  isAMRAPSet?: boolean;
  /** Opens how this weight was reached (the trace saved at start); no link without it. */
  onWhy?: () => void;
}

/** How to load or hold the weight, in a few words; null when there is nothing to add. */
function loadingLine(
  exercise: WorkoutExerciseState,
  location: WorkoutLocation,
  equipment: EquipmentProfile
): string | null {
  const info = getExercise(exercise.substituteExerciseId || exercise.exerciseId);

  if (info.type === "barbell" && location === "gym") {
    const load = describePlateLoad(exercise.weight, equipment.barWeight, equipment.availablePlates);
    if (load.plates.length === 0) {
      return load.exact ? "bar only" : `bar only (${load.loadableWeight} lbs)`;
    }
    const plates = `per side: ${load.plates.join(" · ")}`;
    return load.exact ? plates : `${plates} (loads ${load.loadableWeight} lbs)`;
  }

  if (info.type === "dumbbell") {
    return info.grip === "per_hand"
      ? "per hand"
      : info.grip === "single"
        ? "one dumbbell"
        : "one dumbbell, both hands";
  }

  return null;
}

/**
 * At home, for an exercise standing in for a barbell lift: the barbell weight the
 * program holds for that lift (the plan entry's `originalWeight`), which home sets do
 * not move. Null otherwise. Nothing is converted: the number shown above is the home
 * exercise's own weight.
 */
function programLine(exercise: WorkoutExerciseState, location: WorkoutLocation): string | null {
  if (location !== "home" || !exercise.substituteExerciseId || exercise.originalWeight == null) {
    return null;
  }
  const lift = getExercise(exercise.exerciseId).name;
  return `${lift} in the program: ${exercise.originalWeight} lbs`;
}

/** The weight for the set on screen, as the largest thing on it. */
export function WeightDisplay({
  exercise,
  location,
  equipment,
  isAMRAPSet = false,
  onWhy,
}: WeightDisplayProps) {
  const line = loadingLine(exercise, location, equipment);
  const program = programLine(exercise, location);

  return (
    <AMRAPGlow
      active={isAMRAPSet}
      className="flex flex-col items-center gap-1 border-transparent px-4 py-1"
    >
      <div className="flex items-baseline gap-2">
        <span
          data-testid="weight"
          className="font-display text-[96px] leading-[0.92] font-extrabold tracking-[-0.02em] tabular-nums"
        >
          {exercise.weight}
        </span>
        <span className="flex flex-col items-start gap-0.5">
          <span className="font-display text-lg font-extrabold text-muted-foreground uppercase">lbs</span>
          {onWhy && (
            <button
              type="button"
              onClick={onWhy}
              aria-label={`Why ${exercise.weight} lbs?`}
              className="-mx-1 min-h-8 px-1 text-xs font-semibold text-accent-primary underline decoration-dotted underline-offset-4"
            >
              why
            </button>
          )}
        </span>
      </div>
      {line && (
        <p data-testid="loading-line" className="font-mono text-sm font-medium text-foreground/80">
          {line}
        </p>
      )}
      {program && (
        <p data-testid="program-line" className="text-center text-[13px] text-muted-foreground">
          {program}
        </p>
      )}
    </AMRAPGlow>
  );
}
