import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeSet, makeWorkout, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { favoriteFromSetup, resolveFavorite, type ResolvedFavorite } from "@/lib/favorites";
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

const nav = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
}));

beforeEach(async () => {
  nav.params = "";
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
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

  it("starts at the URL's location without saving it, until the user changes it", async () => {
    nav.params = "location=home";
    const hook = await mount();
    expect(hook.result.current.location).toBe("home");
    expect(describePlan(hook.result.current.plan).some((d) => d.includes("db_") || d.includes("goblet"))).toBe(true);
    expect((await db.userProfile.toCollection().first())!.settings.defaultLocation ?? "gym").toBe("gym");

    act(() => hook.result.current.setLocation("gym"));
    expect(hook.result.current.location).toBe("gym");
    act(() => hook.result.current.setLocation("home"));
    await waitFor(async () =>
      expect((await db.userProfile.toCollection().first())!.settings.defaultLocation).toBe("home")
    );
    expect(hook.result.current.location).toBe("home");
  });

  it("ignores a location in the URL that is not gym or home", async () => {
    nav.params = "location=moon";
    expect((await mount()).result.current.location).toBe("gym");
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

  it("warns when a lift in the workout was trained in the last 48 hours; reduce lowers today's T1", async () => {
    await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 20 * HOUR) });
    await db.liftStates.update("bench", { t2LastWorkoutDate: new Date(Date.now() - 80 * HOUR) });
    const hook = await mount("A1");
    expect(hook.result.current.recoveryWarnings).toEqual([
      { exerciseName: "Barbell Squat", hoursAgo: 20 },
    ]);
    expect(hook.result.current.t1Reduction).toEqual({ exerciseId: "squat", name: "Barbell Squat", from: 190, to: 170 });
    act(() => hook.result.current.setRecoveryChoice("reduce"));
    expect(hook.result.current.recoveryChoice).toBe("reduce");
    // The same plan edit as the run advisory's reduce: the plan the workout will run.
    expect(hook.result.current.edits).toContainEqual({ kind: "weight", exerciseId: "squat", tier: "T1", weight: 170 });
    expect(hook.result.current.plan.find((e) => e.tier === "T1" && !e.isWarmUp)!.weight).toBe(170);
  });

  it("offers no reduction at home when 10% rounds a dumbbell back to the same weight", async () => {
    await patchSettings({ defaultLocation: "home" });
    await db.liftStates.update("ohp", { t1Weight: 45, t1LastWorkoutDate: new Date(Date.now() - 20 * HOUR) });
    const hook = await mount("B1");
    await waitFor(() => expect(hook.result.current.location).toBe("home"));
    const t1 = () => hook.result.current.plan.find((e) => e.tier === "T1" && !e.isWarmUp)!;
    // 20 lb dumbbells: 18 rounds back to 20.
    expect(t1()).toMatchObject({ substituteExerciseId: "db_shoulder_press", weight: 20 });
    expect(hook.result.current.t1Reduction).toBeNull();
    act(() => hook.result.current.setRecoveryChoice("reduce"));
    expect(hook.result.current.recoveryChoice).toBeNull();
    expect(hook.result.current.edits).toEqual([]);
    expect(t1().weight).toBe(20);
  });

  it("at home, reduce lowers a dumbbell by the dumbbell increment and says so", async () => {
    await patchSettings({ defaultLocation: "home" });
    await db.liftStates.update("ohp", { t1LastWorkoutDate: new Date(Date.now() - 20 * HOUR) });
    const hook = await mount("B1");
    await waitFor(() => expect(hook.result.current.location).toBe("home"));
    // The home weight comes from the strength model; the reduction is one dumbbell step below it.
    const from = hook.result.current.plan.find((e) => e.tier === "T1" && !e.isWarmUp)!.weight;
    expect(hook.result.current.t1Reduction).toEqual({ exerciseId: "ohp", name: "DB Shoulder Press", from, to: from - 5 });
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
    // The reduction is a dated "decay" adjustment in the log; the lift state is rebuilt from it.
    const decays = (await db.liftAdjustments.toArray()).filter((a) => a.source === "decay");
    expect(decays).toHaveLength(1);
    expect(decays[0]).toMatchObject({
      exerciseId: "squat",
      set: { t1Weight: suggestion.suggestedWeight },
      deletedAt: null,
      synced: false,
    });
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

  describe("records the choice in the adjustment log", () => {
    const events = () => db.coachEvents.toArray();
    const settle = () => new Promise((r) => setTimeout(r, 30));
    async function start(hook: Awaited<ReturnType<typeof mount>>) {
      let id: string | null = null;
      await act(async () => {
        id = await hook.result.current.start();
      });
      return id as unknown as string;
    }

    it("carrying on past a run advisory is a dismissal with the run rule, written at START", async () => {
      await db.runs.put(run({}));
      const hook = await mount("A1");
      act(() => hook.result.current.chooseRunOption("proceed"));
      expect(hook.result.current.runAdvisory).toBeNull();
      await settle();
      expect(await events()).toHaveLength(0);

      const sessionId = await start(hook);
      await waitFor(async () => expect(await events()).toHaveLength(1));
      expect((await events())[0]).toMatchObject({
        kind: "advisoryDismissed",
        ruleId: "run-interference",
        data: { advisory: "run", choice: "proceed", sessionId },
      });
    });

    it("a choice for a workout that never starts is never logged", async () => {
      await db.runs.put(run({ perceivedEffort: 4, date: new Date(Date.now() - 10 * HOUR) }));
      const hook = await mount("A1");
      act(() => hook.result.current.chooseRunOption("reduce_10"));
      hook.unmount();
      await settle();
      expect(await events()).toHaveLength(0);
    });

    it("extra warm-ups turns warm-ups on; reduce lowers the T1 weight 10% for today", async () => {
      await patchSettings({ showWarmUps: false });
      await db.runs.put(run({ perceivedEffort: 4, date: new Date(Date.now() - 10 * HOUR) }));
      let hook = await mount("A1");
      expect(hook.result.current.runAdvisory).toMatchObject({ level: "advisory" });
      act(() => hook.result.current.chooseRunOption("extra_warmups"));
      expect(hook.result.current.warmUps).toBe(true);
      const first = await start(hook);
      await waitFor(async () => expect(await events()).toHaveLength(1));
      expect((await events())[0]).toMatchObject({
        kind: "advisoryAccepted",
        ruleId: "run-interference",
        data: { choice: "extra_warmups", sessionId: first },
      });

      hook = await mount("A1");
      act(() => hook.result.current.chooseRunOption("reduce_10"));
      const t1 = hook.result.current.plan.find((e) => e.tier === "T1" && !e.isWarmUp)!;
      expect(t1.weight).toBe(170); // 190 x 0.9 = 171, to the nearest 5
      expect(hook.result.current.edits).toContainEqual({ kind: "weight", exerciseId: "squat", tier: "T1", weight: 170 });
      const second = await start(hook);
      await waitFor(async () => expect(await events()).toHaveLength(2));
      expect((await events()).find((e) => e.data?.choice === "reduce_10")).toMatchObject({
        kind: "advisoryAccepted",
        title: "Run before lifting: Barbell Squat lowered from 190 to 170 lbs for today",
        data: { from: 190, to: 170, sessionId: second },
      });
    });

    it("a reduction undone before START is not logged", async () => {
      await db.runs.put(run({ perceivedEffort: 4, date: new Date(Date.now() - 10 * HOUR) }));
      const hook = await mount("A1");
      act(() => hook.result.current.chooseRunOption("reduce_10"));
      act(() => hook.result.current.resetEdits());
      await start(hook);
      await settle();
      expect(await events()).toHaveLength(0);
    });

    it("trained recently: reduce is logged at START with the recovery rule", async () => {
      await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 20 * HOUR) });
      const hook = await mount("A1");
      act(() => hook.result.current.setRecoveryChoice("reduce"));
      const sessionId = await start(hook);
      await waitFor(async () => expect(await events()).toHaveLength(1));
      expect((await events())[0]).toMatchObject({
        kind: "advisoryAccepted",
        ruleId: "recovery-windows",
        title: "Trained recently: Barbell Squat lowered from 190 to 170 lbs for today",
        data: { advisory: "recovery", choice: "reduce", from: 190, to: 170, sessionId },
      });
      const session = (await db.workouts.get(sessionId))!;
      expect(session.planEdits).toContainEqual({ kind: "weight", exerciseId: "squat", tier: "T1", weight: 170 });
    });

    it("dismissing the activity note or a time-off suggestion is recorded with its rule", async () => {
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
      await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 40 * DAY) });
      const hook = await mount("A1");
      act(() => hook.result.current.dismissActivityNote());
      act(() => hook.result.current.dismissDecay("squat", "T1"));
      await settle();
      expect(await events()).toHaveLength(0);
      await start(hook);
      await waitFor(async () => expect(await events()).toHaveLength(2));
      const rules = (await events()).map((e) => [e.kind, e.ruleId]).sort();
      expect(rules).toEqual([
        ["advisoryDismissed", "activity-fatigue"],
        ["advisoryDismissed", "time-off"],
      ]);
    });

    it("accepting a time-off suggestion is logged once, as its lift adjustment", async () => {
      await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 40 * DAY) });
      const hook = await mount("A1");
      const [suggestion] = hook.result.current.decaySuggestions;
      await act(() => hook.result.current.acceptDecay("squat", "T1", suggestion.suggestedWeight));
      expect(await events()).toHaveLength(0);
    });

    it("a failure to record never blocks the choice or the start", async () => {
      await db.runs.put(run({}));
      const add = vi.spyOn(db.coachEvents, "add").mockRejectedValueOnce(new Error("disk full"));
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const hook = await mount("A1");
      act(() => hook.result.current.chooseRunOption("proceed"));
      expect(hook.result.current.runAdvisory).toBeNull();
      expect(await start(hook)).toEqual(expect.any(String));
      await waitFor(() => expect(error).toHaveBeenCalled());
      add.mockRestore();
      error.mockRestore();
    });
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

