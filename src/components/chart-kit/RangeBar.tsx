import { cn } from "@/lib/utils";
import { formatNumber } from "./scale";

export interface RangeBarProps {
  /** Lower end of the likely range. */
  low: number;
  /** Upper end of the likely range. */
  high: number;
  /** Most likely value, drawn as a dot. Optional. */
  point?: number;
  /** Track extent. Defaults to the range padded by half its width each side. */
  min?: number;
  max?: number;
  formatValue?: (v: number) => string;
  /** Overrides the generated text alternative. */
  ariaLabel?: string;
  className?: string;
}

const HEIGHT = 12;
const TRACK = 6;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number) => `${Math.round(clamp01(n) * 10000) / 100}%`;

/**
 * A likely range (low to high) on a track, with the most likely value as a
 * dot. Plain SVG; the numbers are in the accessible label.
 */
export function RangeBar({
  low,
  high,
  point,
  min,
  max,
  formatValue = formatNumber,
  ariaLabel,
  className,
}: RangeBarProps) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const pad = (hi - lo) / 2 || Math.abs(hi) * 0.05 || 1;
  const from = min ?? lo - pad;
  const to = max ?? hi + pad;
  const span = to - from || 1;
  const at = (v: number) => (v - from) / span;

  const label =
    ariaLabel ??
    `Likely between ${formatValue(lo)} and ${formatValue(hi)}` +
      (point !== undefined ? `, most likely ${formatValue(point)}` : "");

  return (
    <svg
      role="img"
      aria-label={label}
      data-slot="range-bar"
      width="100%"
      height={HEIGHT}
      className={cn("block overflow-visible", className)}
    >
      <rect
        x="0"
        y={(HEIGHT - TRACK) / 2}
        width="100%"
        height={TRACK}
        rx={TRACK / 2}
        fill="var(--chart-band)"
      />
      <rect
        data-range
        x={pct(at(lo))}
        y={(HEIGHT - TRACK) / 2}
        width={pct(at(hi) - at(lo))}
        height={TRACK}
        rx={TRACK / 2}
        fill="var(--chart-line)"
        fillOpacity={0.6}
      />
      {point !== undefined && (
        <circle
          data-point
          cx={pct(at(point))}
          cy={HEIGHT / 2}
          r={HEIGHT / 2}
          fill="var(--primary)"
          stroke="var(--chart-point-ring)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
