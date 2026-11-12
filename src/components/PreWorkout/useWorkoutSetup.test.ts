import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeWorkout } from "@/lib/data/testUtils";
import { useActiveWorkout } from "@/components/ActiveWorkout/useActiveWorkout";
import { ACCESSORY_IDS } from "@/lib/exercises";
import { buildWorkoutPlan, overridesFromSession } from "@/lib/workout";
import { ACCESSORY_RECOMMENDATIONS, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";

/** An accessory that is not one of A1's recommendations. */
const OFF_DAY = ACCESSORY_IDS.find((id) => !ACCESSORY_RECOMMENDATIONS.A1.includes(id))!;
import { useWorkoutStore } from "@/stores/workoutStore";
import type { ActivityLog, RunLog, UserSettings } from "@/types";
import { useWorkoutSetup } from "./useWorkoutSetup";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  useWorkoutStore.getState().reset();
});

async function patchSettings(patch: Partial<UserSettings>) {
  const profile = (await db.userProfile.toCollection().first())!;
  await db.userProfile.update(profile.id, { settings: { ...profile.settings, ...patch } });
}

async function mount(templateId?: string) {
  const hook = renderHook(() => useWorkoutSetup(templateId));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

const describePlan = (plan: { tier: string; exerciseId: string; substituteExerciseId?: string }[]) =>
  plan.map((e) => `${e.tier}:${e.substituteExerciseId ?? e.exerciseId}`);

describe("which workout", () => {
  it("is A1 with no history, and the URL's template when one is given", async () => {
    expect((await mount()).result.current.templateId).toBe("A1");
    expect((await mount("B2")).result.current.templateId).toBe("B2");
    expect((await mount("nonsense")).result.current.templateId).toBe("A1");
  });

  it("follows the rotation from completed workouts only", async () => {
    await db.workouts.bulkPut([
      makeWorkout({
        templateId: "A1",
        startedAt: new Date(Date.now() - 3 * DAY),
        completedAt: new Date(Date.now() - 3 * DAY + HOUR),
      }),
      // Started later but abandoned: must not advance the rotation.
      makeWorkout({ templateId: "B1", startedAt: new Date(Date.now() - DAY), completedAt: null }),
    ]);
    expect((await mount()).result.current.templateId).toBe("B1");
  });
});

describe("preview", () => {
  it("defaults location and warm-ups from the profile and remembers a changed location", async () => {
    await patchSettings({ defaultLocation: "home", showWarmUps: false });
    const hook = await mount();
    expect(hook.result.current.location).toBe("home");
    expect(hook.result.current.warmUps).toBe(false);

    act(() => hook.result.current.setLocation("gym"));
    expect(hook.result.current.location).toBe("gym");
    await waitFor(async () =>
      expect((await db.userProfile.toCollection().first())!.settings.defaultLocation).toBe("gym")
    );
    // Toggling warm-ups is for this workout only.
    act(() => hook.result.current.setWarmUps(true));
    expect(hook.result.current.warmUps).toBe(true);
    expect((await db.userProfile.toCollection().first())!.settings.showWarmUps).toBe(false);
  });

  it("previews warm-ups for the T1 lift only, as the active workout performs them", async () => {
    const hook = await mount("A1");
    const warmUps = hook.result.current.plan.filter((e) => e.isWarmUp);
    expect(warmUps.map((e) => `${e.exerciseId}:${e.weight}x${e.targetReps}`)).toEqual([
      "squat:45x10",
      "squat:95x5",
      "squat:135x3",
      "squat:160x1",
    ]);
    act(() => hook.result.current.setWarmUps(false));
    expect(describePlan(hook.result.current.plan)).toEqual([
      "T1:squat",
      "T2:bench",
      "T3:lat_pulldown",
    ]);
  });

  it("adds chosen accessories to the plan", async () => {
    const hook = await mount("A1");
    const accessory = hook.result.current.accessoryRecommendations[0];
    act(() => hook.result.current.toggleAccessory(accessory));
    expect(hook.result.current.plan.at(-1)).toMatchObject({
      exerciseId: accessory,
      tier: "accessory",
    });
    act(() => hook.result.current.toggleAccessory(accessory));
    expect(hook.result.current.plan.some((e) => e.tier === "accessory")).toBe(false);
  });

  it("offers the technique review for squat and deadlift days only", async () => {
    expect((await mount("A1")).result.current.techniqueFocus).toBe("squat");
    expect((await mount("B2")).result.current.techniqueFocus).toBe("deadlift");
    expect((await mount("B1")).result.current.techniqueFocus).toBeNull();
  });
});

describe("accessories and preferences", () => {
  it("offers a preferred accessory on every workout and drops blocked ones", async () => {
    const plain = await mount("A1");
    const day = plain.result.current.accessoryRecommendations;
    expect(day).not.toContain(OFF_DAY);
    plain.unmount();

    await patchSettings({ exercisePreferences: { [OFF_DAY]: "preferred", [day[0]]: "blocked" } });
    const hook = await mount("A1");
    expect(hook.result.current.accessoryRecommendations).toContain(OFF_DAY);
    expect(hook.result.current.accessoryRecommendations).not.toContain(day[0]);
  });

  it("applies location-scoped preferences for the chosen location", async () => {
    await patchSettings({
      defaultLocation: "gym",
      exercisePreferences: {},
      exercisePreferencesByLocation: { home: { [OFF_DAY]: "preferred" } },
    });
    const hook = await mount("A1");
    expect(hook.result.current.accessoryRecommendations).not.toContain(OFF_DAY);
    expect(hook.result.current.exercisePreferences).toEqual({});

    act(() => hook.result.current.setLocation("home"));
    expect(hook.result.current.accessoryRecommendations).toContain(OFF_DAY);
    expect(hook.result.current.exercisePreferences).toEqual({ [OFF_DAY]: "preferred" });
  });
});

describe("home substitutes", () => {
  it("performs the substitute chosen here: the active plan matches the preview", async () => {
    const hook = await mount("B2");
    act(() => hook.result.current.setLocation("home"));
    act(() => hook.result.current.setWarmUps(false));

    const deadlift = hook.result.current.homeAdaptations.find(
      (a) => a.templateExercise.exerciseId === "deadlift"
    )!;
    expect(deadlift.chosenExerciseId).toBe("db_rdl");
    expect(deadlift.adaptation.alternatives.map((a) => a.exercise.id)).toContain(
      "single_leg_db_rdl"
    );

    act(() => hook.result.current.chooseSubstitute("deadlift", "single_leg_db_rdl"));
    const preview = hook.result.current.plan;
    expect(preview[0]).toMatchObject({
      exerciseId: "deadlift",
      substituteExerciseId: "single_leg_db_rdl",
    });

    let sessionId: string | null = null;
    await act(async () => {
      sessionId = await hook.result.current.start();
    });
    const session = (await db.workouts.get(sessionId!))!;
    expect(session).toMatchObject({ templateId: "B2", location: "home", includeWarmUps: false });
    expect(session.modifications).toHaveLength(1);
    expect(session.modifications[0]).toMatchObject({
      exerciseId: "deadlift",
      action: "substitute",
      source: "equipment_limit",
      originalWeight: 220,
      modifiedWeight: preview[0].weight,
    });
    expect(overridesFromSession(session)).toEqual({ deadlift: "single_leg_db_rdl" });

    // The plan the active screen builds from the saved session.
    const active = renderHook(() => useActiveWorkout(sessionId));
    await waitFor(() => expect(active.result.current.status).toBe("active"));
    expect(active.result.current.plan).toEqual(preview);
  });

  it("saves nothing extra for the default substitutes, and the plans still match", async () => {
    const hook = await mount("A1");
    act(() => hook.result.current.setLocation("home"));
    const preview = hook.result.current.plan;
    expect(preview.find((e) => e.exerciseId === "bench" && !e.isWarmUp)).toMatchObject({
      substituteExerciseId: "db_bench",
    });

    let sessionId: string | null = null;
    await act(async () => {
      sessionId = await hook.result.current.start();
    });
    const session = (await db.workouts.get(sessionId!))!;
    expect(session.modifications).toEqual([]);
    const settings = (await db.userProfile.toCollection().first())!.settings;
    expect(
      buildWorkoutPlan({
        template: WORKOUT_TEMPLATES.A1,
        liftStates: await db.liftStates.toArray(),
        location: session.location,
        equipment: settings.equipment,
        includeWarmUps: session.includeWarmUps,
        selectedAccessories: session.selectedAccessories,
        overrides: overridesFromSession(session),
      })
    ).toEqual(preview);
  });

  it("has no adaptations at the gym", async () => {
    const hook = await mount("B2");
    expect(hook.result.current.location).toBe("gym");
    expect(hook.result.current.homeAdaptations).toEqual([]);
  });
});

describe("starting", () => {
  it("creates the session with the chosen options and the readiness log", async () => {
    const hook = await mount("A1");
    const accessory = hook.result.current.accessoryRecommendations[0];
    act(() => hook.result.current.toggleAccessory(accessory));
    act(() => hook.result.current.setSleepHours("5-7"));
    act(() => hook.result.current.setStressLevel("good"));

    let sessionId: string | null = null;
    await act(async () => {
      sessionId = await hook.result.current.start();
    });
    expect(await db.workouts.get(sessionId!)).toMatchObject({
      templateId: "A1",
      location: "gym",
      includeWarmUps: true,
      selectedAccessories: [accessory],
      completedAt: null,
      sets: [],
    });
    expect(await db.readinessLogs.toArray()).toMatchObject([
      { sessionId, sleepHours: "5-7", stressLevel: "good" },
    ]);
    expect(hook.result.current.isStarting).toBe(true);
  });

  it("saves no readiness log when it was not filled in", async () => {
    const hook = await mount("A1");
    await act(async () => {
      await hook.result.current.start();
    });
    expect(await db.readinessLogs.count()).toBe(0);
  });
});

describe("advisories", () => {
  const run = (overrides: Partial<RunLog>): RunLog => ({
    id: "run-1",
    clientId: "c-run-1",
    date: new Date(Date.now() - 2 * HOUR),
    durationMinutes: 50,
    distanceMiles: 6,
    type: "outdoor",
    category: "tempo",
    notes: "",
    perceivedEffort: 5,
    synced: false,
    ...overrides,
  } as RunLog);

  it("warns about a hard recent run before a lower-body day, until dismissed", async () => {
    await db.runs.put(run({}));
    const hook = await mount("A1");
    expect(hook.result.current.runAdvisory).toMatchObject({
      level: "strong",
      evidenceId: "run-interference",
    });
    act(() => hook.result.current.dismissRunAdvisory());
    expect(hook.result.current.runAdvisory).toBeNull();

    // Not before an upper-body day, and not for a run more than a day old.
    expect((await mount("B1")).result.current.runAdvisory).toBeNull();
    await db.runs.put(run({ date: new Date(Date.now() - 30 * HOUR) }));
    expect((await mount("A1")).result.current.runAdvisory).toBeNull();
  });

  it("notes a hard recent activity, until dismissed", async () => {
    await db.activities.put({
      id: "act-1",
      clientId: "c-act-1",
      date: new Date(Date.now() - 3 * HOUR),
      kind: "cycling",
      durationMinutes: 90,
      perceivedEffort: 5,
      notes: "",
      synced: false,
    } as ActivityLog);
    const hook = await mount("A1");
    expect(hook.result.current.activityNote).toMatchObject({ evidenceId: "activity-fatigue" });
    expect(hook.result.current.activityNote!.message).toMatch(/Hard ride 3h ago/);
    act(() => hook.result.current.dismissActivityNote());
    expect(hook.result.current.activityNote).toBeNull();
  });

  it("warns when a lift in the workout was trained in the last 48 hours", async () => {
    await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 20 * HOUR) });
    await db.liftStates.update("bench", { t2LastWorkoutDate: new Date(Date.now() - 80 * HOUR) });
    const hook = await mount("A1");
    expect(hook.result.current.recoveryWarnings).toEqual([
      { exerciseName: "Barbell Squat", hoursAgo: 20 },
    ]);
    act(() => hook.result.current.setRecoveryChoice("reduce"));
    expect(hook.result.current.recoveryChoice).toBe("reduce");
  });

  it("suggests a lower weight after time off; accepting saves it and settles the suggestion", async () => {
    await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 40 * DAY) });
    const hook = await mount("A1");
    const [suggestion] = hook.result.current.decaySuggestions;
    expect(suggestion).toMatchObject({ exerciseId: "squat", tier: "T1", currentWeight: 190 });
    expect(suggestion.suggestedWeight).toBeLessThan(190);

    await act(() =>
      hook.result.current.acceptDecay("squat", "T1", suggestion.suggestedWeight)
    );
    const squat = (await db.liftStates.get("squat"))!;
    expect(squat.t1Weight).toBe(suggestion.suggestedWeight);
    expect(squat.synced).toBe(false);
    await waitFor(() =>
      expect(hook.result.current.plan.find((e) => e.tier === "T1")!.weight).toBe(
        suggestion.suggestedWeight
      )
    );
    expect(hook.result.current.decaySuggestions).toEqual([]);
  });

  it("keeps the weight when a decay suggestion is dismissed", async () => {
    await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 40 * DAY) });
    const hook = await mount("A1");
    act(() => hook.result.current.dismissDecay("squat", "T1"));
    expect(hook.result.current.decaySuggestions).toEqual([]);
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(190);
  });

  it("lists pain entries from the last seven days", async () => {
    await db.painEntries.bulkPut([
      { id: "p1", clientId: "p1", date: new Date(Date.now() - 2 * DAY), region: "lower_back", sensation: "pain", severity: 2, synced: false },
      { id: "p2", clientId: "p2", date: new Date(Date.now() - 9 * DAY), region: "left_knee", sensation: "pain", severity: 3, synced: false },
    ] as never[]);
    const hook = await mount("A1");
    await waitFor(() =>
      expect(hook.result.current.recentPainEntries.map((p) => p.id)).toEqual(["p1"])
    );
  });
});
