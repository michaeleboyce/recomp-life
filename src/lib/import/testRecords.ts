// Builders for MADE-UP imported sessions, for tests only. Not used by app code.
import type { ImportedSessionRecord, ImportedSetRecord } from "@/types";

let counter = 0;

/** A made-up imported set: a working set of 5 reps at 100 lb, mapped to the squat. */
export function makeImportedSet(overrides: Partial<ImportedSetRecord> = {}): ImportedSetRecord {
  counter += 1;
  return {
    id: `imp-set-${counter}`,
    exerciseName: "Test Squat",
    mappedExerciseId: "squat",
    setOrder: 1,
    reps: 5,
    weightPerImplementLb: 100,
    implementCount: 1,
    multiplierRaw: 1,
    weightCountsAsLoad: true,
    durationSec: null,
    distanceM: null,
    role: "work",
    effort: null,
    ...overrides,
  };
}

/** A made-up imported session holding `sets`, started at `startedAt`. */
export function makeImportedSession(
  sets: ImportedSetRecord[],
  overrides: Partial<ImportedSessionRecord> = {}
): ImportedSessionRecord {
  counter += 1;
  const id = overrides.id ?? `imp-session-${counter}`;
  return {
    id,
    clientId: id,
    sourceApp: "fitbod",
    startedAt: new Date("2024-03-04T17:00:00Z"),
    startIsLocal: false,
    endedAt: null,
    title: "",
    notes: "",
    importBatchId: "test-batch",
    sets,
    updatedAt: 1,
    deletedAt: null,
    synced: false,
    ...overrides,
  };
}

const DAY_MS = 86_400_000;

/** Noon UTC, `n` days after a fixed made-up start. */
export function importDay(n: number): Date {
  return new Date(Date.UTC(2024, 0, 1, 12) + n * DAY_MS);
}
