// Data layer: profile, bodyweight, pain, run and maintenance writes.
import type {
  BodyweightLog,
  PainSorenessEntry,
  RunLog,
  UserProfile,
  UserSettings,
} from "@/types";

const NOT_IMPLEMENTED = "not implemented: src/lib/data contract stub";

type NewRecord<T> = Omit<T, "id" | "clientId" | "synced">;

/** Merges a patch into the single profile's settings and marks the profile unsynced. */
export async function updateSettings(patch: Partial<UserSettings>): Promise<void> {
  void patch;
  throw new Error(NOT_IMPLEMENTED);
}

/** Merges a patch into the single profile (name, bodyweight, height) and marks it unsynced. */
export async function updateProfile(
  patch: Partial<Pick<UserProfile, "name" | "bodyweight" | "heightInches">>
): Promise<void> {
  void patch;
  throw new Error(NOT_IMPLEMENTED);
}

/** Adds a bodyweight entry and returns its id. */
export async function logBodyweight(entry: NewRecord<BodyweightLog>): Promise<string> {
  void entry;
  throw new Error(NOT_IMPLEMENTED);
}

export async function updateBodyweight(
  id: string,
  patch: Partial<NewRecord<BodyweightLog>>
): Promise<void> {
  void id;
  void patch;
  throw new Error(NOT_IMPLEMENTED);
}

/** Adds or replaces a pain/soreness entry and returns its id. */
export async function savePainEntry(
  entry: NewRecord<PainSorenessEntry> & { id?: string }
): Promise<string> {
  void entry;
  throw new Error(NOT_IMPLEMENTED);
}

export async function updatePainEntry(
  id: string,
  patch: Partial<NewRecord<PainSorenessEntry>>
): Promise<void> {
  void id;
  void patch;
  throw new Error(NOT_IMPLEMENTED);
}

export async function deletePainEntry(id: string): Promise<void> {
  void id;
  throw new Error(NOT_IMPLEMENTED);
}

/** Adds a run and returns its id. */
export async function logRun(run: NewRecord<RunLog>): Promise<string> {
  void run;
  throw new Error(NOT_IMPLEMENTED);
}

/** Empties every local table (Settings > Data). Does not re-seed. */
export async function clearAllData(): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}
