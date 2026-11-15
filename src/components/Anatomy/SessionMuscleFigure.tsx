"use client";

import { useEffect, useMemo, useState } from "react";
import {
  combinedActivationHeat,
  loadFromSetCounts,
  relativeHeatLevels,
  type MuscleHeat,
} from "@/lib/muscleLoad";
import { cn } from "@/lib/utils";
import { MuscleMap } from "./MuscleMap";

interface SessionMuscleFigureProps {
  /** Exercises in the session with sets completed so far (warm-ups excluded). */
  exercises: { exerciseId: string; completedSets: number }[];
  className?: string;
}

/**
 * Each muscle's colour eases to its new level (400 ms, ease-out) so the figure visibly
 * fills in as sets are logged. Off under reduced motion: the colour simply changes.
 */
export const FILL_TRANSITION =
  "[&_path]:transition-[fill] [&_path]:duration-400 [&_path]:ease-out motion-reduce:[&_path]:transition-none";

/**
 * The heat last drawn for a session (keyed by its exercises), so a figure opened again
 * starts from what it showed before and fills in what was logged since.
 */
let lastDrawn: { key: string; heat: MuscleHeat } | null = null;

/** For tests: forget the last figure drawn. */
export function resetSessionFigureMemory(): void {
  lastDrawn = null;
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

  const key = exercises.map((e) => e.exerciseId).join("|");
  // First frame: what this session's figure showed last time; then today's heat, which
  // the fill transition eases into.
  const [drawn, setDrawn] = useState<MuscleHeat>(() =>
    lastDrawn && lastDrawn.key === key ? lastDrawn.heat : heat
  );
  useEffect(() => {
    lastDrawn = { key, heat };
    const frame = requestAnimationFrame(() => setDrawn(heat));
    return () => cancelAnimationFrame(frame);
  }, [key, heat]);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <MuscleMap
        heat={drawn}
        className={cn("h-28 shrink-0", FILL_TRANSITION)}
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
