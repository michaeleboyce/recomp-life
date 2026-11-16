import { cn } from "@/lib/utils";

export interface RepColumn {
  reps: number;
  /** Label under the bar's column: "6", or "8+" for the last column. */
  label: string;
  probability: number;
  inRange: boolean;
}

export interface RepForecastBarsProps {
  /** pmf[k] = chance of exactly k reps; the last entry means "that many or more". */
  pmf: number[];
  /** The first rep count to show. Counts below it are not drawn. */
  firstReps: number;
  /** The last column, shown as "N+" and holding the chance of N or more. Defaults to the pmf's end. */
  lastReps?: number;
  /** Likely range [low, high], inclusive; those bars are highlighted. */
  range: [number, number];
  /** The rep count currently chosen in the button row below. */
  selected?: number;
  /** Plot height in px, excluding the percentage labels (default 48). */
  height?: number;
  /**
   * Column gap in px (default 8). The caller's rep buttons must use the same
   * column count and gap so each bar sits over its button.
   */
  gap?: number;
  className?: string;
}

/**
 * The columns RepForecastBars draws, in order. Use it to render the matching
 * row of rep buttons: one button per column, same grid.
 */
export function repForecastColumns(
  pmf: number[],
  firstReps: number,
  range: [number, number],
  lastReps?: number
): RepColumn[] {
  const end = Math.max(firstReps, Math.min(lastReps ?? pmf.length - 1, pmf.length - 1));
  const columns: RepColumn[] = [];
  for (let reps = firstReps; reps <= end; reps++) {
    const isLast = reps === end;
    const probability = isLast
      ? pmf.slice(reps).reduce((a, b) => a + b, 0)
      : (pmf[reps] ?? 0);
    columns.push({
      reps,
      // The pmf's last entry already means "or more", so the last column always does.
      label: isLast ? `${reps}+` : String(reps),
      probability,
      inRange: reps >= range[0] && reps <= range[1],
    });
  }
  return columns;
}

const percent = (p: number) => `${Math.round(p * 100)}%`;

/**
 * A bar and percentage per rep count, the likely range highlighted. Display
 * only: the caller renders the rep buttons below in a grid with the same
 * columns (see repForecastColumns) and gap.
 */
export function RepForecastBars({
  pmf,
  firstReps,
  lastReps,
  range,
  selected,
  height = 48,
  gap = 8,
  className,
}: RepForecastBarsProps) {
  const columns = repForecastColumns(pmf, firstReps, range, lastReps);
  const top = Math.max(...columns.map((c) => c.probability), 0) || 1;
  const spoken = columns.map((c) => {
    const what = c.label.endsWith("+") ? `${c.reps} or more` : `${c.reps}`;
    return `${what}: ${percent(c.probability)}`;
  });
  const label = `Chance of each rep count. ${spoken.join(", ")}. Likely range ${range[0]} to ${range[1]}.`;

  return (
    <div
      role="img"
      aria-label={label}
      data-slot="rep-forecast-bars"
      className={cn("grid", className)}
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, columnGap: gap }}
    >
      {columns.map((c) => {
        const h = c.probability > 0 ? Math.max(2, Math.round((c.probability / top) * height)) : 0;
        const isSelected = selected === c.reps;
        return (
          <div
            key={c.reps}
            data-reps={c.reps}
            data-in-range={c.inRange || undefined}
            data-selected={isSelected || undefined}
            className="flex min-w-0 flex-col items-center gap-1"
          >
            <span
              className={cn(
                "font-mono text-[12px] leading-4 tabular-nums",
                isSelected ? "font-semibold text-foreground" : "text-chart-axis"
              )}
            >
              {percent(c.probability)}
            </span>
            <div className="flex w-full items-end justify-center" style={{ height }}>
              {h > 0 && (
                <svg data-bar width="60%" height={h} className="block">
                  <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    rx="4"
                    fill={c.inRange ? "var(--chart-line)" : "var(--secondary)"}
                  />
                  <rect
                    x="0"
                    y="50%"
                    width="100%"
                    height="50%"
                    fill={c.inRange ? "var(--chart-line)" : "var(--secondary)"}
                  />
                </svg>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
