import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import type { NextSetPlan } from "@/types";
import { readNextSetPlans, saveNextSetPlan } from "./nextSetPlans";
import { appendSet, discardWorkout, finishWorkout, startWorkout } from "./workouts";
import { clearDb, makeProfile, makeSet, seedFixtureStartingWeights } from "./testUtils";

beforeEach(clearDb);

function plan(exerciseId: string, tier: NextSetPlan["tier"]): NextSetPlan {
  const sets = [
    { weight: 185, reps: 3 },
    { weight: 195, reps: 3 },
    { weight: 205, reps: 3 },
  ];
  return { exerciseId, liftId: exerciseId, tier, sets, planSets: sets, createdAt: "2026-11-17T09:00:00.000Z" };
}

const settings = async () => (await db.userProfile.toCollection().first())!.settings;

describe("saveNextSetPlan", () => {
  it("sets, replaces and removes one plan in the settings and marks the profile unsynced", async () => {
    const profile = makeProfile({ synced: true, updatedAt: 5 });
    await db.userProfile.put(profile);

    await saveNextSetPlan(plan("squat", "T1"), "squat|T1");
    await saveNextSetPlan(plan("ohp", "T1"), "ohp|T1");
    let after = (await db.userProfile.get(profile.id))!;
    expect(Object.keys(after.settings.nextSetPlans!).sort()).toEqual(["ohp|T1", "squat|T1"]);
    expect(after.synced).toBe(false);
    expect(after.updatedAt).toBeGreaterThan(5);
    // Nothing else in the settings moves.
    expect({ ...after.settings, nextSetPlans: undefined }).toEqual({ ...profile.settings, nextSetPlans: undefined });

    await saveNextSetPlan(null, "squat|T1");
    after = (await db.userProfile.get(profile.id))!;
    expect(after.settings.nextSetPlans).toEqual({ "ohp|T1": plan("ohp", "T1") });
    expect(await readNextSetPlans()).toEqual({ "ohp|T1": plan("ohp", "T1") });
  });

  it("rejects clearly when there is no profile", async () => {
    await expect(saveNextSetPlan(plan("squat", "T1"), "squat|T1")).rejects.toThrow(/no user profile/i);
  });
});

describe("finishing a workout uses up its set plans (E6)", () => {
  beforeEach(async () => {
    await initializeDatabase();
    await seedFixtureStartingWeights();
    await saveNextSetPlan(plan("squat", "T1"), "squat|T1");
    await saveNextSetPlan(plan("squat", "T2"), "squat|T2");
  });

  const start = () =>
    startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });

  it("removes the plans the session logged, keeps the rest", async () => {
    const id = await start();
    await appendSet(id, makeSet({ id: "s1" }));
    await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: true });
    expect(Object.keys((await settings()).nextSetPlans!)).toEqual(["squat|T2"]);
  });

  it("keeps them when the exercise was not logged", async () => {
    const id = await start();
    await appendSet(id, makeSet({ id: "s1", exerciseId: "bench", tier: "T2" }));
    await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: true });
    expect(Object.keys((await settings()).nextSetPlans!).sort()).toEqual(["squat|T1", "squat|T2"]);
  });

  it("keeps them when the workout is discarded", async () => {
    const id = await start();
    await appendSet(id, makeSet({ id: "s1" }));
    await discardWorkout(id);
    expect(Object.keys((await settings()).nextSetPlans!).sort()).toEqual(["squat|T1", "squat|T2"]);
  });

  it("a damaged set plan (from another app version) does not stop the workout finishing", async () => {
    const profile = (await db.userProfile.toCollection().first())!;
    await db.userProfile.update(profile.id, {
      settings: {
        ...profile.settings,
        nextSetPlans: { ...profile.settings.nextSetPlans, broken: null, noSets: { exerciseId: "x" } },
      } as never,
    });
    const id = await start();
    await appendSet(id, makeSet({ id: "s1" }));
    await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: true });
    expect((await db.workouts.get(id))!.completedAt).not.toBeNull();
    expect(Object.keys((await settings()).nextSetPlans!)).toEqual(["squat|T2"]);
    expect(await readNextSetPlans()).toEqual({ "squat|T2": plan("squat", "T2") });
  });

  it("does not touch the profile when nothing was used", async () => {
    const id = await start();
    const before = (await db.userProfile.toCollection().first())!.updatedAt;
    await finishWorkout(id, { completedAt: new Date(), totalDurationSeconds: 60, endedEarly: true });
    expect((await db.userProfile.toCollection().first())!.updatedAt).toBe(before);
  });
});
