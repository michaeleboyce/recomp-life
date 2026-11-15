"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { RepForecastBars, repForecastColumns } from "@/components/chart-kit";
import { cn } from "@/lib/utils";
import { MAX_REPS, MIN_REPS, repChips } from "./activeWorkoutLogic";

/** A stored rep forecast as the picker draws it. */
export interface RepForecastView {
  pmf: number[];
  low: number;
  high: number;
  firstReps: number;
  lastReps: number;
}

interface RepPickerProps {
  targetReps: number;
  isAMRAP: boolean;
  value: number;
  onChange: (reps: number) => void;
  /** On an AMRAP set: rep counts from here up would be a new best. */
  highlightFrom?: number | null;
  /**
   * The forecast stored for this set: its bars sit above the rep buttons, which then
   * follow the forecast's columns instead of the usual chips.
   */
  forecast?: RepForecastView | null;
  /** Under the buttons: what the forecast says. */
  children?: ReactNode;
}

const STEP_BUTTON =
  "flex size-[60px] shrink-0 items-center justify-center rounded-2xl bg-card text-foreground transition-colors active:bg-card-raised disabled:opacity-40";

/**
 * Rep count for the set. The target arrives selected, so a set that hits target
 * needs no input here at all; the stepper and chips are for when it did not.
 */
export function RepPicker({
  targetReps,
  isAMRAP,
  value,
  onChange,
  highlightFrom = null,
  forecast = null,
  children,
}: RepPickerProps) {
  return (
    <section className="flex flex-col gap-2.5" aria-label="Reps">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Reps
      </h2>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="One fewer rep"
          className={STEP_BUTTON}
          disabled={value <= MIN_REPS}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-6" aria-hidden="true" />
        </button>
        <div className="flex flex-1 flex-col items-center">
          <span
            data-testid="rep-count"
            aria-live="polite"
            className="font-mono text-[44px] font-bold leading-none tabular-nums"
          >
            {value}
          </span>
          <span className="text-xs text-muted-foreground">
            target {targetReps}
            {isAMRAP ? "+" : ""}
          </span>
        </div>
        <button
          type="button"
          aria-label="One more rep"
          className={STEP_BUTTON}
          disabled={value >= MAX_REPS}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
      </div>

      {forecast ? (
        <ForecastButtons
          forecast={forecast}
          value={value}
          onChange={onChange}
          isBest={(reps) =>
            isAMRAP && highlightFrom != null && reps >= highlightFrom
          }
        />
      ) : (
        <div className="grid grid-cols-6 gap-1.5">
          {repChips(targetReps).map((reps) => {
            const selected = reps === value;
            const wouldBeBest =
              isAMRAP && highlightFrom != null && reps >= highlightFrom;
            return (
              <button
                key={reps}
                type="button"
                aria-pressed={selected}
                aria-label={`${reps} ${reps === 1 ? "rep" : "reps"}${wouldBeBest ? ", new best" : ""}`}
                data-best={wouldBeBest || undefined}
                onClick={() => onChange(reps)}
                className={cn(
                  "h-11 rounded-[10px] border-[1.5px] font-mono text-[15px] tabular-nums transition-colors",
                  selected
                    ? "border-accent-primary bg-accent-primary-soft font-bold text-foreground"
                    : "border-transparent bg-card font-medium",
                  !selected &&
                    (wouldBeBest
                      ? "font-bold text-accent-primary"
                      : "text-foreground"),
                  !selected && reps < targetReps && "text-muted-foreground",
                )}
              >
                {reps}
              </button>
            );
          })}
        </div>
      )}
      {children}
    </section>
  );
}

const GAP = 8;

/**
 * The stored rep forecast as bars, each directly above the button for that count:
 * the same columns (`repForecastColumns`) and gap, so bar and button line up. The
 * expected range is the highlighted bars; the last button means "that many or more".
 */
function ForecastButtons({
  forecast,
  value,
  onChange,
  isBest,
}: {
  forecast: RepForecastView;
  value: number;
  onChange: (reps: number) => void;
  isBest: (reps: number) => boolean;
}) {
  const range: [number, number] = [forecast.low, forecast.high];
  const columns = repForecastColumns(
    forecast.pmf,
    forecast.firstReps,
    range,
    forecast.lastReps,
  );
  const last = columns.at(-1)?.reps;
  return (
    <div data-testid="rep-forecast" className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          The app&apos;s forecast
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block size-2 rounded-[2px] bg-chart-line"
          />
          expected range
        </span>
      </div>
      <RepForecastBars
        pmf={forecast.pmf}
        firstReps={forecast.firstReps}
        lastReps={forecast.lastReps}
        range={range}
        selected={last !== undefined && value >= last ? last : value}
        height={44}
        gap={GAP}
      />
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
          columnGap: GAP,
        }}
      >
        {columns.map((column) => {
          const isLast = column.reps === last;
          const selected = isLast
            ? value >= column.reps
            : value === column.reps;
          const best = isBest(column.reps);
          const count = isLast
            ? `${column.reps} or more reps`
            : `${column.reps} ${column.reps === 1 ? "rep" : "reps"}`;
          return (
            <button
              key={column.reps}
              type="button"
              aria-pressed={selected}
              aria-label={`${count}${best ? ", new best" : ""}`}
              data-best={best || undefined}
              onClick={() => onChange(column.reps)}
              className={cn(
                "mx-auto flex aspect-square w-full max-w-[52px] items-center justify-center rounded-full border-[1.5px] font-display text-[21px] leading-none font-extrabold transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground",
                !selected && best && "text-accent-primary",
              )}
            >
              {column.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
