"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import type { LogChange } from "@/lib/rebuild";
import type { SetLog } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, StepperField } from "./fields";
import { liftName } from "./format";
import { buildAddSet, buildSetEdit, parseSetValues, REPS_MAX, RPE_MAX, RPE_MIN, WEIGHT_MAX } from "./setChanges";

export interface SetEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workoutId: string;
  /** The set being edited; in "add" mode the set the new one copies (the group's last). */
  set: SetLog;
  mode?: "edit" | "add";
  /** Set number for a new set ("add" mode). */
  nextSetNumber?: number;
  /**
   * Receives the built change. Return false (or a promise of it) to keep the sheet open,
   * for example when saving failed; anything else closes it.
   */
  onSubmit: (change: LogChange) => unknown;
  /** An error to show inside the sheet. */
  error?: string | null;
}

function SetForm({
  onOpenChange,
  workoutId,
  set,
  mode,
  nextSetNumber,
  onSubmit,
  error,
  open,
}: SetEditSheetProps & { mode: "edit" | "add" }) {
  const [reps, setReps] = useState(String(set.actualReps));
  const [weight, setWeight] = useState(String(set.weight));
  const [rpe, setRpe] = useState(set.rpe === undefined ? "" : String(set.rpe));
  const [fine, setFine] = useState(set.weight % 5 !== 0);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function hand(change: LogChange) {
    setBusy(true);
    try {
      const result = await onSubmit(change);
      if (result !== false && result !== "error") onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const values = parseSetValues(reps, weight, rpe);
    if ("error" in values) {
      setInvalid(values.error);
      return;
    }
    setInvalid(null);
    if (mode === "add") {
      void hand(buildAddSet(workoutId, set, nextSetNumber ?? set.setNumber + 1, values));
      return;
    }
    const change = buildSetEdit(workoutId, set, values);
    if (change) void hand(change);
    else onOpenChange(false);
  }

  const name = liftName(set.substituteExerciseId ?? set.exerciseId);
  const title = mode === "add" ? `Add set: ${name}` : `${name}, set ${set.setNumber}`;

  return (
    <EditSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={set.isAMRAP ? "AMRAP set: enter every rep you did." : undefined}
      onSave={save}
      saveLabel={mode === "add" ? "Add set" : "Save change"}
      onDelete={
        mode === "edit"
          ? () => void hand({ kind: "deleteSet", workoutId, setId: set.id })
          : undefined
      }
      deleteLabel="Delete set"
      busy={busy}
    >
      <StepperField label="Reps" value={reps} onChange={setReps} step={1} max={REPS_MAX} inputMode="numeric" />
      <StepperField
        label="Weight"
        unit="lbs"
        value={weight}
        onChange={setWeight}
        step={fine ? 2.5 : 5}
        max={WEIGHT_MAX}
        hint={
          <ChipGroup
            ariaLabel="Weight step"
            size="sm"
            value={fine ? "2.5" : "5"}
            onChange={(v) => setFine(v === "2.5")}
            options={[
              { value: "5", label: "5 lb steps" },
              { value: "2.5", label: "2.5 lb steps" },
            ]}
          />
        }
      />
      <StepperField
        label="RPE"
        unit="optional"
        value={rpe}
        onChange={setRpe}
        step={0.5}
        min={RPE_MIN}
        max={RPE_MAX}
        hint={
          rpe !== "" && (
            <Button type="button" variant="ghost" className="h-11 self-start" onClick={() => setRpe("")}>
              Clear RPE
            </Button>
          )
        }
      />
      <FieldError>{invalid ?? error}</FieldError>
    </EditSheetFrame>
  );
}

/** Edit one logged set (reps, weight, RPE) or delete it; in "add" mode, add a set. */
export function SetEditSheet(props: SetEditSheetProps) {
  const mode = props.mode ?? "edit";
  // Remount per set and per opening so the fields start from the stored values.
  return <SetForm key={`${props.set.id}:${mode}:${props.open}`} {...props} mode={mode} />;
}
