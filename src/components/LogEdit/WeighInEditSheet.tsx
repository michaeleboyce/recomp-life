"use client";

import { useState } from "react";
import { ChipGroup } from "@/components/ui/chip-group";
import { updateBodyweight } from "@/lib/data/records";
import type { BodyweightLog, TimeOfDay } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, FieldLabel, StepperField, TextField } from "./fields";
import { formatLbs, fromDateTimeInput, toDateTimeInput } from "./format";
import { changedFields, saveEntryWithUndo, type EntrySheetProps } from "./saveEntry";
import { useDeleteWithUndo } from "./useDeleteWithUndo";

/** The bounds WeighInList uses. */
const MIN_WEIGHT = 50;
const MAX_WEIGHT = 500;

const TIMES: { value: TimeOfDay; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "other", label: "Other" },
];

function WeighInForm({ open, onOpenChange, entry, now }: EntrySheetProps<BodyweightLog>) {
  const [date, setDate] = useState(toDateTimeInput(entry.date));
  const [weight, setWeight] = useState(String(entry.weight));
  const [time, setTime] = useState<TimeOfDay>(entry.timeOfDay);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deletion = useDeleteWithUndo();
  const latest = now ?? new Date();
  const label = `Weigh-in ${formatLbs(entry.weight)} lbs`;

  async function save() {
    const when = fromDateTimeInput(date);
    const w = Number(weight);
    if (!when || when > latest) return setInvalid("Enter a date that is not in the future.");
    if (weight.trim() === "" || !Number.isFinite(w) || w < MIN_WEIGHT || w > MAX_WEIGHT) {
      return setInvalid(`Enter a weight between ${MIN_WEIGHT} and ${MAX_WEIGHT} lbs.`);
    }
    setInvalid(null);
    const patch = changedFields(entry, {
      date: date === toDateTimeInput(entry.date) ? entry.date : when,
      weight: w,
      timeOfDay: time,
    });
    setBusy(true);
    const ok = await saveEntryWithUndo(updateBodyweight, entry.id, entry, patch, "Weigh-in");
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <>
      <EditSheetFrame
        open={open}
        onOpenChange={onOpenChange}
        title="Edit weigh-in"
        onSave={() => void save()}
        onDelete={() =>
          void deletion.deleteEntry("bodyweight", entry.id, label, () => onOpenChange(false))
        }
        deleteLabel="Delete weigh-in"
        busy={busy || deletion.busy}
      >
        <TextField label="Date" type="datetime-local" value={date} max={toDateTimeInput(latest)} onChange={setDate} />
        <StepperField label="Weight" unit="lbs" value={weight} onChange={setWeight} step={0.1} min={MIN_WEIGHT} max={MAX_WEIGHT} />
        <FieldLabel>Time of day</FieldLabel>
        <ChipGroup ariaLabel="Time of day" options={TIMES} value={time} onChange={(v) => setTime(v as TimeOfDay)} />
        <FieldError>{invalid}</FieldError>
      </EditSheetFrame>
      {deletion.sheet}
    </>
  );
}

/** Edit or delete a weigh-in. */
export function WeighInEditSheet(props: EntrySheetProps<BodyweightLog>) {
  return <WeighInForm key={`${props.entry.id}:${props.open}`} {...props} />;
}
