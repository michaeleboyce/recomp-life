"use client";

import { useState } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel, type SetChip } from "./setPlan";

interface SetChipsProps {
  /** The exercise's name, for the controls' accessible names. */
  name: string;
  chips: SetChip[];
  /** "lbs" or "lbs/hand". */
  unit: string;
  /** What the next set's weight moves by, and its lightest value. */
  step: number;
  minWeight: number;
  /** The next set's weight as changed on the spot; null when it is as planned. */
  override: number | null;
  /** The next set's planned weight, for "back to plan". */
  plannedWeight: number;
  onChange: (weight: number | null) => void;
}

const STEP_BUTTON =
  "flex h-14 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-card font-mono text-[15px] font-semibold text-foreground transition-colors active:bg-card-raised disabled:opacity-40";

/**
 * Every set of the exercise on screen as a chip: done ones as logged, the next one
 * highlighted, the rest as planned, with which are ramp and back-off sets. Tapping the
 * next set opens steppers that change its weight on the spot.
 */
export function SetChips({
  name,
  chips,
  unit,
  step,
  minWeight,
  override,
  plannedWeight,
  onChange,
}: SetChipsProps) {
  const [open, setOpen] = useState(false);
  if (chips.length === 0) return null;
  const current = chips.find((chip) => chip.state === "current");
  const mixed = chips.some((chip) => chip.role !== "work");
  const showEditor = open && !!current;

  return (
    <section aria-label={`Sets of ${name}`} className="flex flex-col gap-2">
      <ol className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const label = roleLabel(chip.role);
          const reps = `×${chip.reps}${chip.isAMRAP && chip.state !== "done" ? "+" : ""}`;
          const body = (
            <>
              <span className="flex items-center gap-1 font-mono text-[15px] leading-none font-semibold tabular-nums">
                {chip.state === "done" && <Check className="size-3.5 text-success" aria-hidden="true" />}
                {chip.weight}
              </span>
              <span className="font-mono text-[12px] leading-none tabular-nums text-muted-foreground">
                {reps}
              </span>
              {(mixed || chip.drops > 0) && (
                <span className="text-[12px] leading-none text-muted-foreground">
                  {label ?? "Work"}
                  {chip.drops > 0 ? ` +${chip.drops}↓` : ""}
                </span>
              )}
            </>
          );
          const base =
            "flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] px-2 py-1.5";
          const what = `Set ${chip.index + 1}${label ? `, ${label.toLowerCase()}` : ""}: ${chip.weight} ${unit} × ${chip.reps}`;
          return (
            <li key={chip.index} data-chip={chip.state} data-role={chip.role}>
              {chip.state === "current" ? (
                <button
                  type="button"
                  aria-expanded={showEditor}
                  aria-label={`${what}, next. Change its weight`}
                  onClick={() => setOpen((was) => !was)}
                  className={cn(
                    base,
                    "border-accent-primary bg-accent-primary-soft text-foreground transition-colors active:bg-card-raised"
                  )}
                >
                  {body}
                </button>
              ) : (
                <span
                  className={cn(
                    base,
                    chip.state === "done"
                      ? "border-transparent bg-card text-foreground/80"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <span aria-hidden="true" className="contents">
                    {body}
                  </span>
                  <span className="sr-only">{`${what}${chip.state === "done" ? ", done" : ""}`}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {showEditor && current && (
        <div role="group" aria-label={`Set ${current.index + 1} weight`} className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`${step} ${unit} lighter`}
            className={STEP_BUTTON}
            disabled={current.weight - step < minWeight}
            onClick={() => onChange(current.weight - step)}
          >
            <Minus className="size-5" aria-hidden="true" />
            {step}
          </button>
          <button
            type="button"
            aria-label={`${step} ${unit} heavier`}
            className={STEP_BUTTON}
            onClick={() => onChange(current.weight + step)}
          >
            <Plus className="size-5" aria-hidden="true" />
            {step}
          </button>
          {override != null && (
            <button
              type="button"
              aria-label={`Back to the planned ${plannedWeight} ${unit}`}
              className={cn(STEP_BUTTON, "flex-none px-4 text-[13px]")}
              onClick={() => onChange(null)}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {plannedWeight}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
