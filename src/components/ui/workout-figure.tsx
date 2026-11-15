"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"
import type { FigureViewName } from "@/lib/anatomy/figureTypes"
import { EXERCISES } from "@/lib/exercises"
import { tieredActivationHeat } from "@/lib/muscleLoad"
import { MuscleMap } from "@/components/Anatomy/MuscleMap"

export interface WorkoutFigureProps {
  /** In workout order: T1 first, then T2, then T3. Earlier lifts draw brighter. */
  exerciseIds: string[]
  /** Defaults to front and back. */
  views?: FigureViewName[]
  /** Must give the figure a height, e.g. "h-32" (default "h-32"). */
  className?: string
}

function listNames(ids: string[]): string {
  const names = ids.map((id) => EXERCISES[id]?.name ?? id)
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/**
 * The 2D body for a whole workout: muscles lit by how hard each lift uses
 * them, with the main lift brightest (see tieredActivationHeat).
 */
function WorkoutFigure({ exerciseIds, views, className }: WorkoutFigureProps) {
  const key = exerciseIds.join("|")
  // Keyed on the ids, not the array, so a fresh array each render does not recompute.
  const heat = useMemo(() => tieredActivationHeat(key ? key.split("|") : []), [key])
  return (
    <MuscleMap
      heat={heat}
      views={views}
      className={cn("h-32", className)}
      label={`Muscles worked by ${listNames(exerciseIds)}`}
    />
  )
}

export { WorkoutFigure }
