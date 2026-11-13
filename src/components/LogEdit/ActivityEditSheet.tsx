"use client";

import { useState } from "react";
import { EffortPicker, type Effort } from "@/components/Activity/EffortPicker";
import { ChipGroup } from "@/components/ui/chip-group";
import { describeActivity, DISTANCE_KINDS, YOGA_STYLE_LABELS, YOGA_STYLES } from "@/lib/activities";
import { updateActivity } from "@/lib/data/logEdits";
import type { ActivityLog, YogaStyle } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, FieldLabel, NotesField, TextField } from "./fields";
import { fromDateTimeInput, toDateTimeInput } from "./format";
import { changedFields, optionalNumber, saveEntryWithUndo, type EntrySheetProps } from "./saveEntry";
import { useDeleteWithUndo } from "./useDeleteWithUndo";

const STYLE_OPTIONS = YOGA_STYLES.map((s) => ({ value: s, label: YOGA_STYLE_LABELS[s] }));

function ActivityForm({ open, onOpenChange, entry, now }: EntrySheetProps<ActivityLog>) {
  const [date, setDate] = useState(toDateTimeInput(entry.date));
  const [duration, setDuration] = useState(String(entry.durationMinutes));
  const [style, setStyle] = useState<YogaStyle | null>(entry.style);
  const [distance, setDistance] = useState(entry.distanceMiles == null ? "" : String(entry.distanceMiles));
  const [effort, setEffort] = useState<Effort>(entry.perceivedEffort);
  const [notes, setNotes] = useState(entry.notes);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deletion = useDeleteWithUndo();
  const latest = now ?? new Date();
  const hasDistance = DISTANCE_KINDS.includes(entry.kind);
  const label = describeActivity(entry);

  async function save() {
    const when = fromDateTimeInput(date);
    const minutes = Number(duration);
    const miles = hasDistance ? optionalNumber(distance) : entry.distanceMiles;
    if (!when || when > latest) return setInvalid("Enter a date that is not in the future.");
    if (!Number.isFinite(minutes) || minutes <= 0) return setInvalid("Enter the duration in minutes.");
    if (miles === undefined) return setInvalid("Enter the distance in miles, or leave it empty.");
    setInvalid(null);
    const patch = changedFields(entry, {
      date: date === toDateTimeInput(entry.date) ? entry.date : when,
      durationMinutes: minutes,
      style: entry.kind === "yoga" ? style : null,
      distanceMiles: miles,
      perceivedEffort: effort,
      notes,
    });
    setBusy(true);
    const ok = await saveEntryWithUndo(updateActivity, entry.id, entry, patch, label);
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <>
      <EditSheetFrame
        open={open}
        onOpenChange={onOpenChange}
        title={`Edit ${label.toLowerCase()}`}
        onSave={() => void save()}
        onDelete={() =>
          void deletion.deleteEntry("activities", entry.id, label, () => onOpenChange(false))
        }
        deleteLabel="Delete activity"
        busy={busy || deletion.busy}
      >
        <TextField label="Date" type="datetime-local" value={date} max={toDateTimeInput(latest)} onChange={setDate} />
        <TextField label="Duration (minutes)" type="number" inputMode="decimal" value={duration} onChange={setDuration} />
        {entry.kind === "yoga" && (
          <>
            <FieldLabel>Style</FieldLabel>
            <ChipGroup
              ariaLabel="Yoga style"
              options={STYLE_OPTIONS}
              value={style ?? ""}
              onChange={(v) => setStyle(v as YogaStyle)}
            />
          </>
        )}
        {hasDistance && (
          <TextField label="Distance (miles, optional)" type="number" inputMode="decimal" step="0.01" value={distance} onChange={setDistance} />
        )}
        <EffortPicker value={effort} onChange={setEffort} />
        <NotesField value={notes} onChange={setNotes} />
        <FieldError>{invalid}</FieldError>
      </EditSheetFrame>
      {deletion.sheet}
    </>
  );
}

/** Edit or delete a logged activity (yoga, cycling, hiking, walking, other). */
export function ActivityEditSheet(props: EntrySheetProps<ActivityLog>) {
  return <ActivityForm key={`${props.entry.id}:${props.open}`} {...props} />;
}
