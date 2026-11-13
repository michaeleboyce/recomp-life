// Data layer: keeps the derived tables (liftStates, estimated1RMs) equal to what the
// rebuild engine computes from the log. `applyRebuild` is the only writer of those two
// tables: finishing a workout, editing the log and seeding all go through it.
import type { Table } from "dexie";
import { db } from "@/db/local";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { diffDerived, rebuildDerived } from "@/lib/rebuild";
import type { DerivedDiff, RebuildInput } from "@/lib/rebuild";
import { PROFILE_ID } from "@/lib/sync/registry";
import type { UserSettings } from "@/types";

/**
 * The tables `applyRebuild` reads and writes. A caller that wraps `applyRebuild` in its
 * own transaction must include all of them, in "rw" mode.
 */
export function rebuildTables(): Table[] {
  return [db.workouts, db.liftAdjustments, db.userProfile, db.liftStates, db.estimated1RMs];
}

/** The profile's settings, or the defaults before the database has been seeded. */
export async function readSettings(): Promise<UserSettings> {
  const profile =
    (await db.userProfile.get(PROFILE_ID)) ?? (await db.userProfile.toCollection().first());
  return profile?.settings ?? DEFAULT_USER_PROFILE.settings;
}

/** Everything the engine needs, read from the local database. */
export async function loadRebuildInput(): Promise<RebuildInput> {
  const workouts = await db.workouts.toArray();
  const adjustments = await db.liftAdjustments.toArray();
  const settings = await readSettings();
  return { workouts, adjustments, settings };
}

async function diffAgainstStored(): Promise<DerivedDiff> {
  const rebuilt = rebuildDerived(await loadRebuildInput());
  const liftStates = await db.liftStates.toArray();
  const e1rms = await db.estimated1RMs.toArray();
  return diffDerived(rebuilt, { liftStates, e1rms });
}

/**
 * Rebuilds lift states and e1RM rows from the log and writes only the rows that
 * differ. Joins the caller's Dexie transaction when there is one (it must include
 * `rebuildTables()`); otherwise it opens its own.
 */
export async function applyRebuild(): Promise<DerivedDiff> {
  return db.transaction("rw", rebuildTables(), async () => {
    const diff = await diffAgainstStored();
    if (diff.liftStateIdsToDelete.length > 0) {
      await db.liftStates.bulkDelete(diff.liftStateIdsToDelete);
    }
    if (diff.liftStatesToPut.length > 0) await db.liftStates.bulkPut(diff.liftStatesToPut);
    if (diff.e1rmIdsToDelete.length > 0) {
      await db.estimated1RMs.bulkDelete(diff.e1rmIdsToDelete);
    }
    if (diff.e1rmsToPut.length > 0) await db.estimated1RMs.bulkPut(diff.e1rmsToPut);
    return diff;
  });
}

/** Same comparison as `applyRebuild`, without writing anything. */
export async function checkDerived(): Promise<DerivedDiff> {
  return db.transaction("r", rebuildTables(), diffAgainstStored);
}
