"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonClass =
  "inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

/** A number with a minus and a plus button; 44px tap targets, mono digits. */
export function Stepper({
  label,
  value,
  unit,
  step = 1,
  min = 0,
  onChange,
  className,
}: {
  /** Names the field, e.g. "Sets" or "Weight", for the buttons' accessible names. */
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className={buttonClass}
        disabled={value - step < min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span
        data-stepper-value={label}
        className="min-w-12 text-center font-mono text-sm font-semibold tabular-nums"
      >
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className={buttonClass}
        onClick={() => onChange(value + step)}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
