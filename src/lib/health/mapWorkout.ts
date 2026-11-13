// Turns an Apple Health workout into the run or activity the app would log. Pure.
import type { ActivityKind, RunType } from "@/types";
import type { HealthWorkout } from "./types";
import { metresToMiles } from "./units";

/** Fields shared by an imported run and an imported activity. */
interface ImportedBase {
  /** HealthKit UUID; also the basis of the row's id (see importedRowId). */
  externalId: string;
  sourceName: string | null;
  date: Date;
  durationMinutes: number;
  distanceMiles: number | null;
  notes: string;
  /** Apple Health has no effort rating, and the app never guesses one. */
  perceivedEffort: null;
}

export interface ImportedRun extends ImportedBase {
  type: RunType;
  category: "other";
}

export interface ImportedActivity extends ImportedBase {
  kind: ActivityKind;
  style: null;
}

export type MappedWorkout =
  | { table: "runs"; record: ImportedRun }
  | { table: "activities"; record: ImportedActivity };

/** Row id (and clientId) of anything imported from Apple Health. */
export function importedRowId(uuid: string): string {
  return `hk:${uuid}`;
}

/**
 * Strength workouts are never imported as activities: they are matched to the
 * lifting session they were recorded during (see ./linkSession).
 */
export function isStrengthWorkout(workout: Pick<HealthWorkout, "type">): boolean {
  return workout.type === "strength";
}

const ACTIVITY_KIND: Partial<Record<HealthWorkout["type"], ActivityKind>> = {
  cycling: "cycling",
  hiking: "hiking",
  walking: "walking",
  yoga: "yoga",
  other: "other",
};

/** "highIntensityIntervalTraining" -> "High intensity interval training". */
function readableType(rawType: string): string {
  const words = rawType.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/**
 * The run or activity an Apple Health workout becomes, or null for a strength
 * workout. Runs are "treadmill" when recorded indoors and "outdoor" otherwise;
 * Health cannot tell a trail run or an easy run from any other, so the category
 * is "other". A workout of a kind the app has no name for keeps Health's name
 * in its notes.
 */
export function mapWorkout(workout: HealthWorkout): MappedWorkout | null {
  if (isStrengthWorkout(workout)) return null;

  const base: ImportedBase = {
    externalId: workout.uuid,
    sourceName: workout.sourceName,
    date: workout.start,
    durationMinutes: Math.round((workout.durationSeconds / 60) * 10) / 10,
    distanceMiles:
      workout.distanceMetres !== null && workout.distanceMetres > 0
        ? metresToMiles(workout.distanceMetres)
        : null,
    notes: "",
    perceivedEffort: null,
  };

  if (workout.type === "running") {
    return {
      table: "runs",
      record: { ...base, type: workout.indoor ? "treadmill" : "outdoor", category: "other" },
    };
  }

  const kind = ACTIVITY_KIND[workout.type] ?? "other";
  return {
    table: "activities",
    record: {
      ...base,
      kind,
      style: null,
      notes: kind === "other" ? readableType(workout.rawType) : "",
    },
  };
}
