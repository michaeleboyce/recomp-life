import { db } from './local';
import { INITIAL_LIFT_STATES, DEFAULT_USER_PROFILE } from './seed';
import { v4 as uuidv4 } from 'uuid';

// Concurrent callers (DbProvider plus the per-page calls) share the run in flight.
// Only the in-flight run is shared: once it settles the next call runs again, so the
// app can re-seed after Settings > Data empties the tables.
let inFlight: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  if (!inFlight) {
    inFlight = seed().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function seed(): Promise<void> {
  await db.transaction('rw', db.userProfile, db.liftStates, async () => {
    const existingProfile = await db.userProfile.count();
    if (existingProfile === 0) {
      await db.userProfile.add({
        ...DEFAULT_USER_PROFILE,
        id: uuidv4(),
        clientId: uuidv4(),
        createdAt: new Date(),
      });
      for (const state of Object.values(INITIAL_LIFT_STATES)) {
        await db.liftStates.put({ ...state, clientId: uuidv4(), synced: false });
      }
    }

    // Ensure all template exercises have LiftStates (migration for existing users)
    for (const state of Object.values(INITIAL_LIFT_STATES)) {
      const existing = await db.liftStates.get(state.exerciseId);
      if (!existing) {
        await db.liftStates.put({ ...state, clientId: uuidv4(), synced: false });
      }
    }
  });
}
