"use client";

import { useId } from "react";

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
}: ScenarioSliderProps) {
  const id = useId();
  const helperId = `${id}-helper`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <label htmlFor={id} className="text-foreground">
          {label}
        </label>
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
