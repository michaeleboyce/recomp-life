"use client";

import { AMRAPGlow } from "@/components/ui/amrap-glow";
import { dumbbellToBarbell } from "@/lib/dbConversion";
import { getExercise } from "@/lib/exercises";
import { describePlateLoad } from "@/lib/plates";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { EquipmentProfile, WorkoutLocation } from "@/types";

interface WeightDisplayProps {
  exercise: WorkoutExerciseState;
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  isAMRAPSet?: boolean;
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
    const hold = info.grip === "per_hand" ? "per hand" : "one dumbbell, both hands";
    // A home substitute for a barbell lift: say what it stands in for.
    return location === "home" && exercise.substituteExerciseId
      ? `${hold} · = ${dumbbellToBarbell(exercise.weight)} lbs barbell equiv.`
      : hold;
  }

  return null;
}

/** The weight for the set on screen, as the largest thing on it. */
export function WeightDisplay({
  exercise,
  location,
  equipment,
  isAMRAPSet = false,
}: WeightDisplayProps) {
  const line = loadingLine(exercise, location, equipment);

  return (
    <AMRAPGlow
      active={isAMRAPSet}
      className="flex flex-col items-center gap-1 border-transparent px-4 py-1"
    >
      <p className="flex items-baseline gap-2">
        <span
          data-testid="weight"
          className="font-mono text-8xl font-bold leading-none tracking-tighter tabular-nums"
        >
          {exercise.weight}
        </span>
        <span className="font-mono text-xl font-medium text-muted-foreground">lbs</span>
      </p>
      {line && (
        <p data-testid="loading-line" className="font-mono text-sm font-medium text-foreground/80">
          {line}
        </p>
      )}
    </AMRAPGlow>
  );
}
