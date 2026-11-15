import { cn } from "@/lib/utils";
import { ChartEmpty } from "./ChartEmpty";

export interface CalibrationBin {
  /** The chance the app stated, 0 to 1 (e.g. the middle of a 20% bucket). */
  stated: number;
  /** How many of these forecasts came true. */
  hits: number;
  /** How many forecasts are in the bucket. */
  count: number;
}

export interface CalibrationChartProps {
  bins: CalibrationBin[];
  /** Overrides the generated text alternative. */
  ariaLabel?: string;
  emptyMessage?: string;
  className?: string;
}

// Drawing space; the SVG scales to its container width.
const W = 320;
const H = 180;
const PAD = { left: 34, right: 12, top: 12, bottom: 24 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const R_MIN = 5;
const R_MAX = 11;

const x = (p: number) => PAD.left + Math.min(1, Math.max(0, p)) * PLOT_W;
const y = (p: number) => PAD.top + (1 - Math.min(1, Math.max(0, p))) * PLOT_H;
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** "When it said 20%, it happened 2 of 8 times (25%)." for each bin. */
export function calibrationSummary(bins: CalibrationBin[]): string {
  return bins
    .filter((b) => b.count > 0)
    .map(
      (b) =>
        `When it said ${pct(b.stated)}, it happened ${b.hits} of ${b.count} times (${pct(b.hits / b.count)}).`
    )
    .join(" ");
}

/**
 * Stated chance against how often it happened. Dots on the dashed diagonal
 * mean honest odds; bigger dots stand on more forecasts. Plain SVG.
 */
export function CalibrationChart({ bins, ariaLabel, emptyMessage, className }: CalibrationChartProps) {
  const shown = bins.filter((b) => b.count > 0);
  if (shown.length === 0) return <ChartEmpty message={emptyMessage} height={H} />;

  const most = Math.max(...shown.map((b) => b.count));
  const radius = (count: number) =>
    most === 1 ? R_MIN : R_MIN + (R_MAX - R_MIN) * Math.sqrt((count - 1) / (most - 1));

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? calibrationSummary(shown)}
      data-slot="calibration-chart"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className={cn("block h-auto overflow-visible", className)}
    >
      <g aria-hidden="true" fontSize="11" fill="var(--chart-axis)">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="font-mono">
              {pct(t)}
            </text>
          </g>
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="font-mono">
            {pct(t)}
          </text>
        ))}
      </g>
      <line
        data-diagonal
        x1={x(0)}
        y1={y(0)}
        x2={x(1)}
        y2={y(1)}
        stroke="var(--chart-axis)"
        strokeDasharray="4 4"
        strokeWidth={1.5}
      />
      {shown.map((b) => {
        const rate = b.hits / b.count;
        const r = radius(b.count);
        const cx = x(b.stated);
        const cy = y(rate);
        // Label to the right, or to the left near the right edge.
        const right = cx + r + 60 < W;
        return (
          <g key={b.stated} data-bin={b.stated}>
            <circle cx={cx} cy={cy} r={r} fill="var(--primary)" />
            <text
              aria-hidden="true"
              x={right ? cx + r + 4 : cx - r - 4}
              y={cy}
              textAnchor={right ? "start" : "end"}
              dominantBaseline="middle"
              fontSize="11"
              fontWeight="700"
              fill="var(--foreground)"
            >
              {b.hits} of {b.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