describe("editing the workout", () => {
  const entry = (hook: Awaited<ReturnType<typeof mount>>, exerciseId: string, tier: string) =>
    hook.result.current.plan.find((e) => !e.isWarmUp && e.exerciseId === exerciseId && e.tier === tier);

  it("changes the plan with a scheme and a weight edit and says the lift is logged only", async () => {
    const hook = await mount("A1");
    expect(hook.result.current.edits).toEqual([]);
    expect(hook.result.current.impact).toEqual([]);
    const prescribedBench = hook.result.current.prescribed.find((p) => p.exerciseId === "bench")!;

    act(() => hook.result.current.setScheme("bench", "T2", 4, 8));
    expect(entry(hook, "bench", "T2")).toMatchObject({ targetSets: 4, targetReps: 8 });
    act(() => hook.result.current.setWeight("bench", "T2", prescribedBench.weight + 10));
    expect(entry(hook, "bench", "T2")?.weight).toBe(prescribedBench.weight + 10);
    expect(hook.result.current.impact).toContainEqual({
      exerciseId: "bench",
      tier: "T2",
      status: "logged-only",
      edited: true,
    });
    expect(hook.result.current.impact).toContainEqual({
      exerciseId: "squat",
      tier: "T1",
      status: "program",
      edited: false,
    });
  });

  it("counts a lift whose weight edit stays at the prescription", async () => {
    const hook = await mount("A1");
    const bench = hook.result.current.prescribed.find((p) => p.exerciseId === "bench")!;
    act(() => hook.result.current.setWeight("bench", "T2", bench.weight));
    expect(hook.result.current.impact).toContainEqual(
      expect.objectContaining({ exerciseId: "bench", status: "program", edited: true })
    );
  });

  it("swaps a lift: the replacement is logged only and the original is not done today", async () => {
    const hook = await mount("A1");
    act(() => hook.result.current.swapExercise("lat_pulldown", "T3", "face_pulls"));
    expect(entry(hook, "lat_pulldown", "T3")).toBeUndefined();
    expect(entry(hook, "face_pulls", "T3")).toBeDefined();
    expect(hook.result.current.impact).toContainEqual(
      expect.objectContaining({ exerciseId: "face_pulls", tier: "T3", status: "logged-only" })
    );
    expect(hook.result.current.impact).toContainEqual(
      expect.objectContaining({ exerciseId: "lat_pulldown", tier: "T3", status: "not-done" })
    );
  });

  it("removes a lift and adds an accessory", async () => {
    const hook = await mount("A1");
    act(() => hook.result.current.removeExercise("bench", "T2"));
    expect(describePlan(hook.result.current.plan.filter((e) => !e.isWarmUp))).toEqual([
      "T1:squat",
      "T3:lat_pulldown",
    ]);
    expect(hook.result.current.impact).toContainEqual(
      expect.objectContaining({ exerciseId: "bench", status: "not-done" })
    );

    act(() =>
      hook.result.current.addExercise("face_pulls", { sets: 3, reps: 12, weight: 30, isAMRAP: false })
    );
    expect(hook.result.current.plan.at(-1)).toMatchObject({
      exerciseId: "face_pulls",
      tier: "accessory",
      targetSets: 3,
      targetReps: 12,
      weight: 30,
    });
    act(() => hook.result.current.removeExercise("face_pulls", "accessory"));
    expect(hook.result.current.edits).toEqual([{ kind: "remove", exerciseId: "bench", tier: "T2" }]);
  });

  it("resets to the program", async () => {
    const hook = await mount("A1");
    act(() => hook.result.current.removeExercise("bench", "T2"));
    act(() => hook.result.current.resetEdits());
    expect(hook.result.current.edits).toEqual([]);
    expect(entry(hook, "bench", "T2")).toBeDefined();
  });

  it("clears edits when the day changes", async () => {
    const hook = await mount("A1");
    act(() => hook.result.current.removeExercise("bench", "T2"));
    act(() => hook.result.current.setTemplateId("B1"));
    expect(hook.result.current.templateId).toBe("B1");
    expect(hook.result.current.edits).toEqual([]);
    expect(hook.result.current.plan.some((e) => e.exerciseId === "ohp")).toBe(true);
  });
});

