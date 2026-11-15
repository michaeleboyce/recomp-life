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

// Drawing space; the SVG scales to its container width (about 1:1 on a phone card).
const W = 320;
const H = 180;
const PAD = { left: 40, right: 12, top: 12, bottom: 24 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const R_MIN = 5;
const R_MAX = 11;
/** Text size in drawing units: 12 px at the usual width, the app's smallest text. */
const FONT = 12;
/** Rough width of one character of the bold label, and the label's height. */
const CHAR_W = 6.8;
const LABEL_H = 13;
const GAP = 4;

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

export interface CalibrationDot {
  cx: number;
  cy: number;
  r: number;
  text: string;
}

export interface PlacedLabel {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** The label's box, for overlap checks: left, top, right, bottom. */
  box: [number, number, number, number];
}

type Box = PlacedLabel["box"];

function overlap(a: Box, b: Box): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Inside the drawing, right of the y-axis labels and above the x-axis labels. */
function inBounds(b: Box): boolean {
  return b[0] >= PAD.left && b[2] <= W && b[1] >= 0 && b[3] <= H - PAD.bottom + 4;
}

function labelAt(x0: number, yMid: number, anchor: PlacedLabel["anchor"], width: number): PlacedLabel {
  let left = anchor === "start" ? x0 : anchor === "end" ? x0 - width : x0 - width / 2;
  let x = x0;
  if (anchor === "middle") {
    // Keep a centred label inside the drawing by sliding it sideways.
    const shift = Math.max(PAD.left - left, 0) + Math.min(W - (left + width), 0);
    left += shift;
    x += shift;
  }
  return { x, y: yMid, anchor, box: [left, yMid - LABEL_H / 2, left + width, yMid + LABEL_H / 2] };
}

/**
 * Where each dot's "hits of count" label goes so that no two labels overlap and no
 * label covers a dot. Each dot tries, in order: right, left, below, above, then right
 * and left nudged up or down a line. The first spot that is clear and inside the
 * drawing wins; when none is, the spot with the least overlap does. Dots are placed
 * left to right.
 */
export function placeCalibrationLabels(dots: CalibrationDot[]): PlacedLabel[] {
  const dotBoxes: Box[] = dots.map((d) => [d.cx - d.r, d.cy - d.r, d.cx + d.r, d.cy + d.r]);
  const placed: (PlacedLabel | undefined)[] = new Array(dots.length);
  const order = dots.map((d, i) => ({ d, i })).sort((a, b) => a.d.cx - b.d.cx || a.i - b.i);

  for (const { d, i } of order) {
    const width = d.text.length * CHAR_W;
    const right = d.cx + d.r + GAP;
    const left = d.cx - d.r - GAP;
    const candidates: PlacedLabel[] = [
      labelAt(right, d.cy, "start", width),
      labelAt(left, d.cy, "end", width),
      labelAt(d.cx, d.cy + d.r + GAP + LABEL_H / 2, "middle", width),
      labelAt(d.cx, d.cy - d.r - GAP - LABEL_H / 2, "middle", width),
    ];
    for (const step of [1, -1, 2, -2]) {
      const dy = step * LABEL_H;
      candidates.push(labelAt(right, d.cy + dy, "start", width), labelAt(left, d.cy + dy, "end", width));
    }

    const others = placed.filter((p): p is PlacedLabel => !!p).map((p) => p.box);
    const cost = (c: PlacedLabel) =>
      [...others, ...dotBoxes.filter((_, j) => j !== i)].reduce((sum, b) => sum + overlap(c.box, b), 0) +
      // Never on top of its own dot.
      overlap(c.box, dotBoxes[i]);
    const inside = candidates.filter((c) => inBounds(c.box));
    const pool = inside.length > 0 ? inside : candidates;
    let best = pool[0];
    let bestCost = cost(best);
    for (const c of pool) {
      if (bestCost === 0) break;
      const k = cost(c);
      if (k < bestCost) {
        best = c;
        bestCost = k;
      }
    }
    placed[i] = best;
  }
  return placed as PlacedLabel[];
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
  const dots: CalibrationDot[] = shown.map((b) => ({
    cx: x(b.stated),
    cy: y(b.hits / b.count),
    r: radius(b.count),
    text: `${b.hits} of ${b.count}`,
  }));
  const labels = placeCalibrationLabels(dots);

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? calibrationSummary(shown)}
      data-slot="calibration-chart"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className={cn("block h-auto overflow-visible", className)}
    >
      <g aria-hidden="true" fontSize={FONT} fill="var(--chart-axis)">
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
      {shown.map((b, i) => (
        <g key={b.stated} data-bin={b.stated}>
          <circle cx={dots[i].cx} cy={dots[i].cy} r={dots[i].r} fill="var(--primary)" />
          <text
            aria-hidden="true"
            x={labels[i].x}
            y={labels[i].y}
            textAnchor={labels[i].anchor}
            dominantBaseline="middle"
            fontSize={FONT}
            fontWeight="700"
            fill="var(--foreground)"
            // A thin page-coloured edge keeps the words readable where they cross the
            // diagonal or a grid line.
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            {dots[i].text}
          </text>
        </g>
      ))}
    </svg>
  );
}
