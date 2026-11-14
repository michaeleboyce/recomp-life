"use client";

import { useMemo } from "react";
import {
  combinedActivationHeat,
  loadFromSetCounts,
  relativeHeatLevels,
} from "@/lib/muscleLoad";
import { cn } from "@/lib/utils";
import { MuscleMap } from "./MuscleMap";

interface SessionMuscleFigureProps {
  /** Exercises in the session with sets completed so far (warm-ups excluded). */
  exercises: { exerciseId: string; completedSets: number }[];
  className?: string;
}

/**
 * The workout in progress drawn on the body: muscles worked so far, or, before
 * the first set, the muscles the session will target.
 */
export function SessionMuscleFigure({ exercises, className }: SessionMuscleFigureProps) {
  const { heat, started } = useMemo(() => {
    const load = loadFromSetCounts(
      exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.completedSets }))
    );
    const worked = relativeHeatLevels(load);
    if (Object.keys(worked).length > 0) return { heat: worked, started: true };
    return {
      heat: combinedActivationHeat(exercises.map((e) => e.exerciseId)),
      started: false,
    };
  }, [exercises]);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <MuscleMap
        heat={heat}
        className="h-28 shrink-0"
        label={started ? "Muscles worked so far" : "Muscles this workout targets"}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {started ? "Worked so far" : "Today's targets"}
        </p>
        <p className="text-xs text-muted-foreground">
          {started
            ? "Stronger colour means more sets completed."
            : "Fills in as you log sets."}
        </p>
      </div>
    </div>
  );
}
