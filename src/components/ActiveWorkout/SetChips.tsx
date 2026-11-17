"use client";

import { useState } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { PlanYou } from "@/components/SetPlan/PlanYou";
import { cn } from "@/lib/utils";
import { roleLabel, type SetChip } from "./setPlan";

interface SetChipsProps {
  /** The exercise's name, for the controls' accessible names. */
  name: string;
  chips: SetChip[];
  /** "lbs" or "lbs a hand" (`weightUnit`). */
  unit: string;
  /** What a set's weight moves by, and its lightest value. */
  step: number;
  minWeight: number;
  /** Changes one set still to come, by its index; null puts it back to the plan. */
  onChange: (setIndex: number, weight: number | null) => void;
}

const STEP_BUTTON =
  "flex h-14 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-card font-mono text-[15px] font-semibold text-foreground transition-colors active:bg-card-raised disabled:opacity-40";

/**
 * Every set of the exercise on screen as a chip: done ones as logged, the next one
 * highlighted, the rest as planned, with which are ramp and back-off sets. Tapping any
 * set still to come opens steppers that change its weight, for that set alone; a
 * changed set shows the plan's weight beside it and can go back to it.
 */
export function SetChips({ name, chips, unit, step, minWeight, onChange }: SetChipsProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (chips.length === 0) return null;
  const mixed = chips.some((chip) => chip.role !== "work");
  // A set closes once it is done.
  const open = chips.find((chip) => chip.index === openIndex && chip.state !== "done");

  return (
    <section aria-label={`Sets of ${name}`} className="flex flex-col gap-2">
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
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
              {chip.changed && (
                <span className="font-mono text-[11px] leading-none tabular-nums text-accent-primary">
                  plan {chip.plannedWeight}
                </span>
              )}
            </>
          );
          const base =
            "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] px-0.5 py-1.5";
          const what = `Set ${chip.index + 1}${label ? `, ${label.toLowerCase()}` : ""}: ${chip.weight} ${unit} × ${chip.reps}${
            chip.changed ? `, planned ${chip.plannedWeight} ${unit}` : ""
          }`;
          const isOpen = open?.index === chip.index;
          return (
            <li key={chip.index} data-chip={chip.state} data-role={chip.role} data-changed={chip.changed || undefined}>
              {chip.state === "done" ? (
                <span className={cn(base, "border-transparent bg-card text-foreground/80")}>
                  <span aria-hidden="true" className="contents">
                    {body}
                  </span>
                  <span className="sr-only">{`${what}, done`}</span>
                </span>
              ) : (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${what}${chip.state === "current" ? ", next" : ""}. Change its weight`}
                  onClick={() => setOpenIndex(isOpen ? null : chip.index)}
                  className={cn(
                    base,
                    "transition-colors active:bg-card-raised",
                    chip.state === "current"
                      ? "border-accent-primary bg-accent-primary-soft text-foreground"
                      : isOpen
                        ? "border-accent-primary/70 bg-card text-foreground"
                        : chip.changed
                          ? "border-accent-primary/40 text-foreground"
                          : "border-border text-muted-foreground"
                  )}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {open && (
        <div role="group" aria-label={`Set ${open.index + 1} weight`} className="flex flex-col gap-1.5">
          <p className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="font-semibold">
              Set {open.index + 1}
              {open.state === "current" ? " · next" : ""}
            </span>
            {open.changed && (
              <PlanYou data-testid="plan-beside" planWeight={open.plannedWeight} weight={open.weight} />
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`${step} ${unit} lighter`}
              className={STEP_BUTTON}
              disabled={open.weight - step < minWeight}
              onClick={() => onChange(open.index, open.weight - step)}
            >
              <Minus className="size-5" aria-hidden="true" />
              {step}
            </button>
            <button
              type="button"
              aria-label={`${step} ${unit} heavier`}
              className={STEP_BUTTON}
              onClick={() => onChange(open.index, open.weight + step)}
            >
              <Plus className="size-5" aria-hidden="true" />
              {step}
            </button>
            {open.changed && (
              <button
                type="button"
                aria-label={`Back to the planned ${open.plannedWeight} ${unit}`}
                className={cn(STEP_BUTTON, "flex-none px-4 text-[13px]")}
                onClick={() => onChange(open.index, null)}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                {open.plannedWeight}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
