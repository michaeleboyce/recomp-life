import { db } from './local';
import { INITIAL_LIFT_STATES, DEFAULT_USER_PROFILE } from './seed';
import { v4 as uuidv4 } from 'uuid';

export async function initializeDatabase() {
  const existingProfile = await db.userProfile.count();
  if (existingProfile === 0) {
    await db.userProfile.add({
      ...DEFAULT_USER_PROFILE,
      id: uuidv4(),
      createdAt: new Date(),
    });
    for (const state of Object.values(INITIAL_LIFT_STATES)) {
      await db.liftStates.put(state);
    }
  }
}
