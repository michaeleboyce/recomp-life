"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { FigureShape, FigureSlug, FigureView } from "@/lib/anatomy/figureTypes";
import { FIGURE_COLORS } from "@/lib/anatomy/palette";
import { cn } from "@/lib/utils";

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  /** In screen pixels (strokes do not scale with the figure). */
  strokeWidth?: number;
}

interface BodyFigureProps {
  view: FigureView;
  /** Accessible name for the whole figure. */
  label: string;
  /** Colour for a shape. Unstyled shapes use the resting colours. */
  styleFor?: (shape: FigureShape) => ShapeStyle | undefined;
  /** Accessible name for a shape. A shape is tappable only when this returns a name. */
  labelFor?: (shape: FigureShape) => string | undefined;
  onShapePress?: (shape: FigureShape) => void;
  /** Extra SVG drawn over the figure, in view-box units (joint markers). */
  children?: ReactNode;
  className?: string;
}

const INERT: ReadonlySet<FigureSlug> = new Set<FigureSlug>([
  "head",
  "hands",
  "feet",
  "ankles",
  "knees",
  "neck",
  "tibialis",
]);

function restingFill(slug: FigureSlug): string {
  if (slug === "hair") return FIGURE_COLORS.hair;
  return INERT.has(slug) ? FIGURE_COLORS.inert : FIGURE_COLORS.muscle;
}

/**
 * One view (front or back) of the 2D body. Scales to the height of its
 * container; give the parent a height.
 */
export function BodyFigure({
  view,
  label,
  styleFor,
  labelFor,
  onShapePress,
  children,
  className,
}: BodyFigureProps) {
  const [, , width, height] = view.viewBox;

  return (
    <svg
      viewBox={view.viewBox.join(" ")}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block h-full w-auto select-none", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {view.shapes.map((shape) => {
        const style = styleFor?.(shape);
        const name = onShapePress ? labelFor?.(shape) : undefined;
        const interactive = name !== undefined;
        const key = `${shape.slug}-${shape.side}`;

        const paths = shape.paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={style?.fill ?? restingFill(shape.slug)}
            stroke={style?.stroke ?? FIGURE_COLORS.seam}
            strokeWidth={style?.strokeWidth ?? 0.75}
            vectorEffect="non-scaling-stroke"
            className="transition-[fill,stroke] duration-200"
          />
        ));

        if (!interactive) {
          return (
            <g key={key} data-slug={shape.slug} data-side={shape.side}>
              {paths}
            </g>
          );
        }

        const press = () => onShapePress?.(shape);
        return (
          <g
            key={key}
            data-slug={shape.slug}
            data-side={shape.side}
            role="button"
            tabIndex={0}
            aria-label={name}
            onClick={press}
            onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                press();
              }
            }}
            className="cursor-pointer outline-none [&:focus-visible>path]:stroke-ring"
          >
            {paths}
          </g>
        );
      })}

      <path
        d={view.outline}
        fill="none"
        stroke={FIGURE_COLORS.outline}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />

      {children}
    </svg>
  );
}
