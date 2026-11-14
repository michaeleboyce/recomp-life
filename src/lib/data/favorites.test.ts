import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/local";
import { listFavorites, resolveFavorite } from "@/lib/favorites";
import { getSyncTable } from "@/lib/sync/registry";
import {
  deleteFavorite,
  renameFavorite,
  restoreFavorite,
  saveFavoriteFromSession,
  saveFavoriteFromSetup,
} from "./favorites";
import { exportBackup, parseBackup } from "./backup";
import { clearDb, makeSet, makeWorkout } from "./testUtils";
import { startWorkout } from "./workouts";

beforeEach(clearDb);

const SETUP = {
  templateId: "A1",
  location: "gym" as const,
  includeWarmUps: false,
  selectedAccessories: ["face_pulls"],
  substitutes: {},
  edits: [{ kind: "remove" as const, exerciseId: "lat_pulldown", tier: "T3" as const }],
  plan: [],
};

describe("favourite workouts", () => {
  it("saves a set-up as an unsynced, stamped row", async () => {
    const before = Date.now();
    const id = await saveFavoriteFromSetup("  Quick  A1 ", SETUP);
    const row = (await db.favoriteWorkouts.get(id))!;
    expect(row).toMatchObject({
      id,
      clientId: id,
      name: "Quick A1",
      templateId: "A1",
      selectedAccessories: ["face_pulls"],
      edits: SETUP.edits,
      deletedAt: null,
      synced: false,
    });
    expect(row.updatedAt).toBeGreaterThanOrEqual(before);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("saves a finished session once: a second save returns the same favourite", async () => {
    const session = makeWorkout({
      completedAt: new Date("2026-11-10T10:00:00Z"),
      sets: [makeSet({ exerciseId: "squat", tier: "T1", weight: 190, targetReps: 3 })],
    });
    const first = await saveFavoriteFromSession(session, "Good day");
    const second = await saveFavoriteFromSession(session, "Another name");
    expect(second).toBe(first);
    expect(await db.favoriteWorkouts.count()).toBe(1);
    expect((await db.favoriteWorkouts.get(first))!).toMatchObject({
      name: "Good day",
      sourceSessionId: session.id,
      snapshot: [{ exerciseId: "squat", tier: "T1", sets: 1, reps: 3, weight: 190, isAMRAP: false }],
    });
  });

  it("renames with a later stamp and keeps the name when the new one is blank", async () => {
    const id = await saveFavoriteFromSetup("First", SETUP);
    const saved = (await db.favoriteWorkouts.get(id))!;
    await db.favoriteWorkouts.update(id, { synced: true });

    await renameFavorite(id, " Second ");
    const renamed = (await db.favoriteWorkouts.get(id))!;
    expect(renamed.name).toBe("Second");
    expect(renamed.synced).toBe(false);
    expect(renamed.updatedAt!).toBeGreaterThan(saved.updatedAt!);

    await renameFavorite(id, "   ");
    expect((await db.favoriteWorkouts.get(id))!.name).toBe("Second");
  });

  it("deletes softly: the row stays, stamped and unsynced, and leaves the list", async () => {
    const id = await saveFavoriteFromSetup("Gone", SETUP);
    await db.favoriteWorkouts.update(id, { synced: true });
    await deleteFavorite(id);

    const row = (await db.favoriteWorkouts.get(id))!;
    expect(row.deletedAt).toEqual(expect.any(Number));
    expect(row.synced).toBe(false);
    expect(listFavorites(await db.favoriteWorkouts.toArray())).toEqual([]);

    // A session's favourite that was deleted can be saved again.
    await deleteFavorite("missing-id");
  });

  it("restores a deleted favourite with a newer stamp, and ignores an unknown id", async () => {
    const id = await saveFavoriteFromSetup("Back again", SETUP);
    await deleteFavorite(id);
    const deleted = (await db.favoriteWorkouts.get(id))!;
    await db.favoriteWorkouts.update(id, { synced: true });

    await restoreFavorite(id);
    const row = (await db.favoriteWorkouts.get(id))!;
    expect(row.deletedAt).toBeNull();
    expect(row.name).toBe("Back again");
    expect(row.synced).toBe(false);
    expect(row.updatedAt).toBeGreaterThan(deleted.updatedAt ?? 0);
    expect(listFavorites(await db.favoriteWorkouts.toArray())).toHaveLength(1);

    await restoreFavorite("missing-id");
  });

  it("starting from a favourite stores the edits and the favourite, and marks it used", async () => {
    const id = await saveFavoriteFromSetup("Quick A1", SETUP);
    const favorite = (await db.favoriteWorkouts.get(id))!;
    const resolved = resolveFavorite(favorite, "current");
    const sessionId = await startWorkout({
      templateId: resolved.templateId,
      location: resolved.location,
      includeWarmUps: resolved.includeWarmUps,
      selectedAccessories: resolved.selectedAccessories,
      planEdits: resolved.planEdits,
      favoriteId: resolved.favoriteId,
    });

    const session = (await db.workouts.get(sessionId))!;
    expect(session.planEdits).toEqual(SETUP.edits);
    expect(session.favoriteId).toBe(id);
    const used = (await db.favoriteWorkouts.get(id))!;
    expect(used.lastUsedAt).toEqual(session.startedAt);
    expect(used.updatedAt!).toBeGreaterThan(favorite.updatedAt!);
    expect(used.synced).toBe(false);
  });

  it("a plain workout stores neither field", async () => {
    const sessionId = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: [],
      planEdits: [],
    });
    const session = (await db.workouts.get(sessionId))!;
    expect("planEdits" in session).toBe(false);
    expect("favoriteId" in session).toBe(false);
  });

  it("is in the sync registry and in backups", async () => {
    const table = getSyncTable("favoriteWorkouts")!;
    expect(table.pgName).toBe("favorite_workouts");
    expect(table.jsonFields).toEqual(["selectedAccessories", "substitutes", "edits", "snapshot"]);
    const workouts = getSyncTable("workouts")!;
    expect(workouts.columns.planEdits).toBe("plan_edits");
    expect(workouts.columns.favoriteId).toBe("favorite_id");
    expect(workouts.jsonFields).toContain("planEdits");

    const id = await saveFavoriteFromSetup("Backed up", SETUP);
    const backup = parseBackup(JSON.stringify(await exportBackup()));
    expect(backup.tables.favoriteWorkouts.map((f) => f.id)).toEqual([id]);
    expect(backup.tables.favoriteWorkouts[0].createdAt).toBeInstanceOf(Date);
  });
});
