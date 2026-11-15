// Data layer: favourite workouts. Every write stamps `updatedAt` and marks the row
// unsynced (see stamp.ts). A delete is soft, so it survives a sync pull.
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import {
  cleanFavoriteName,
  favoriteFromSession,
  favoriteFromSetup,
} from "@/lib/favorites";
import type { FavoriteWorkout, WorkoutSession } from "@/types";
import { editStamps } from "./stamp";

type SetupInput = Parameters<typeof favoriteFromSetup>[1];

function identity(name: string) {
  const id = uuidv4();
  return { id, clientId: id, name, now: new Date() };
}

/** Saves the workout as set up on the pre-workout screen and returns the favourite's id. */
export async function saveFavoriteFromSetup(name: string, setup: SetupInput): Promise<string> {
  const favorite = favoriteFromSetup(identity(name), setup);
  await db.favoriteWorkouts.add(favorite);
  return favorite.id;
}

/**
 * Saves a finished session as a favourite and returns its id. When the session already
 * has a live favourite, that one is kept and its id returned.
 */
export async function saveFavoriteFromSession(
  session: WorkoutSession,
  name: string
): Promise<string> {
  return db.transaction("rw", db.favoriteWorkouts, async () => {
    const existing = (await db.favoriteWorkouts.toArray()).find(
      (f) => f.sourceSessionId === session.id && f.deletedAt == null
    );
    if (existing) return existing.id;
    const favorite = favoriteFromSession(identity(name), session);
    await db.favoriteWorkouts.add(favorite);
    return favorite.id;
  });
}

async function modifyFavorite(
  id: string,
  change: (favorite: FavoriteWorkout) => Partial<FavoriteWorkout>
): Promise<void> {
  await db.transaction("rw", db.favoriteWorkouts, async () => {
    const favorite = await db.favoriteWorkouts.get(id);
    if (!favorite) return;
    await db.favoriteWorkouts.update(id, { ...change(favorite), ...editStamps(favorite) });
  });
}

/** Renames a favourite. A blank name keeps the current one. */
export async function renameFavorite(id: string, name: string): Promise<void> {
  await modifyFavorite(id, (favorite) => ({ name: cleanFavoriteName(name, favorite.name) }));
}

/** Soft-deletes a favourite. Workouts started from it are not affected. */
export async function deleteFavorite(id: string): Promise<void> {
  await modifyFavorite(id, () => ({ deletedAt: Date.now() }));
}

/** Undoes a delete: the favourite is back in the list, with its rename and use history. */
export async function restoreFavorite(id: string): Promise<void> {
  await modifyFavorite(id, () => ({ deletedAt: null }));
}
