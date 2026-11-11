"use client";

import { useMemo } from "react";
import type { MuscleId } from "@/types";
import type { FigureShape, FigureViewName } from "@/lib/anatomy/figureTypes";
import type { MuscleHeat } from "@/lib/muscleLoad";
import {
  MUSCLE_FIGURE_SLUGS,
  figureHeat,
  slugMuscles,
  slugToMuscle,
} from "@/lib/anatomy/regionMapping";
import { FIGURE_COLORS, HEAT_COLORS } from "@/lib/anatomy/palette";
import { formatMuscle } from "@/lib/muscles";
import { cn } from "@/lib/utils";
import { BodyFigure, type ShapeStyle } from "./BodyFigure";
import { useFigure } from "./useFigure";

interface MuscleMapProps {
  /** Heat level (0-4) per muscle. */
  heat?: MuscleHeat;
  /** Explicit colour per muscle (hex). Takes precedence over heat. */
  colors?: Partial<Record<MuscleId, string>>;
  selected?: MuscleId | null;
  /** When set, muscles are tappable. */
  onMusclePress?: (muscle: MuscleId) => void;
  /** Defaults to front and back. */
  views?: FigureViewName[];
  /** Must give the map a height, e.g. "h-40". */
  className?: string;
  /** Accessible description, e.g. "Muscles worked by Bench Press". */
  label?: string;
}

const DEFAULT_VIEWS: FigureViewName[] = ["front", "back"];

/**
 * 2D body (front and back) coloured by muscle. The lightweight anatomy view:
 * instant, no WebGL, and the fallback for the 3D model.
 */
export function MuscleMap({
  heat,
  colors,
  selected,
  onMusclePress,
  views = DEFAULT_VIEWS,
  className,
  label = "Muscle map",
}: MuscleMapProps) {
  const figure = useFigure();

  const heatByView = useMemo(
    () => ({
      front: figureHeat(heat ?? {}, "front"),
      back: figureHeat(heat ?? {}, "back"),
    }),
    [heat]
  );

  const styleFor = (viewName: FigureViewName) => (shape: FigureShape): ShapeStyle | undefined => {
    const principal = slugToMuscle(shape.slug, viewName);
    if (!principal) return undefined;

    let fill: string | undefined;
    if (colors) {
      const muscles = slugMuscles(shape.slug, viewName);
      const source = colors[principal] ? principal : muscles.find((m) => colors[m]);
      if (source) fill = colors[source];
    } else {
      const level = heatByView[viewName][shape.slug];
      if (level) fill = HEAT_COLORS[level];
    }

    const isSelected =
      !!selected && MUSCLE_FIGURE_SLUGS[selected][viewName].includes(shape.slug);
    if (isSelected) {
      return { fill: fill ?? FIGURE_COLORS.selected, stroke: FIGURE_COLORS.selectedStroke, strokeWidth: 1.75 };
    }
    return fill ? { fill } : undefined;
  };

  const labelFor = (viewName: FigureViewName) => (shape: FigureShape) => {
    const muscle = slugToMuscle(shape.slug, viewName);
    return muscle ? formatMuscle(muscle) : undefined;
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex items-stretch justify-center gap-[6%]", className)}
    >
      {views.map((viewName) => (
        <BodyFigure
          key={viewName}
          view={figure[viewName]}
          label={`${viewName === "front" ? "Front" : "Back"} of body`}
          styleFor={styleFor(viewName)}
          labelFor={onMusclePress ? labelFor(viewName) : undefined}
          onShapePress={
            onMusclePress
              ? (shape) => {
                  const muscle = slugToMuscle(shape.slug, viewName);
                  if (muscle) onMusclePress(muscle);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
