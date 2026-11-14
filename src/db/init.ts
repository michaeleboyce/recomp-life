import { applyRebuild, rebuildTables } from '@/lib/data/derived';
import { PROFILE_ID } from '@/lib/sync/registry';
import { db, dropLegacyDatabase } from './local';
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES, SEED_STAMP, startAdjustments } from './seed';

// Concurrent callers (DbProvider plus the per-page calls) share the run in flight.
// Only the in-flight run is shared: once it settles the next call runs again, so the
// app can re-seed after Settings > Data empties the tables.
let inFlight: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  if (!inFlight) {
    // Best effort and not awaited: the old database must never hold up the app.
    void dropLegacyDatabase();
    inFlight = seed().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Makes sure the single profile and one `start` adjustment per lift exist, then lets
 * the rebuild produce the lift states. Lift states are never written here: they are a
 * projection of the log. Idempotent: a second run adds nothing and rebuilds nothing.
 */
async function seed(): Promise<void> {
  await db.transaction('rw', rebuildTables(), async () => {
    let changed = false;

    const existingProfile = await db.userProfile.count();
    if (existingProfile === 0) {
      await db.userProfile.add({
        ...DEFAULT_USER_PROFILE,
        id: PROFILE_ID,
        clientId: PROFILE_ID,
        createdAt: new Date(),
        updatedAt: SEED_STAMP,
        deletedAt: null,
        synced: false,
      });
      changed = true;
    }

    // A lift added to the program later gets its start adjustment here. A row that
    // exists is left alone, whatever it holds: the user may have edited or deleted it.
    for (const adjustment of startAdjustments()) {
      if (!(await db.liftAdjustments.get(adjustment.id))) {
        await db.liftAdjustments.add(adjustment);
        changed = true;
      }
    }

    // Also rebuild when a lift-state row is missing (tables emptied one by one).
    if (!changed) {
      const stored = new Set(await db.liftStates.toCollection().primaryKeys());
      changed = Object.keys(INITIAL_LIFT_STATES).some((id) => !stored.has(id));
    }
    if (changed) await applyRebuild();
  });
}
