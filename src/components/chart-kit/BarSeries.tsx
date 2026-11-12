import { cn } from "@/lib/utils";
import { ChartEmpty } from "./ChartEmpty";
import { formatNumber } from "./scale";

export type BarTone = "default" | "good" | "warn";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  tone?: BarTone;
}

export interface BarSeriesProps {
  data: BarDatum[];
  /** "horizontal" (default): one labelled row per datum. "vertical": columns. */
  orientation?: "vertical" | "horizontal";
  /** Plot height for vertical bars, in px (default 160). Horizontal bars size to their rows. */
  height?: number;
  target?: { value: number; label?: string };
  formatValue?: (v: number) => string;
  ariaLabel: string;
  emptyMessage?: string;
  className?: string;
}

const FILL: Record<BarTone, string> = {
  default: "var(--chart-line)",
  good: "var(--chart-good)",
  warn: "var(--chart-warn)",
};

/** Bar thickness in px, capped so bars never fill their slot. */
const THICKNESS = 16;
const COLUMN_MAX = 24;

const pct = (value: number, max: number) =>
  `${Math.round(Math.min(1, Math.max(0, value / max)) * 10000) / 100}%`;

/**
 * One bar. The SVG is sized to the value and holds a rect with 4px rounded
 * corners; a second rect squares off the baseline end.
 */
function Bar({ tone, horizontal }: { tone: BarTone; horizontal: boolean }) {
  const fill = FILL[tone];
  return (
    <>
      <rect x="0" y="0" width="100%" height="100%" rx="4" fill={fill} />
      {horizontal ? (
        <rect x="0" y="0" width="50%" height="100%" fill={fill} />
      ) : (
        <rect x="0" y="50%" width="100%" height="50%" fill={fill} />
      )}
    </>
  );
}

/**
 * Plain SVG/HTML bars: no Recharts, no mount animation, so a bar is drawn at its
 * final size on the first paint (see the report on the old VolumeBars).
 */
export function BarSeries({
  data,
  orientation = "horizontal",
  height = 160,
  target,
  formatValue = formatNumber,
  ariaLabel,
  emptyMessage,
  className,
}: BarSeriesProps) {
  if (data.length === 0) return <ChartEmpty message={emptyMessage} height={height} />;

  const max = Math.max(...data.map((d) => d.value), target?.value ?? 0) || 1;

  if (orientation === "vertical") {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn("relative flex gap-2", className)}
        style={{ height }}
      >
        {data.map((d) => (
          <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="relative mt-4 w-full flex-1" style={{ maxWidth: COLUMN_MAX }}>
              {d.value > 0 && (
                <svg
                  data-bar
                  className="absolute bottom-0 left-0 overflow-visible"
                  width="100%"
                  height={pct(d.value, max)}
                >
                  <Bar tone={d.tone ?? "default"} horizontal={false} />
                </svg>
              )}
              <span
                className="absolute left-1/2 -translate-x-1/2 font-mono text-[11px] leading-4 text-foreground tabular-nums whitespace-nowrap"
                style={{ bottom: `calc(${pct(d.value, max)} + 2px)` }}
              >
                {formatValue(d.value)}
              </span>
            </div>
            <span className="h-4 w-full truncate text-center text-[11px] leading-4 text-chart-axis">
              {d.label}
            </span>
          </div>
        ))}
        {target && (
          <div className="pointer-events-none absolute inset-x-0 top-4 bottom-5" aria-hidden="true">
            <div
              data-target
              className="absolute inset-x-0 border-t border-dashed border-chart-axis"
              style={{ bottom: pct(target.value, max) }}
            >
              {target.label && (
                <span className="absolute right-0 bottom-0.5 font-mono text-[10px] text-chart-axis">
                  {target.label}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const columns = "grid-cols-[5.5rem_minmax(0,1fr)_3rem]";
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn("relative flex flex-col gap-2", target?.label && "pt-4", className)}
    >
      {data.map((d) => (
        <div key={d.key} className={cn("grid items-center gap-2", columns)}>
          <span className="truncate text-xs text-muted-foreground">{d.label}</span>
          <div className="relative" style={{ height: THICKNESS }}>
            {d.value > 0 && (
              <svg data-bar className="block" width={pct(d.value, max)} height={THICKNESS}>
                <Bar tone={d.tone ?? "default"} horizontal />
              </svg>
            )}
          </div>
          <span className="text-right font-mono text-[11px] text-foreground tabular-nums">
            {formatValue(d.value)}
          </span>
        </div>
      ))}
      {target && (
        <div
          className={cn("pointer-events-none absolute inset-0 grid gap-2", columns)}
          aria-hidden="true"
        >
          <div />
          <div className="relative">
            <div
              data-target
              className={cn(
                "absolute bottom-0 border-l border-dashed border-chart-axis",
                target.label ? "top-4" : "top-0"
              )}
              style={{ left: pct(target.value, max) }}
            >
              {target.label && (
                <span className="absolute -top-4 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-chart-axis">
                  {target.label}
                </span>
              )}
            </div>
          </div>
          <div />
        </div>
      )}
    </div>
  );
}
