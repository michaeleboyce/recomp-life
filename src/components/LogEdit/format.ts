// Display helpers shared by the log edit components.
import { EXERCISES } from "@/lib/exercises";
import { formatNumber } from "@/lib/metrics/helpers";
import type { TierPrescription } from "@/lib/rebuild";
import type { SetStatus } from "@/types";

/** "Squat", "Bench Press": the exercise name without the "Barbell" prefix. */
export function liftName(exerciseId: string): string {
  const name = EXERCISES[exerciseId]?.name ?? exerciseId;
  return name.replace(/^Barbell /, "");
}

/** 205 -> "205", 202.5 -> "202.5": one decimal only when needed. */
export function formatLbs(value: number): string {
  return formatNumber(value, 1);
}

/** "205 lbs 5x3"; the stage when the tier has one, else sets x reps. */
export function prescriptionText(p: TierPrescription): string {
  return `${formatLbs(p.weight)} lbs ${p.stage ?? `${p.sets}x${p.reps}`}`;
}

/** Words for a set that did not simply complete; null when it did. */
export function setStatusText(status: SetStatus): string | null {
  switch (status) {
    case "completed":
      return null;
    case "failed":
      return "Failed";
    case "skipped_pain":
      return "Skipped (pain)";
    case "reduced_run_fatigue":
      return "Reduced (run fatigue)";
    case "reduced_equipment":
      return "Reduced (equipment)";
    case "autoregulated_load_drop":
      return "Load dropped (RPE)";
  }
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDateTime(date: Date | string): string {
  return DATE_TIME.format(new Date(date));
}

export function formatDay(date: Date | string): string {
  return DAY.format(new Date(date));
}

/** 3120 s -> "52 min", 4500 s -> "1h 15m". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date as a `datetime-local` input value, in local time. */
export function toDateTimeInput(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value back to a Date (local time); null when empty or invalid. */
export function fromDateTimeInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
