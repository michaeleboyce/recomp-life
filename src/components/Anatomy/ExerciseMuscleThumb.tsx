"use client";

import { useMemo } from "react";
import { EXERCISES } from "@/lib/exercises";
import { activationHeatLevels, bestViewForExercise } from "@/lib/muscleLoad";
import { MuscleMap } from "./MuscleMap";

interface ExerciseMuscleThumbProps {
  exerciseId: string;
  /** "auto" shows only the side with the primary muscles (icon-sized use). */
  views?: "both" | "auto";
  /** Must set a height, e.g. "h-12". */
  className?: string;
}

/** Small body figure showing the muscles one exercise works. */
export function ExerciseMuscleThumb({
  exerciseId,
  views = "both",
  className,
}: ExerciseMuscleThumbProps) {
  const heat = useMemo(() => activationHeatLevels(exerciseId), [exerciseId]);
  const name = EXERCISES[exerciseId]?.name ?? "exercise";

  return (
    <MuscleMap
      heat={heat}
      views={views === "auto" ? [bestViewForExercise(exerciseId)] : undefined}
      className={className}
      label={`Muscles worked by ${name}`}
    />
  );
}