describe("next-session set plans (E6)", () => {
  const SETS = [
    { weight: 185, reps: 3 },
    { weight: 195, reps: 3 },
    { weight: 205, reps: 3 },
  ];
  const squatPlan = {
    exerciseId: "squat",
    liftId: "squat",
    tier: "T1" as const,
    sets: SETS,
    planSets: [], // taken as current (see isSetPlanCurrent)
    createdAt: "2026-11-17T09:00:00.000Z",
  };
  const squat = (hook: Awaited<ReturnType<typeof mount>>) =>
    hook.result.current.plan.find((e) => !e.isWarmUp && e.exerciseId === "squat" && e.tier === "T1")!;

  beforeEach(() => patchSettings({ nextSetPlans: { "squat|T1": squatPlan }, showWarmUps: false }));

  it("shows the plan with the set plan's sets on Ready and in Edit workout, without counting as the user's edit", async () => {
    const hook = await mount("A1");
    expect(squat(hook).perSet).toEqual(SETS);
    expect(squat(hook).weight).toBe(205);
    expect(hook.result.current.edits).toEqual([]);
    expect(hook.result.current.nextSetPlanEdits).toEqual([
      { kind: "setWeights", exerciseId: "squat", tier: "T1", sets: SETS },
    ]);
    // The impact line says the lift is changed from the program.
    expect(hook.result.current.impact).toContainEqual(
      expect.objectContaining({ exerciseId: "squat", tier: "T1", edited: true })
    );
  });

  it("lets the user's own per-set weights win, and clearing them goes back to the program", async () => {
    const hook = await mount("A1");
    const mine = [{ weight: 200, reps: 3 }, { weight: 200, reps: 3 }];
    act(() => hook.result.current.setSetWeights("squat", "T1", mine));
    expect(squat(hook).perSet).toEqual(mine);
    act(() => hook.result.current.setSetWeights("squat", "T1", null));
    expect(squat(hook).perSet).toBeUndefined();
    expect(hook.result.current.nextSetPlanEdits).toEqual([]);
    // Reset puts the set plan back.
    act(() => hook.result.current.resetEdits());
    expect(squat(hook).perSet).toEqual(SETS);
  });

  it("saves the set plan's edits in the session's planEdits, ahead of the user's, so the active workout plans the same sets", async () => {
    const hook = await mount("A1");
    act(() => hook.result.current.setWeight("bench", "T2", 120));
    const preview = hook.result.current.plan;
    let sessionId: string | null = null;
    await act(async () => {
      sessionId = await hook.result.current.start();
    });
    const session = (await db.workouts.get(sessionId!))!;
    expect(session.planEdits).toEqual([
      { kind: "setWeights", exerciseId: "squat", tier: "T1", sets: SETS },
      { kind: "weight", exerciseId: "bench", tier: "T2", weight: 120 },
    ]);
    const active = renderHook(() => useActiveWorkout(sessionId));
    await waitFor(() => expect(active.result.current.status).toBe("active"));
    expect(active.result.current.plan).toEqual(preview);
    // Starting does not use the plan up: finishing does.
    expect((await db.userProfile.toCollection().first())!.settings.nextSetPlans).toHaveProperty("squat|T1");
  });

  it("does not apply on a day without that exercise at that tier", async () => {
    const hook = await mount("B1");
    expect(hook.result.current.plan.some((e) => e.perSet)).toBe(false);
    expect(hook.result.current.nextSetPlanEdits).toEqual([]);
  });
});

