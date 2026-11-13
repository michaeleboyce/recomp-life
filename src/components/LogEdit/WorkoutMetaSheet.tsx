"use client";

import { useState } from "react";
import { ChipGroup } from "@/components/ui/chip-group";
import type { LogChange } from "@/lib/rebuild";
import type { WorkoutLocation, WorkoutSession } from "@/types";
import { EditSheetFrame } from "./EditSheetFrame";
import { FieldError, FieldLabel, TextField } from "./fields";
import { fromDateTimeInput, toDateTimeInput } from "./format";

export interface WorkoutMetaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutSession;
  /** Receives the `editWorkout` change; return false to keep the sheet open. */
  onSubmit: (change: LogChange) => unknown;
  /** Defaults to the current time; the latest date that can be chosen. */
  now?: Date;
}

const LOCATIONS: { value: WorkoutLocation; label: string }[] = [
  { value: "gym", label: "Gym" },
  { value: "home", label: "Home" },
];

/** Builds the change; an error message when the date is invalid; null when nothing changed. */
export function buildWorkoutMetaChange(
  workout: WorkoutSession,
  dateText: string,
  location: WorkoutLocation,
  now: Date
): LogChange | null | { error: string } {
  const patch: { completedAt?: Date; location?: WorkoutLocation } = {};
  if (workout.completedAt != null) {
    const date = fromDateTimeInput(dateText);
    if (!date) return { error: "Enter a date and time." };
    if (date.getTime() > now.getTime()) return { error: "The date cannot be in the future." };
    // Compare at the minute the input shows, so an untouched field is not a change.
    if (dateText !== toDateTimeInput(workout.completedAt)) patch.completedAt = date;
  }
  if (location !== workout.location) patch.location = location;
  if (Object.keys(patch).length === 0) return null;
  return { kind: "editWorkout", workoutId: workout.id, patch };
}

function MetaForm({ open, onOpenChange, workout, onSubmit, now }: WorkoutMetaSheetProps) {
  const [date, setDate] = useState(workout.completedAt ? toDateTimeInput(workout.completedAt) : "");
  const [location, setLocation] = useState<WorkoutLocation>(workout.location);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = now ?? new Date();

  async function save() {
    const change = buildWorkoutMetaChange(workout, date, location, now ?? new Date());
    if (change && "error" in change) {
      setInvalid(change.error);
      return;
    }
    setInvalid(null);
    if (!change) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(change);
      if (result !== false && result !== "error") onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      title="Date and location"
      description="Moving the date moves every set by the same amount."
      onSave={() => void save()}
      busy={busy}
    >
      {workout.completedAt != null && (
        <TextField
          label="Finished at"
          type="datetime-local"
          value={date}
          max={toDateTimeInput(latest)}
          onChange={setDate}
        />
      )}
      <FieldLabel>Location</FieldLabel>
      <ChipGroup
        ariaLabel="Location"
        options={LOCATIONS}
        value={location}
        onChange={(v) => setLocation(v as WorkoutLocation)}
      />
      <FieldError>{invalid}</FieldError>
    </EditSheetFrame>
  );
}

/** Edit a finished workout's completion date/time (not in the future) and location. */
export function WorkoutMetaSheet(props: WorkoutMetaSheetProps) {
  return <MetaForm key={`${props.workout.id}:${props.open}`} {...props} />;
}
