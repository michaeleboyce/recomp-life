"use client";

import { useId, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClass =
  "h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const stepClass =
  "flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/** Rounds away float noise from repeated 2.5 steps. */
const tidy = (n: number) => Math.round(n * 100) / 100;

/**
 * A number with minus/plus steppers and direct entry. `value` is the raw text so an
 * empty or half-typed entry is kept as typed; the caller validates on save.
 */
export function StepperField({
  label,
  value,
  onChange,
  step,
  min = 0,
  max,
  unit,
  hint,
  inputMode = "decimal",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  hint?: ReactNode;
  inputMode?: "decimal" | "numeric";
}) {
  const id = useId();
  const current = Number(value);
  const base = value.trim() === "" || !Number.isFinite(current) ? min : current;
  const bump = (delta: number) => {
    let next = tidy(base + delta);
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    onChange(String(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {unit && <span className="text-muted-foreground"> ({unit})</span>}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={stepClass}
          onClick={() => bump(-step)}
          aria-label={`Decrease ${label.toLowerCase()} by ${step}`}
        >
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode={inputMode}
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "text-center font-mono text-lg tabular-nums")}
        />
        <button
          type="button"
          className={stepClass}
          onClick={() => bump(step)}
          aria-label={`Increase ${label.toLowerCase()} by ${step}`}
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
      {hint}
    </div>
  );
}

/** A labelled text, number or date input. */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  max,
  min,
  step,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "datetime-local";
  max?: string;
  min?: string;
  step?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        max={max}
        min={min}
        step={step}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

export function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Notes
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-auto py-2")}
      />
    </div>
  );
}

/** A heading for a ChipGroup (which carries its own aria-label). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-foreground">{children}</p>;
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}