describe("choosing the day", () => {
  it("overrides the URL and exposes the due day from the rotation", async () => {
    const hook = await mount("B2");
    expect(hook.result.current.templateId).toBe("B2");
    expect(hook.result.current.dueTemplateId).toBe("A1");
    act(() => hook.result.current.setTemplateId("A2"));
    expect(hook.result.current.templateId).toBe("A2");
    expect(hook.result.current.dueTemplateId).toBe("A1");
  });

  it("ignores an unknown day", async () => {
    const hook = await mount("A1");
    act(() => hook.result.current.setTemplateId("nonsense"));
    expect(hook.result.current.templateId).toBe("A1");
  });
});

describe("starting from a favourite", () => {
  const favorite: ResolvedFavorite = {
    favoriteId: "fav-1",
    templateId: "B1",
    location: "gym",
    includeWarmUps: false,
    selectedAccessories: ["face_pulls"],
    overrides: {},
    planEdits: [
      { kind: "swap", exerciseId: "db_row", tier: "T3", replacementId: "bicep_curls" },
      { kind: "weight", exerciseId: "bicep_curls", tier: "T3", weight: 25 },
    ],
  };

  it("fills in the day, the choices and the edits, and they can still be changed", async () => {
    const hook = renderHook(() => useWorkoutSetup(null, favorite));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    expect(hook.result.current.templateId).toBe("B1");
    expect(hook.result.current.favoriteId).toBe("fav-1");
    expect(hook.result.current.warmUps).toBe(false);
    expect(hook.result.current.selectedAccessories).toEqual(["face_pulls"]);
    expect(hook.result.current.edits).toEqual(favorite.planEdits);
    expect(describePlan(hook.result.current.plan)).toEqual([
      "T1:ohp",
      "T2:deadlift",
      "T3:bicep_curls",
      "accessory:face_pulls",
    ]);
    expect(hook.result.current.plan.find((e) => e.exerciseId === "bicep_curls")!.weight).toBe(25);

    act(() => hook.result.current.setWarmUps(true));
    act(() => hook.result.current.resetEdits());
    expect(hook.result.current.warmUps).toBe(true);
    expect(hook.result.current.edits).toEqual([]);
  });

  it("takes the favourite's location as the training location", async () => {
    await patchSettings({ defaultLocation: "home" });
    const hook = renderHook(() => useWorkoutSetup(null, favorite));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await waitFor(() => expect(hook.result.current.location).toBe("gym"));
  });

  it("a favourite saved at home, applied at the gym, pins no dumbbell weight on the barbell and says so", async () => {
    // Saved at home, exactly as planned there.
    const atHome = await mount("A1");
    act(() => atHome.result.current.setLocation("home"));
    const homePlan = atHome.result.current.plan;
    const gymWeight = atHome.result.current.prescribed.find((p) => p.exerciseId === "squat")!.weight;
    const homeSquat = homePlan.find((e) => e.exerciseId === "squat" && !e.isWarmUp)!;
    expect(homeSquat.weight).not.toBe(gymWeight);
    const saved = favoriteFromSetup(
      { id: "fav-home", clientId: "fav-home", name: "Home legs", now: new Date() },
      {
        templateId: "A1",
        location: "home",
        includeWarmUps: atHome.result.current.warmUps,
        selectedAccessories: [],
        substitutes: {},
        edits: [],
        plan: homePlan,
      }
    );
    atHome.unmount();
    const resolved = resolveFavorite(saved, "as-saved");

    const hook = renderHook(() => useWorkoutSetup(null, resolved));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await waitFor(() => expect(hook.result.current.location).toBe("home"));
    expect(hook.result.current.favoriteNote).toBeNull();
    const squat = () => hook.result.current.plan.find((e) => e.exerciseId === "squat" && !e.isWarmUp)!;
    expect(squat().weight).toBe(homeSquat.weight);

    act(() => hook.result.current.setLocation("gym"));
    expect(squat()).toMatchObject({ weight: gymWeight });
    expect(squat().substituteExerciseId).toBeUndefined();
    expect(hook.result.current.edits).not.toContainEqual(
      expect.objectContaining({ kind: "weight", exerciseId: "squat", tier: "T1" })
    );
    expect(hook.result.current.favoriteNote).toBe(
      "Saved at home: the gym uses today's program weights for Squat, Bench Press and Lat Pulldown."
    );

    let sessionId: string | null = null;
    await act(async () => {
      sessionId = await hook.result.current.start();
    });
    const session = (await db.workouts.get(sessionId!))!;
    expect(session.location).toBe("gym");
    expect(session.planEdits ?? []).toEqual(hook.result.current.edits);
    expect(session.planEdits ?? []).not.toContainEqual(
      expect.objectContaining({ kind: "weight", exerciseId: "squat", tier: "T1" })
    );
  });

  it("re-evaluates the pins when the location changes back", async () => {
    const atHome = await mount("A1");
    act(() => atHome.result.current.setLocation("home"));
    const homePlan = atHome.result.current.plan;
    const saved = favoriteFromSetup(
      { id: "fav-home", clientId: "fav-home", name: "Home legs", now: new Date() },
      { templateId: "A1", location: "home", includeWarmUps: true, selectedAccessories: [], substitutes: {}, edits: [], plan: homePlan }
    );
    atHome.unmount();
    const resolved = resolveFavorite(saved, "as-saved");
    const hook = renderHook(() => useWorkoutSetup(null, resolved));
    await waitFor(() => expect(hook.result.current.location).toBe("home"));
    act(() => hook.result.current.setLocation("gym"));
    expect(hook.result.current.favoriteNote).not.toBeNull();
    act(() => hook.result.current.setLocation("home"));
    expect(hook.result.current.favoriteNote).toBeNull();
    expect(hook.result.current.edits).toEqual(resolved.planEdits);
  });
});

