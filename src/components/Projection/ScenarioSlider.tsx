"use client";

import { useId } from "react";
import { TermIcon } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";

interface ScenarioSliderProps {
  label: string;
  /** The value the slider shows (the scenario's, or the baseline's when unchanged). */
  value: number;
  /** The lifter's current value, shown as "now ...". */
  baseline: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  helper?: React.ReactNode;
  /** A glossary entry explaining the label, shown as an info icon beside it. */
  term?: TermId;
}

/** A labelled native range input with the scenario value and "now <baseline>". */
export function ScenarioSlider({
  label,
  value,
  baseline,
  min,
  max,
  step,
  format,
  onChange,
  helper,
  term,
}: ScenarioSliderProps) {
  const id = useId();
  const helperId = `${id}-helper`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-1">
          <label htmlFor={id} className="text-foreground">
            {label}
          </label>
          {term && <TermIcon id={term} className="self-center" />}
        </span>
        <span className="shrink-0 font-mono text-sm font-bold text-foreground">
          {format(value)}{" "}
          <span className="font-normal text-muted-foreground">now {format(baseline)}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        aria-valuetext={`${format(value)}, now ${format(baseline)}`}
        aria-describedby={helper ? helperId : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full cursor-pointer accent-primary"
      />
      {helper && (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      )}
    </div>
  );
}
