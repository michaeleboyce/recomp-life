import { cn } from "@/lib/utils";

export interface GaugeProps {
  value: number;
  /** Top of the scale (default 100). The bottom is 0. */
  max?: number;
  /** What the number is, for the text alternative (default "Score"). */
  label?: string;
  /** Overrides the generated text alternative. */
  ariaLabel?: string;
  className?: string;
}

const W = 160;
const STROKE = 14;
const R = (W - STROKE) / 2;
const CY = W / 2;
const H = CY + STROKE / 2 + 2;
// Half ring from the left end, over the top, to the right end.
const ARC = `M ${STROKE / 2} ${CY} A ${R} ${R} 0 0 1 ${W - STROKE / 2} ${CY}`;

/** A half ring filled to the value, with the number in the middle. Plain SVG. */
export function Gauge({ value, max = 100, label = "Score", ariaLabel, className }: GaugeProps) {
  const share = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  const shown = Math.round(value);
  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? `${label} ${shown} out of ${max}`}
      data-slot="gauge"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className={cn("block h-auto w-40", className)}
    >
      <path d={ARC} fill="none" stroke="var(--secondary)" strokeWidth={STROKE} strokeLinecap="round" />
      {share > 0 && (
        <path
          data-value
          d={ARC}
          pathLength={100}
          strokeDasharray={`${Math.round(share * 10000) / 100} 100`}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
      )}
      <text
        aria-hidden="true"
        x={W / 2}
        y={CY - 2}
        textAnchor="middle"
        fontSize="56"
        fontWeight="800"
        fill="var(--foreground)"
        className="font-display tabular-nums"
      >
        {shown}
      </text>
    </svg>
  );
}
