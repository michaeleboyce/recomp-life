"use client";

import { ChevronsUp, ListPlus, Plus, Repeat2, Rows3, Trash2 } from "lucide-react";
import { SetPlanEditor } from "@/components/SetPlan/SetPlanEditor";
import { weightUnit, withSet } from "@/components/SetPlan/setPlanModel";
import { TierBadge } from "@/components/ui/tier-badge";
import { getExercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { CREDIT_TIERS } from "@/lib/workout/credit";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { PlannedSet, SetRole } from "@/types";
import { addBackOffSet, plannedSetsOf, rampUpSets, workingSetNumbers } from "./editList";
import { ImpactLine } from "./ImpactLine";
import type { ImpactItem } from "./impact";
import { Stepper } from "./Stepper";

export const WEIGHT_STEP_LBS = 5;

const iconButton =
  "inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50";

const pillButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** The roles a planned set can have, as the per-set editor offers them. */
const ROLES: { role: SetRole; label: string; name: string }[] = [
  { role: "ramp", label: "Ramp", name: "ramp" },
  { role: "work", label: "Working", name: "working" },
  { role: "backoff", label: "Back-off", name: "back-off" },
];

/** "Sets 3 to 7", "Sets 1, 3 and 5", "Set 2". */
function setNumbersText(numbers: number[]): string {
  if (numbers.length === 1) return `Set ${numbers[0]}`;
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (contiguous) return `Sets ${numbers[0]} to ${numbers.at(-1)}`;
  return `Sets ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
}

/** Which sets pass or fail is judged on, in a sentence. */
export function workingSetsText(sets: readonly PlannedSet[]): string {
  const numbers = workingSetNumbers(sets);
  if (numbers.length === 0) return "No working sets: this lift is only logged.";
  const what = numbers.length === 1 ? "is the working set" : "are the working sets";
  return `${setNumbersText(numbers)} ${what}: pass or fail is judged on them.`;
}

/**
 * Each set of an entry with its own weight, rep target and role (ramp, working, back-off)
 * as chips to tap open (`SetPlanEditor`), quick fills for a ramp up to the working weight
 * and a back-off set, and which sets pass or fail is judged on.
 */
function PerSetEditor({
  name,
  sets,
  planSets,
  unit,
  step,
  minWeight,
  judged,
  onChange,
}: {
  name: string;
  sets: PlannedSet[];
  /** The plan's own sets, shown beside a changed set. */
  planSets: PlannedSet[];
  unit: string;
  step: number;
  minWeight: number;
  /** A program lift: say which sets decide its pass or fail. */
  judged: boolean;
  /** The new sets; null goes back to the plan (one weight for every set). */
  onChange: (sets: PlannedSet[] | null) => void;
}) {
  const update = (index: number, change: Partial<PlannedSet>) => onChange(withSet(sets, index, change));

  // The open set's role and its remove button, under its steppers.
  const setTools = (i: number) => {
    const role = sets[i].role ?? "work";
    return (
      <div className="flex items-center gap-2">
        <div role="group" aria-label={`Set ${i + 1} role`} className="flex min-w-0 flex-1 gap-1">
          {ROLES.map((option) => (
            <button
              key={option.role}
              type="button"
              aria-pressed={role === option.role}
              aria-label={`Set ${i + 1}: ${option.name}`}
              onClick={() => update(i, { role: option.role })}
              className={cn(
                "min-h-11 flex-1 rounded-lg border px-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                role === option.role
                  ? option.role === "work"
                    ? "border-accent-primary bg-accent-primary-soft text-foreground"
                    : "border-foreground/40 bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={iconButton}
          aria-label={`Remove set ${i + 1} of ${name}`}
          disabled={sets.length <= 1}
          onClick={() => onChange(sets.filter((_, j) => j !== i))}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <SetPlanEditor
      name={name}
      sets={sets}
      planSets={planSets}
      unit={unit}
      step={step}
      minWeight={minWeight}
      onChange={onChange}
      setTools={setTools}
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={pillButton}
          aria-label={`Add a set to ${name}`}
          onClick={() => onChange([...sets, { ...sets[sets.length - 1] }])}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add set
        </button>
        <button type="button" className={pillButton} onClick={() => onChange(rampUpSets(sets, step, minWeight))}>
          <ChevronsUp className="size-3.5" aria-hidden="true" />
          Ramp up
        </button>
        <button type="button" className={pillButton} onClick={() => onChange(addBackOffSet(sets, step, minWeight))}>
          <ListPlus className="size-3.5" aria-hidden="true" />
          Back-off set
        </button>
      </div>
      {judged && (
        <p data-testid="working-sets" className="text-xs text-muted-foreground">
          {workingSetsText(sets)}
        </p>
      )}
    </SetPlanEditor>
  );
}

/** One working entry in the edit sheet: swap, remove, sets, reps, weight and its impact. */
export function EditEntryRow({
  entry,
  impact,
  onSwap,
  onRemove,
  onScheme,
  onWeight,
  onSetWeights,
  weightStep = WEIGHT_STEP_LBS,
  minWeight = 0,
  planSets,
}: {
  entry: WorkoutExerciseState;
  /** Set when the entry is a program lift of an edited day and has been edited. */
  impact: ImpactItem | undefined;
  onSwap: () => void;
  onRemove: () => void;
  onScheme: (sets: number, reps: number) => void;
  onWeight: (weight: number) => void;
  /** Each set its own weight and reps; null goes back to one weight for every set. */
  onSetWeights?: (sets: PlannedSet[] | null) => void;
  /** What a weight moves by: the plate or dumbbell step. */
  weightStep?: number;
  /** The lightest a weight can be: the empty bar for a barbell at the gym. */
  minWeight?: number;
  /**
   * The plan's own sets, for "Plan · You" on a set changed from them and "Back to plan".
   * Absent: the per-set weights are not compared with anything.
   */
  planSets?: PlannedSet[];
}) {
  const name = getExercise(entry.substituteExerciseId || entry.exerciseId).name;
  const perSet = !!entry.perSet;
  // Switches between one weight for every set and a weight per set (prefilled from the plan).
  const toggle = onSetWeights && (
    <button
      type="button"
      aria-pressed={perSet}
      aria-label={`Weight per set: ${name}`}
      onClick={() => onSetWeights(perSet ? null : plannedSetsOf(entry))}
      className={cn(
        pillButton,
        "w-fit",
        perSet ? "border-accent-primary bg-accent-primary-soft text-foreground" : "text-muted-foreground"
      )}
    >
      <Rows3 className="size-3.5" aria-hidden="true" />
      {perSet ? "Weight per set: on" : "Weight per set"}
    </button>
  );
  return (
    <li data-testid="edit-entry" className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <TierBadge tier={entry.tier} variant="soft" className="w-10 rounded-md" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
        <button type="button" className={iconButton} aria-label={`Swap ${name}`} onClick={onSwap}>
          <Repeat2 className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={iconButton} aria-label={`Remove ${name}`} onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      {perSet && onSetWeights ? (
        <>
          {toggle}
          <PerSetEditor
            name={name}
            sets={entry.perSet!}
            planSets={planSets ?? entry.perSet!}
            unit={weightUnit(entry.perHand ?? false)}
            step={weightStep}
            minWeight={minWeight}
            judged={CREDIT_TIERS.includes(entry.tier)}
            onChange={onSetWeights}
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Stepper
            label={`${name} sets`}
            value={entry.targetSets}
            min={1}
            onChange={(sets) => onScheme(sets, entry.targetReps)}
          />
          <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">×</span>
          <Stepper
            label={`${name} reps`}
            value={entry.targetReps}
            min={1}
            onChange={(reps) => onScheme(entry.targetSets, reps)}
          />
          <Stepper
            label={`${name} weight`}
            value={entry.weight}
            unit={weightUnit(entry.perHand ?? false)}
            step={weightStep}
            min={minWeight}
            onChange={onWeight}
          />
          {toggle}
        </div>
      )}
      {impact && <ImpactLine status={impact.status} heavier={impact.heavier} />}
    </li>
  );
}