describe("weights for exercises the program does not prescribe", () => {
  it("start a swapped-in or added exercise at the last weight logged for it", async () => {
    await db.workouts.put(
      makeWorkout({
        startedAt: new Date(Date.now() - 3 * DAY),
        completedAt: new Date(Date.now() - 3 * DAY + HOUR),
        sets: [
          makeSet({ exerciseId: "face_pulls", tier: "accessory", weight: 35 }),
          makeSet({ exerciseId: "bicep_curls", tier: "accessory", weight: 22.5 }),
        ],
      })
    );
    const hook = await mount("B1");
    await waitFor(() => expect(hook.result.current.lastWeights.face_pulls).toBe(35));

    act(() => hook.result.current.swapExercise("db_row", "T3", "face_pulls"));
    act(() =>
      hook.result.current.addExercise("bicep_curls", { sets: 3, reps: 12, weight: 10, isAMRAP: false })
    );
    const weightOf = (id: string) => hook.result.current.plan.find((e) => e.exerciseId === id)!.weight;
    expect(weightOf("face_pulls")).toBe(35);
    expect(weightOf("bicep_curls")).toBe(22.5);
  });
});

describe("sleep from Apple Health", () => {
  async function seedLastNight(sleepMinutes: number) {
    const { dailyRowId, foldDaily, localDateKey } = await import("@/lib/health/daily");
    const day = localDateKey(new Date());
    const [values] = foldDaily([], [
      { day, asleepMinutes: sleepMinutes, deepMinutes: null, remMinutes: null, start: new Date(), end: new Date() },
    ]);
    await db.healthDaily.put({
      ...values,
      id: dailyRowId(day),
      clientId: dailyRowId(day),
      updatedAt: 1,
      deletedAt: null,
      synced: false,
    });
  }

  it("has no answer selected when there is no sleep data", async () => {
    const hook = await mount("A1");
    expect(hook.result.current.sleepHours).toBeNull();
    expect(hook.result.current.healthSleepMinutes).toBeNull();
  });

  it("selects the matching answer and saves where it came from", async () => {
    await seedLastNight(432);
    const hook = await mount("A1");
    await waitFor(() => expect(hook.result.current.sleepHours).toBe("7+"));
    expect(hook.result.current.healthSleepMinutes).toBe(432);

    act(() => hook.result.current.setStressLevel("normal"));
    let sessionId: string | null = null;
    await act(async () => {
      sessionId = await hook.result.current.start();
    });
    const log = await db.readinessLogs.where("sessionId").equals(sessionId!).first();
    expect(log).toMatchObject({
      sleepHours: "7+",
      stressLevel: "normal",
      sleepMinutes: 432,
      sleepSource: "apple_health",
    });
  });

  it("lets the user's own answer win, and then records no source", async () => {
    await seedLastNight(432);
    const hook = await mount("A1");
    await waitFor(() => expect(hook.result.current.sleepHours).toBe("7+"));
    act(() => {
      hook.result.current.setSleepHours("<5");
      hook.result.current.setStressLevel("low");
    });
    expect(hook.result.current.sleepHours).toBe("<5");

    let sessionId: string | null = null;
    await act(async () => {
      sessionId = await hook.result.current.start();
    });
    const log = await db.readinessLogs.where("sessionId").equals(sessionId!).first();
    expect(log?.sleepHours).toBe("<5");
    expect(log?.sleepMinutes).toBeUndefined();
    expect(log?.sleepSource).toBeUndefined();
  });
});
