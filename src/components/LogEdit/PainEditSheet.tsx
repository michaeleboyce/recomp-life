"use client";

import { useId, useState } from "react";
import { ChipGroup } from "@/components/ui/chip-group";
import { ALL_BODY_REGIONS } from "@/lib/anatomy/regionMapping";
import { updatePainEntry } from "@/lib/data/records";
import { formatRegion } from "@/lib/painModifications";
import type { BodyRegion, PainSorenessEntry } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, FieldLabel, NotesField, TextField } from "./fields";
import { fromDateTimeInput, toDateTimeInput } from "./format";
import { changedFields, saveEntryWithUndo, type EntrySheetProps } from "./saveEntry";
import { useDeleteWithUndo } from "./useDeleteWithUndo";

type Severity = PainSorenessEntry["severity"];
const SEVERITIES = ([1, 2, 3, 4, 5] as const).map((n) => ({ value: String(n), label: String(n) }));

function PainForm({ open, onOpenChange, entry, now }: EntrySheetProps<PainSorenessEntry>) {
  const regionId = useId();
  const [date, setDate] = useState(toDateTimeInput(entry.date));
  const [region, setRegion] = useState<BodyRegion>(entry.region);
  const [severity, setSeverity] = useState<Severity>(entry.severity);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deletion = useDeleteWithUndo();
  const latest = now ?? new Date();
  const noun = entry.sensation === "pain" ? "Pain" : "Soreness";
  const label = `${noun} entry, ${formatRegion(entry.region).toLowerCase()}`;

  async function save() {
    const when = fromDateTimeInput(date);
    if (!when || when > latest) return setInvalid("Enter a date that is not in the future.");
    setInvalid(null);
    const patch = changedFields(entry, {
      date: date === toDateTimeInput(entry.date) ? entry.date : when,
      region,
      severity,
      notes: notes === "" && entry.notes === undefined ? undefined : notes,
    });
    setBusy(true);
    const ok = await saveEntryWithUndo(updatePainEntry, entry.id, entry, patch, `${noun} entry`);
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <>
      <EditSheetFrame
        open={open}
        onOpenChange={onOpenChange}
        title={`Edit ${noun.toLowerCase()} entry`}
        onSave={() => void save()}
        onDelete={() =>
          void deletion.deleteEntry("painEntries", entry.id, label, () => onOpenChange(false))
        }
        deleteLabel="Delete entry"
        busy={busy || deletion.busy}
      >
        <TextField label="Date" type="datetime-local" value={date} max={toDateTimeInput(latest)} onChange={setDate} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={regionId} className="text-sm font-medium text-foreground">
            Region
          </label>
          <select
            id={regionId}
            value={region}
            onChange={(e) => setRegion(e.target.value as BodyRegion)}
            className="h-12 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {ALL_BODY_REGIONS.map((r) => (
              <option key={r} value={r}>
                {formatRegion(r)}
              </option>
            ))}
          </select>
        </div>
        <FieldLabel>Severity (1 mild to 5 severe)</FieldLabel>
        <ChipGroup
          ariaLabel="Severity"
          options={SEVERITIES}
          value={String(severity)}
          onChange={(v) => setSeverity(Number(v) as Severity)}
        />
        <NotesField value={notes} onChange={setNotes} />
        <FieldError>{invalid}</FieldError>
      </EditSheetFrame>
      {deletion.sheet}
    </>
  );
}

/** Edit or delete a pain or soreness entry. */
export function PainEditSheet(props: EntrySheetProps<PainSorenessEntry>) {
  return <PainForm key={`${props.entry.id}:${props.open}`} {...props} />;
}
