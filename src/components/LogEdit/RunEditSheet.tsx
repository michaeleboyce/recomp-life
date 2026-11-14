"use client";

import { useState } from "react";
import { EffortPicker, type Effort } from "@/components/Activity/EffortPicker";
import { ChipGroup } from "@/components/ui/chip-group";
import { updateRun } from "@/lib/data/logEdits";
import type { RunCategory, RunLog, RunType } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, FieldLabel, NotesField, TextField } from "./fields";
import { fromDateTimeInput, toDateTimeInput } from "./format";
import { changedFields, optionalNumber, saveEntryWithUndo, type EntrySheetProps } from "./saveEntry";
import { useDeleteWithUndo } from "./useDeleteWithUndo";

// Same lists as RunLogger, which does not export them.
const RUN_TYPES: { value: RunType; label: string }[] = [
  { value: "outdoor", label: "Outdoor" },
  { value: "treadmill", label: "Treadmill" },
  { value: "trail", label: "Trail" },
];
const RUN_CATEGORIES: { value: RunCategory; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "tempo", label: "Tempo" },
  { value: "intervals", label: "Intervals" },
  { value: "long", label: "Long" },
  { value: "other", label: "Other" },
];

function RunForm({ open, onOpenChange, entry, now }: EntrySheetProps<RunLog>) {
  const [date, setDate] = useState(toDateTimeInput(entry.date));
  const [duration, setDuration] = useState(String(entry.durationMinutes));
  const [distance, setDistance] = useState(entry.distanceMiles == null ? "" : String(entry.distanceMiles));
  const [type, setType] = useState<RunType>(entry.type);
  const [category, setCategory] = useState<RunCategory>(entry.category);
  const [effort, setEffort] = useState<Effort>(entry.perceivedEffort);
  const [notes, setNotes] = useState(entry.notes);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deletion = useDeleteWithUndo();
  const latest = now ?? new Date();

  async function save() {
    const when = fromDateTimeInput(date);
    const minutes = Number(duration);
    const miles = optionalNumber(distance);
    if (!when || when > latest) return setInvalid("Enter a date that is not in the future.");
    if (!Number.isFinite(minutes) || minutes <= 0) return setInvalid("Enter the duration in minutes.");
    if (miles === undefined) return setInvalid("Enter the distance in miles, or leave it empty.");
    setInvalid(null);
    const patch = changedFields(entry, {
      date: date === toDateTimeInput(entry.date) ? entry.date : when,
      durationMinutes: minutes,
      distanceMiles: miles,
      type,
      category,
      perceivedEffort: effort,
      notes,
    });
    setBusy(true);
    const ok = await saveEntryWithUndo(updateRun, entry.id, entry, patch, "Run");
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <>
      <EditSheetFrame
        open={open}
        onOpenChange={onOpenChange}
        title="Edit run"
        onSave={() => void save()}
        onDelete={() =>
          void deletion.deleteEntry("runs", entry.id, "Run", () => onOpenChange(false))
        }
        deleteLabel="Delete run"
        busy={busy || deletion.busy}
      >
        <TextField label="Date" type="datetime-local" value={date} max={toDateTimeInput(latest)} onChange={setDate} />
        <TextField label="Duration (minutes)" type="number" inputMode="decimal" value={duration} onChange={setDuration} />
        <TextField label="Distance (miles, optional)" type="number" inputMode="decimal" step="0.01" value={distance} onChange={setDistance} />
        <FieldLabel>Type</FieldLabel>
        <ChipGroup ariaLabel="Run type" options={RUN_TYPES} value={type} onChange={(v) => setType(v as RunType)} />
        <FieldLabel>Category</FieldLabel>
        <ChipGroup ariaLabel="Run category" options={RUN_CATEGORIES} value={category} onChange={(v) => setCategory(v as RunCategory)} />
        <EffortPicker value={effort} onChange={setEffort} />
        <NotesField value={notes} onChange={setNotes} />
        <FieldError>{invalid}</FieldError>
      </EditSheetFrame>
      {deletion.sheet}
    </>
  );
}

/** Edit or delete a logged run. */
export function RunEditSheet(props: EntrySheetProps<RunLog>) {
  return <RunForm key={`${props.entry.id}:${props.open}`} {...props} />;
}
