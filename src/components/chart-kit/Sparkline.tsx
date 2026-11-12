import type { Point } from "@/lib/metrics/types";
import { sparklineCoords } from "./scale";

export type SparklineTone = "good" | "warn" | "neutral";

export interface SparklineProps {
  /** Oldest first. Metric points or bare values. */
  points: Point[] | number[];
  width?: number;
  height?: number;
  tone?: SparklineTone;
  /** Hidden from assistive technology by default: the tile beside it carries the number. */
  ariaHidden?: boolean;
  /** Used only when `ariaHidden` is false. */
  ariaLabel?: string;
}

const STROKE: Record<SparklineTone, string> = {
  good: "var(--chart-good)",
  warn: "var(--chart-warn)",
  neutral: "var(--chart-axis)",
};

const STROKE_WIDTH = 2;

const round = (n: number) => Math.round(n * 100) / 100;

/** A tiny trend line for stat tiles: plain SVG, no axes, no Recharts. */
export function Sparkline({
  points,
  width = 64,
  height = 24,
  tone = "neutral",
  ariaHidden = true,
  ariaLabel,
}: SparklineProps) {
  const values = (points as Array<Point | number>).map((p) => (typeof p === "number" ? p : p.v));
  const coords = sparklineCoords(values, width, height, STROKE_WIDTH / 2);
  const stroke = STROKE[tone];
  const a11y = ariaHidden
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": ariaLabel };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} {...a11y}>
      {coords.length === 1 && (
        <circle cx={round(coords[0].x)} cy={round(coords[0].y)} r={2.5} fill={stroke} />
      )}
      {coords.length > 1 && (
        <polyline
          points={coords.map((c) => `${round(c.x)},${round(c.y)}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
