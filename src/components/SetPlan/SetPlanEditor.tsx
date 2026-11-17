"use client";

import { useState, type ReactNode } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { roleLabel } from "@/components/ActiveWorkout/setPlan";
import { cn } from "@/lib/utils";
import type { PlannedSet } from "@/types";
import { clampWeight, differsFromPlan, planBesideText, setDiffers, withSet } from "./setPlanModel";

export interface SetPlanEditorProps {
  /** The exercise's name, for the controls' accessible names. */
  name: string;
  /** The sets as they stand (yours where changed), in order. */
  sets: PlannedSet[];
  /** The plan's own sets, same length, shown beside a changed set. */
  planSets: PlannedSet[];
  /** "lbs", "lbs a hand". */
  unit: string;
  /** What a weight moves by, and its limits. */
  step: number;
  minWeight: number;
  maxWeight?: number;
  /** Indexes that can no longer change (done sets in a workout). */
  lockedBefore?: number;
  /** The new sets; null goes back to the plan. */
  onChange: (sets: PlannedSet[] | null) => void;
  /** False leaves each set's reps as they are (only its weight changes). Default true. */
  editReps?: boolean;
  /** More controls for the open set (its role, removing it), below its steppers. */
  setTools?: (index: number) => ReactNode;
  /** Shown under the chips (adding sets, quick fills). */
  children?: ReactNode;
}

const STEP_BUTTON =
  "inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

const PILL =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** A number with a minus and a plus button: 44px targets, mono digits. */
function SetStepper({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  step: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className={STEP_BUTTON}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span data-stepper-value={label} className="min-w-12 text-center font-mono text-sm font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className={STEP_BUTTON}
        disabled={max != null && value + step > max}
        onClick={() => onChange(value + step)}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** "Set 2, ramp: 150 lbs × 3": a set as its controls name it. */
function setText(index: number, set: PlannedSet, unit: string): string {
  const label = roleLabel(set.role);
  return `Set ${index + 1}${label ? `, ${label.toLowerCase()}` : ""}: ${set.weight} ${unit} × ${set.reps}`;
}

/**
 * The sets as chips in order (weight × reps, which are ramp and back-off). Tapping a
 * chip opens steppers for that set's weight and reps; a changed set shows the plan's
 * number beside yours and can go back on its own; "Back to plan" puts every set back.
 * Sets before `lockedBefore` are shown, not changed.
 */
export function SetPlanEditor({
  name,
  sets,
  planSets,
  unit,
  step,
  minWeight,
  maxWeight,
  lockedBefore = 0,
  onChange,
  editReps = true,
  setTools,
  children,
}: SetPlanEditorProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex != null && openIndex >= lockedBefore && openIndex < sets.length ? openIndex : null;
  const mixed = sets.some((set) => (set.role ?? "work") !== "work");
  const update = (index: number, change: Partial<PlannedSet>) => onChange(withSet(sets, index, change));

  const openSet = open != null ? sets[open] : undefined;
  const openPlan = open != null ? planSets[open] : undefined;
  const openChanged = !!openSet && setDiffers(openSet, openPlan);

  return (
    <div data-testid="set-plan-editor" className="flex flex-col gap-2">
      <ol
        aria-label={`${name} sets`}
        className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5"
      >
        {sets.map((set, i) => {
          const plan = planSets[i];
          const changed = setDiffers(set, plan);
          const locked = i < lockedBefore;
          const label = roleLabel(set.role);
          const what = setText(i, set, unit);
          const body = (
            <>
              <span className="flex items-center gap-1 font-mono text-[15px] leading-none font-semibold tabular-nums">
                {locked && <Check className="size-3.5 text-success" aria-hidden="true" />}
                {set.weight}
              </span>
              <span className="font-mono text-[12px] leading-none tabular-nums text-muted-foreground">
                ×{set.reps}
              </span>
              {mixed && <span className="text-[12px] leading-none text-muted-foreground">{label ?? "Work"}</span>}
              {changed && plan && (
                <span className="font-mono text-[11px] leading-none tabular-nums text-accent-primary">
                  plan {plan.weight}
                  {plan.reps !== set.reps ? `×${plan.reps}` : ""}
                </span>
              )}
            </>
          );
          const base =
            "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] px-0.5 py-1.5";
          return (
            <li key={i} data-set-weight={set.weight} data-role={set.role ?? "work"} data-changed={changed || undefined}>
              {locked ? (
                <span className={cn(base, "border-transparent bg-card text-foreground/80")}>
                  <span aria-hidden="true" className="contents">
                    {body}
                  </span>
                  <span className="sr-only">{`${what}, done`}</span>
                </span>
              ) : (
                <button
                  type="button"
                  aria-expanded={open === i}
                  aria-label={`${what}${changed && plan ? `, plan ${plan.weight} ${unit} × ${plan.reps}` : ""}. Change it`}
                  onClick={() => setOpenIndex(open === i ? null : i)}
                  className={cn(
                    base,
                    "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-card-raised",
                    open === i
                      ? "border-accent-primary bg-accent-primary-soft text-foreground"
                      : changed
                        ? "border-accent-primary/60 bg-card text-foreground"
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

      {open != null && openSet && (
        <div
          role="group"
          aria-label={`Set ${open + 1} of ${name}`}
          className="flex flex-col gap-2 rounded-xl bg-card px-2 py-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold">
              Set {open + 1}
              {roleLabel(openSet.role) ? ` · ${roleLabel(openSet.role)}` : ""}
            </span>
            {openChanged && openPlan && (
              <span data-testid="plan-beside" className="font-mono text-xs tabular-nums text-muted-foreground">
                {planBesideText(openSet, openPlan)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <SetStepper
              label={`${name} set ${open + 1} weight`}
              value={openSet.weight}
              unit={unit}
              step={step}
              min={minWeight}
              max={maxWeight}
              onChange={(weight) => update(open, { weight: clampWeight(weight, minWeight, maxWeight) })}
            />
            {editReps && (
              <>
                <span aria-hidden="true" className="px-0.5 font-mono text-sm text-muted-foreground">
                  ×
                </span>
                <SetStepper
                  label={`${name} set ${open + 1} reps`}
                  value={openSet.reps}
                  step={1}
                  min={1}
                  onChange={(reps) => update(open, { reps: Math.max(1, reps) })}
                />
              </>
            )}
          </div>
          {openChanged && openPlan && (
            <button
              type="button"
              className={cn(PILL, "w-fit text-muted-foreground")}
              aria-label={`Set ${open + 1} back to the plan's ${openPlan.weight} ${unit} × ${openPlan.reps}`}
              onClick={() => update(open, { weight: openPlan.weight, reps: openPlan.reps })}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Plan {openPlan.weight}×{openPlan.reps}
            </button>
          )}
          {setTools?.(open)}
        </div>
      )}

      {children}

      {differsFromPlan(sets, planSets) && (
        <button
          type="button"
          className={cn(PILL, "w-fit text-muted-foreground")}
          aria-label={`Back to plan: ${name}`}
          onClick={() => {
            setOpenIndex(null);
            onChange(null);
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Back to plan
        </button>
      )}
    </div>
  );
}
