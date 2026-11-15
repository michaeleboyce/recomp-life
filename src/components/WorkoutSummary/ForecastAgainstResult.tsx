"use client";

import Link from "next/link";
import { useSessionForecasts } from "@/hooks";
import { cn } from "@/lib/utils";
import {
  forecastResultRows,
  insideCount,
  type ResultMark,
} from "@/components/ActiveWorkout/glassForecast";
import { TRACK_RECORD_HREF } from "@/components/ActiveWorkout/GlassPanels";

const MARK: Record<ResultMark, { symbol: string; label: string; className: string }> = {
  beat: { symbol: "▲", label: "inside the range, better than the most likely result", className: "text-tier-t3" },
  inside: { symbol: "●", label: "inside the range", className: "text-muted-foreground" },
  outside: { symbol: "○", label: "outside the range", className: "text-tier-t1" },
  hit: { symbol: "✓", label: "it happened", className: "text-tier-t3" },
  miss: { symbol: "✕", label: "it did not happen", className: "text-muted-foreground" },
  void: { symbol: "–", label: "not scored", className: "text-muted-foreground" },
  open: { symbol: "…", label: "not decided yet", className: "text-muted-foreground" },
};

const ROW = "grid grid-cols-[minmax(0,1fr)_76px_84px_16px] items-center gap-2";

/**
 * Every forecast written when the workout started, against what happened: what was
 * stated, the result, and how it landed. A void row says why it is not scored.
 */
export function ForecastAgainstResult({ workoutId }: { workoutId: string }) {
  const scored = useSessionForecasts(workoutId);
  if (!scored || scored.length === 0) return null;
  const rows = forecastResultRows(scored);
  if (rows.length === 0) return null;
  const { inside, ranged } = insideCount(rows);

  return (
    <section aria-label="Forecast against what happened" className="flex flex-col">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Forecast against what happened
        </h2>
        <Link
          href={TRACK_RECORD_HREF}
          className="text-xs font-semibold text-accent-primary underline decoration-dotted underline-offset-4"
        >
          track record
        </Link>
      </div>
      <div aria-hidden="true" className={cn(ROW, "min-h-7 text-[11px] text-muted-foreground")}>
        <span />
        <span>Forecast</span>
        <span>You</span>
        <span />
      </div>
      <ul>
        {rows.map((row) => {
          const mark = MARK[row.mark];
          return (
            <li
              key={row.id}
              data-testid="forecast-row"
              data-mark={row.mark}
              className={cn(ROW, "min-h-[38px] border-t border-border py-1.5 text-[13px]")}
            >
              <span className="min-w-0">
                {row.label}
                {row.why && <span className="block text-xs text-muted-foreground">Not scored: {row.why}</span>}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{row.stated}</span>
              <b className="font-mono text-xs tabular-nums">{row.result || "—"}</b>
              <span className={mark.className} aria-label={mark.label} role="img">
                {mark.symbol}
              </span>
            </li>
          );
        })}
      </ul>
      {ranged > 0 && (
        <p data-testid="forecast-tally" className="pt-1.5 text-xs text-muted-foreground">
          {inside} of {ranged} inside the range. ▲ means better than the most likely result.
        </p>
      )}
    </section>
  );
}
