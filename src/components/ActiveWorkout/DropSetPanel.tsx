"use client";

import { Minus, Plus } from "lucide-react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { getExercise } from "@/lib/exercises";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { EquipmentProfile, SetLog, WorkoutLocation } from "@/types";
import { RepPicker } from "./RepPicker";
import { WeightDisplay } from "./WeightDisplay";

interface DropSetPanelProps {
  /** The set the drops continue. */
  root: SetLog;
  /** The drops logged after it so far, in order. */
  drops: SetLog[];
  /** The drop about to be logged, as an entry (its weight and exercise). */
  exercise: WorkoutExerciseState;
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  weight: number;
  step: number;
  minWeight: number;
  onWeight: (weight: number) => void;
  reps: number;
  /** The reps of the set before, for the rep chips. */
  suggestedReps: number;
  onReps: (reps: number) => void;
  onLog: () => void;
  /** No more drops: the normal rest starts when anything is left. */
  onDone: () => void;
  /** True when the workout has sets left, so "Done" starts the rest. */
  restFollows: boolean;
  disabled?: boolean;
  message?: string | null;
}

const BIG_STEP =
  "flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-card font-mono text-lg font-semibold text-foreground transition-colors active:bg-card-raised disabled:opacity-40";

const pair = (set: Pick<SetLog, "weight" | "actualReps">) => `${set.weight}×${set.actualReps}`;

/**
 * A drop set: straight on from the set before at a lighter weight, with no rest. The
 * weight starts about a fifth lighter and moves by the plate or dumbbell step; every
 * control sits low on the screen, in reach of one thumb.
 */
export function DropSetPanel({
  root,
  drops,
  exercise,
  location,
  equipment,
  weight,
  step,
  minWeight,
  onWeight,
  reps,
  suggestedReps,
  onReps,
  onLog,
  onDone,
  restFollows,
  disabled = false,
  message,
}: DropSetPanelProps) {
  const info = getExercise(root.substituteExerciseId || root.exerciseId);
  const unit = info.grip === "per_hand" && root.substituteExerciseId ? "lbs/hand" : "lbs";
  const number = drops.length + 1;

  return (
    <>
      <section data-testid="drop-set" className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 font-display text-[12px] font-semibold tracking-[0.16em] text-accent-primary uppercase">
          <span>
            ↳ Drop {number} · after set {root.setNumber} · no rest
          </span>
          {/* How a drop counts: volume, a little strength evidence, never a pass or a fail. */}
          <EvidenceLine ruleId="drop-set-evidence" variant="icon" hideLibraryLink />
        </p>
        <h1 className="line-clamp-2 min-w-0 font-display text-[30px] leading-[0.95] font-extrabold break-words uppercase">
          {info.name}
        </h1>
        <p data-testid="drop-chain" className="font-mono text-sm tabular-nums text-muted-foreground">
          {[root, ...drops].map(pair).join(" → ")}
        </p>
      </section>

      <WeightDisplay exercise={exercise} location={location} equipment={equipment} />

      <div role="group" aria-label="Drop weight" className="flex gap-3">
        <button
          type="button"
          aria-label={`${step} ${unit} lighter`}
          className={BIG_STEP}
          disabled={weight - step < minWeight}
          onClick={() => onWeight(weight - step)}
        >
          <Minus className="size-6" aria-hidden="true" />
          {step}
        </button>
        <button
          type="button"
          aria-label={`${step} ${unit} heavier`}
          className={BIG_STEP}
          onClick={() => onWeight(weight + step)}
        >
          <Plus className="size-6" aria-hidden="true" />
          {step}
        </button>
      </div>

      <RepPicker
        targetReps={suggestedReps}
        isAMRAP={false}
        value={reps}
        onChange={onReps}
        caption="as many as you can"
      />

      <div className="fixed inset-x-0 bottom-0 z-40 bg-background/95 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {message && (
            <p role="alert" className="text-center text-sm text-destructive">
              {message}
            </p>
          )}
          <button
            type="button"
            onClick={onLog}
            disabled={disabled}
            className="h-[62px] w-full rounded-full bg-primary font-display text-[21px] leading-none font-extrabold tracking-[0.14em] text-primary-foreground uppercase transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            Log drop · {reps} {reps === 1 ? "rep" : "reps"}
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={disabled}
            className="h-14 w-full rounded-full border-[1.5px] border-border font-display text-[17px] leading-none font-extrabold tracking-[0.12em] text-foreground uppercase transition-colors active:bg-card disabled:opacity-60"
          >
            {restFollows ? "Done · rest" : "Done"}
          </button>
        </div>
      </div>
    </>
  );
}
