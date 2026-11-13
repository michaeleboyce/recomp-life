// The one list of synced tables. The sync client, the server guard and both sync
// routes read it; nothing else may keep its own list. No imports: safe on both sides.
//
// Lift states and estimated 1RMs are not here on purpose: they are rebuilt on each
// device from the log (src/lib/rebuild) and never travel.

export interface SyncTableDef {
  /** Name of the local (Dexie) table and the key used in the sync payload. */
  name: string;
  /** Postgres table name. */
  pgName: string;
  /** Client field -> Postgres column, for fields whose names differ. */
  columns: Readonly<Record<string, string>>;
  /** Client fields stored as JSON on the server. */
  jsonFields: readonly string[];
  /** The app keeps exactly one row (the profile, with a fixed id). */
  singleRow?: boolean;
}

/** Stamp fields every synced table carries. */
const STAMPS = {
  clientId: "client_id",
  updatedAt: "updated_at",
  deletedAt: "deleted_at",
  externalId: "external_id",
} as const;

export const SYNC_REGISTRY: readonly SyncTableDef[] = [
  {
    name: "workouts",
    pgName: "workouts",
    columns: {
      ...STAMPS,
      templateId: "template_id",
      startedAt: "started_at",
      completedAt: "completed_at",
      totalDurationSeconds: "total_duration_seconds",
      includeWarmUps: "include_warm_ups",
      selectedAccessories: "selected_accessories",
      preWorkoutPainEntries: "pre_workout_pain_entries",
      endedEarly: "ended_early",
      completionContext: "completion_context",
    },
    jsonFields: [
      "selectedAccessories",
      "sets",
      "preWorkoutPainEntries",
      "modifications",
      "prescribed",
      "completionContext",
    ],
  },
  {
    name: "liftAdjustments",
    pgName: "lift_adjustments",
    columns: { ...STAMPS, exerciseId: "exercise_id" },
    jsonFields: ["set"],
  },
  {
    name: "runs",
    pgName: "runs",
    columns: {
      ...STAMPS,
      durationMinutes: "duration_minutes",
      distanceMiles: "distance_miles",
      perceivedEffort: "perceived_effort",
    },
    jsonFields: [],
  },
  {
    name: "activities",
    pgName: "activities",
    columns: {
      ...STAMPS,
      durationMinutes: "duration_minutes",
      distanceMiles: "distance_miles",
      perceivedEffort: "perceived_effort",
    },
    jsonFields: [],
  },
  {
    name: "bodyweight",
    pgName: "bodyweight",
    columns: { ...STAMPS, timeOfDay: "time_of_day" },
    jsonFields: [],
  },
  {
    name: "painEntries",
    pgName: "pain_entries",
    columns: { ...STAMPS, associatedWorkoutId: "associated_workout_id" },
    jsonFields: [],
  },
  {
    name: "readinessLogs",
    pgName: "readiness_logs",
    columns: {
      ...STAMPS,
      sessionId: "session_id",
      sleepHours: "sleep_hours",
      stressLevel: "stress_level",
    },
    jsonFields: [],
  },
  {
    name: "userProfile",
    pgName: "user_profile",
    columns: { ...STAMPS, heightInches: "height_inches", createdAt: "created_at" },
    jsonFields: ["settings"],
    singleRow: true,
  },
];

/** The fixed id (and clientId) of the single profile row, so two devices share one. */
export const PROFILE_ID = "profile";

export function getSyncTable(name: string): SyncTableDef | undefined {
  return SYNC_REGISTRY.find((table) => table.name === name);
}
