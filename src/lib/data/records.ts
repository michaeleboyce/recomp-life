// Data layer: profile, bodyweight, pain, run and maintenance writes.
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import type {
  BodyweightLog,
  PainSorenessEntry,
  RunLog,
  ActivityLog,
  UserProfile,
  UserSettings,
} from "@/types";

type NewRecord<T> = Omit<T, "id" | "clientId" | "synced">;

/** Reads the single profile and applies `change` to it, in one transaction. */
async function modifyProfile(
  change: (profile: UserProfile) => Partial<UserProfile>
): Promise<void> {
  await db.transaction("rw", db.userProfile, async () => {
    const profile = await db.userProfile.toCollection().first();
    if (!profile) {
      throw new Error("No user profile: the database has not been initialised");
    }
    await db.userProfile.update(profile.id, { ...change(profile), synced: false });
  });
}

/** Merges a patch into the single profile's settings and marks the profile unsynced. */
export async function updateSettings(patch: Partial<UserSettings>): Promise<void> {
  await modifyProfile((profile) => ({ settings: { ...profile.settings, ...patch } }));
}

/** Merges a patch into the single profile (name, bodyweight, height) and marks it unsynced. */
export async function updateProfile(
  patch: Partial<Pick<UserProfile, "name" | "bodyweight" | "heightInches">>
): Promise<void> {
  await modifyProfile(() => patch);
}

/** Adds a bodyweight entry and returns its id. */
export async function logBodyweight(entry: NewRecord<BodyweightLog>): Promise<string> {
  const id = uuidv4();
  await db.bodyweight.add({ ...entry, id, clientId: id, synced: false });
  return id;
}

export async function updateBodyweight(
  id: string,
  patch: Partial<NewRecord<BodyweightLog>>
): Promise<void> {
  await db.bodyweight.update(id, { ...patch, synced: false });
}

/** Adds or replaces a pain/soreness entry and returns its id. */
export async function savePainEntry(
  entry: NewRecord<PainSorenessEntry> & { id?: string }
): Promise<string> {
  const { id: givenId, ...fields } = entry;
  const id = givenId ?? uuidv4();
  await db.transaction("rw", db.painEntries, async () => {
    const existing = givenId ? await db.painEntries.get(givenId) : undefined;
    await db.painEntries.put({
      ...fields,
      id,
      clientId: existing?.clientId ?? uuidv4(),
      synced: false,
    });
  });
  return id;
}

export async function updatePainEntry(
  id: string,
  patch: Partial<NewRecord<PainSorenessEntry>>
): Promise<void> {
  await db.painEntries.update(id, { ...patch, synced: false });
}

export async function deletePainEntry(id: string): Promise<void> {
  await db.painEntries.delete(id);
}

/** Adds a run and returns its id. */
export async function logRun(run: NewRecord<RunLog>): Promise<string> {
  const id = uuidv4();
  await db.runs.add({ ...run, id, clientId: id, synced: false });
  return id;
}

/** Adds a non-running activity (yoga, cycling, hiking...) and returns its id. */
export async function logActivity(activity: NewRecord<ActivityLog>): Promise<string> {
  const id = uuidv4();
  await db.activities.add({ ...activity, id, clientId: id, synced: false });
  return id;
}

/** Empties every local table (Settings > Data). Does not re-seed. */
export async function clearAllData(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
