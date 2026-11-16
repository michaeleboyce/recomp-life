import { describe, it, expect } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { buildWorkoutPlan, substituteModification } from "@/lib/workout/buildPlan";
import { applyPlanEdits, snapshotOfPlan } from "@/lib/workout/planEdits";
import { EQUIPMENT, makeSession, makeSets, seedLiftStates } from "@/lib/workout/testFixtures";
import type { FavoriteWorkout, LiftState, PlanEdit } from "@/types";
import {
  cleanFavoriteName,
  FAVORITE_NAME_MAX_LENGTH,
  favoriteEditsAt,
  favoriteForSession,
  favoriteFromSession,
  favoriteFromSetup,
  favoritePinNote,
  lastLoggedWeights,
  listFavorites,
  resolveFavorite,
} from "./favorites";

const NOW = new Date("2026-11-12T10:00:00Z");
const identity = (name = "Heavy legs") => ({ id: "fav-1", clientId: "fav-client-1", name, now: NOW });

const EDITS: PlanEdit[] = [
  { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" },
  { kind: "weight", exerciseId: "incline_db_press", tier: "T2", weight: 45 },
  { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 4, reps: 8 },
  { kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 12, weight: 20, isAMRAP: false },
];

function planFor(liftStates: LiftState[], edits: PlanEdit[]) {
  const base = buildWorkoutPlan({
    template: WORKOUT_TEMPLATES.A1,
    liftStates,
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: false,
    selectedAccessories: ["face_pulls"],
  });
  return applyPlanEdits(base, edits);
}

function savedFavorite(): FavoriteWorkout {
  return favoriteFromSetup(identity(), {
    templateId: "A1",
    location: "gym",
    includeWarmUps: false,
    selectedAccessories: ["face_pulls"],
    substitutes: {},
    edits: EDITS,
    plan: planFor(seedLiftStates(), EDITS),
  });
}

describe("cleanFavoriteName", () => {
  it("trims, collapses spaces, limits the length and falls back when empty", () => {
    expect(cleanFavoriteName("  Heavy   legs ", "x")).toBe("Heavy legs");
    expect(cleanFavoriteName("   ", "Workout A1")).toBe("Workout A1");
    expect(cleanFavoriteName("a".repeat(100), "x")).toHaveLength(FAVORITE_NAME_MAX_LENGTH);
  });
});

describe("favoriteFromSetup", () => {
  it("stores the choices, the structural edits and a frozen copy of the plan", () => {
    const favorite = savedFavorite();
    expect(favorite).toMatchObject({
      id: "fav-1",
      clientId: "fav-client-1",
      name: "Heavy legs",
      templateId: "A1",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: ["face_pulls"],
      substitutes: {},
      createdAt: NOW,
      updatedAt: NOW.getTime(),
      deletedAt: null,
      synced: false,
    });
    expect(favorite.edits.map((e) => e.kind)).toEqual(["swap", "add"]);
    expect(favorite.snapshot).toEqual(snapshotOfPlan(planFor(seedLiftStates(), EDITS)));
  });

  it("names an unnamed favourite after its day", () => {
    const favorite = favoriteFromSetup(identity("  "), {
      templateId: "B2",
      location: "home",
      includeWarmUps: true,
      selectedAccessories: [],
      substitutes: {},
      edits: [],
      plan: [],
    });
    expect(favorite.name).toBe("Workout B2");
  });
});

describe("favoriteFromSession", () => {
  it("takes the choices, substitutes, edits and logged sets from a finished session", () => {
    const session = makeSession({
      id: "session-9",
      location: "home",
      includeWarmUps: true,
      selectedAccessories: ["face_pulls"],
      modifications: [substituteModification("bench", "db_floor_press", 100, 40)],
      planEdits: EDITS,
      sets: [
        ...makeSets("squat", "warmup", 1, 5, { weight: 95 }),
        ...makeSets("squat", "T1", 4, 8, { weight: 150 }),
        ...makeSets("incline_db_press", "T2", 3, 10, { weight: 45 }),
      ],
    });
    const favorite = favoriteFromSession(identity("Home day"), session);
    expect(favorite).toMatchObject({
      name: "Home day",
      templateId: "A1",
      location: "home",
      includeWarmUps: true,
      selectedAccessories: ["face_pulls"],
      substitutes: { bench: "db_floor_press" },
      sourceSessionId: "session-9",
    });
    expect(favorite.edits.map((e) => e.kind)).toEqual(["swap", "add"]);
    expect(favorite.snapshot).toEqual([
      { exerciseId: "squat", tier: "T1", sets: 4, reps: 8, weight: 150, isAMRAP: false },
      { exerciseId: "incline_db_press", tier: "T2", sets: 3, reps: 10, weight: 45, isAMRAP: false },
    ]);
  });
});

describe("resolveFavorite", () => {
  const progressed = () =>
    seedLiftStates().map((ls) => ({ ...ls, t1Weight: ls.t1Weight + 10, t2Weight: ls.t2Weight + 5 }));

  it("as saved: reproduces the frozen copy after the lifts have progressed", () => {
    const favorite = savedFavorite();
    const resolved = resolveFavorite(favorite, "as-saved");
    expect(resolved).toMatchObject({
      favoriteId: "fav-1",
      templateId: "A1",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: ["face_pulls"],
      overrides: {},
    });
    expect(snapshotOfPlan(planFor(progressed(), resolved.planEdits))).toEqual(favorite.snapshot);
  });

  it("current: program lifts take today's prescription, brought-in exercises keep their scheme", () => {
    const favorite = savedFavorite();
    const resolved = resolveFavorite(favorite, "current");
    const plan = planFor(progressed(), resolved.planEdits);

    // The squat scheme change was by mood: today's weights means today's program.
    expect(plan.find((e) => e.exerciseId === "squat")).toMatchObject({
      targetSets: 5,
      targetReps: 3,
      weight: 200,
    });
    expect(plan.find((e) => e.exerciseId === "incline_db_press")).toMatchObject({
      tier: "T2",
      targetSets: 3,
      targetReps: 10,
      weight: 45,
    });
    expect(plan.find((e) => e.exerciseId === "bicep_curls")).toMatchObject({
      targetSets: 3,
      targetReps: 12,
      weight: 20,
    });
    expect(plan.some((e) => e.exerciseId === "bench")).toBe(false);
  });

  it("current: brought-in exercises use the last weight logged for them", () => {
    const resolved = resolveFavorite(savedFavorite(), "current", {
      incline_db_press: 50,
      squat: 999,
    });
    const plan = planFor(progressed(), resolved.planEdits);
    expect(plan.find((e) => e.exerciseId === "incline_db_press")!.weight).toBe(50);
    expect(plan.find((e) => e.exerciseId === "bicep_curls")!.weight).toBe(20);
    expect(plan.find((e) => e.exerciseId === "squat")!.weight).toBe(200);
  });

  it("does not hand out the favourite's own arrays", () => {
    const favorite = savedFavorite();
    const resolved = resolveFavorite(favorite, "current");
    resolved.selectedAccessories.push("x");
    resolved.overrides.bench = "db_bench";
    expect(favorite.selectedAccessories).toEqual(["face_pulls"]);
    expect(favorite.substitutes).toEqual({});
  });
});

describe("favourites across locations", () => {
  const homePlan = (liftStates = seedLiftStates(), edits: PlanEdit[] = []) =>
    applyPlanEdits(
      buildWorkoutPlan({
        template: WORKOUT_TEMPLATES.A1,
        liftStates,
        location: "home",
        equipment: EQUIPMENT,
        includeWarmUps: false,
        selectedAccessories: [],
      }),
      edits
    );
  const gymPlan = (edits: PlanEdit[] = []) =>
    applyPlanEdits(
      buildWorkoutPlan({
        template: WORKOUT_TEMPLATES.A1,
        liftStates: seedLiftStates(),
        location: "gym",
        equipment: EQUIPMENT,
        includeWarmUps: false,
        selectedAccessories: [],
      }),
      edits
    );
  const savedAt = (location: "gym" | "home") =>
    favoriteFromSetup(identity(), {
      templateId: "A1",
      location,
      includeWarmUps: false,
      selectedAccessories: [],
      substitutes: {},
      edits: [],
      plan: location === "home" ? homePlan() : gymPlan(),
    });

  it("a favourite saved at home pins each home weight to its home exercise", () => {
    const favorite = savedAt("home");
    const squat = favorite.snapshot.find((e) => e.exerciseId === "squat")!;
    expect(squat.performedAs).toBe(homePlan().find((e) => e.exerciseId === "squat")!.substituteExerciseId);
    const resolved = resolveFavorite(favorite, "as-saved");
    // Replayed as saved, the same home exercises are asked for.
    expect(resolved.overrides.squat).toBe(squat.performedAs);
    const { edits, dropped } = favoriteEditsAt(resolved, "home", resolved.planEdits, homePlan());
    expect(dropped).toEqual([]);
    expect(edits).toEqual(resolved.planEdits);
    expect(snapshotOfPlan(homePlan(seedLiftStates(), edits))).toEqual(favorite.snapshot);
  });

  it("replayed at the gym, a home favourite does not pin its dumbbell weights on the barbell", () => {
    const favorite = savedAt("home");
    const resolved = resolveFavorite(favorite, "as-saved");
    const { edits, dropped } = favoriteEditsAt(resolved, "gym", resolved.planEdits);
    const gym = gymPlan(edits);
    const program = gymPlan();
    for (const id of ["squat", "bench", "lat_pulldown"]) {
      expect(gym.find((e) => e.exerciseId === id)!.weight).toBe(program.find((e) => e.exerciseId === id)!.weight);
    }
    expect(dropped.map((d) => d.exerciseId)).toEqual(["squat", "bench", "lat_pulldown"]);
    expect(favoritePinNote(dropped, "gym")).toBe(
      "Saved at home: the gym uses today's program weights for Squat, Bench Press and Lat Pulldown."
    );
  });

  it("replayed at home, a gym favourite does not pin barbell weights on the home exercises", () => {
    const favorite = savedAt("gym");
    const resolved = resolveFavorite(favorite, "as-saved");
    const { edits, dropped } = favoriteEditsAt(resolved, "home", resolved.planEdits);
    expect(homePlan(seedLiftStates(), edits).find((e) => e.exerciseId === "squat")!.weight).toBe(
      homePlan().find((e) => e.exerciseId === "squat")!.weight
    );
    expect(dropped.map((d) => d.exerciseId)).toContain("squat");
    expect(favoritePinNote(dropped, "home")).toMatch(/^Saved at the gym: at home each lift uses its home exercise's own weight for Squat/);
  });

  it("at home, drops a weight saved for a different home exercise than the one planned", () => {
    const favorite = savedAt("home");
    const resolved = resolveFavorite(
      { ...favorite, snapshot: favorite.snapshot.map((e) => (e.exerciseId === "squat" ? { ...e, performedAs: "db_lunge" } : e)) },
      "as-saved"
    );
    const plan = homePlan();
    const { dropped } = favoriteEditsAt(resolved, "home", resolved.planEdits, plan);
    expect(dropped).toEqual([{ exerciseId: "squat", tier: "T1", performedAs: "db_lunge", reason: "otherExercise" }]);
    expect(favoritePinNote(dropped, "home")).toBe(
      "The saved weight for Squat was for DB Lunge, so today's plan weight is used."
    );
  });

  it("keeps the user's own edits and structural edits whatever the location", () => {
    const favorite = savedAt("home");
    const resolved = resolveFavorite({ ...favorite, edits: [EDITS[0], EDITS[3]] }, "as-saved");
    const mine: PlanEdit = { kind: "weight", exerciseId: "bicep_curls", tier: "accessory", weight: 25 };
    const { edits } = favoriteEditsAt(resolved, "gym", [...resolved.planEdits, mine]);
    expect(edits).toContainEqual(EDITS[0]);
    expect(edits).toContainEqual(EDITS[3]);
    expect(edits).toContainEqual(mine);
    expect(favoritePinNote([], "gym")).toBeNull();
  });
});

describe("listing", () => {
  const make = (overrides: Partial<FavoriteWorkout>): FavoriteWorkout => ({
    ...savedFavorite(),
    ...overrides,
  });

  it("listFavorites hides deleted ones and sorts by last used, then created", () => {
    const list = listFavorites([
      make({ id: "old", createdAt: new Date("2026-11-01") }),
      make({ id: "gone", deletedAt: 5 }),
      make({ id: "used", createdAt: new Date("2026-10-01"), lastUsedAt: new Date("2026-11-10") }),
      make({ id: "new", createdAt: new Date("2026-11-05") }),
    ]);
    expect(list.map((f) => f.id)).toEqual(["used", "new", "old"]);
  });

  it("favoriteForSession finds the live favourite saved from a session", () => {
    const favorites = [
      make({ id: "a", sourceSessionId: "s1", deletedAt: 5 }),
      make({ id: "b", sourceSessionId: "s1" }),
      make({ id: "c", sourceSessionId: "s2" }),
    ];
    expect(favoriteForSession(favorites, "s1")?.id).toBe("b");
    expect(favoriteForSession(favorites, "s3")).toBeUndefined();
  });
});

describe("lastLoggedWeights", () => {
  it("takes the latest weight per performed exercise, without warm-ups", () => {
    const older = makeSession({
      startedAt: new Date("2026-11-01T09:00:00Z"),
      sets: [
        ...makeSets("squat", "T1", 2, 3, { weight: 180 }),
        ...makeSets("incline_db_press", "T2", 1, 10, { weight: 40 }),
      ],
    });
    const newer = makeSession({
      startedAt: new Date("2026-11-05T09:00:00Z"),
      sets: [
        ...makeSets("squat", "warmup", 1, 5, { weight: 95 }),
        ...makeSets("squat", "T1", 2, 3, { weight: 190 }),
        ...makeSets("bench", "T2", 1, 10, {
          weight: 35,
          originalWeight: 100,
          isSubstituted: true,
          substituteExerciseId: "db_bench",
        }),
      ],
    });
    expect(lastLoggedWeights([newer, older])).toEqual({
      squat: 190,
      incline_db_press: 40,
      db_bench: 35,
    });
    expect(lastLoggedWeights([])).toEqual({});
  });

  it("ignores drop, ramp and back-off sets: the last working set's weight", () => {
    const session = makeSession({
      startedAt: new Date("2026-11-05T09:00:00Z"),
      sets: [
        ...makeSets("bicep_curls", "accessory", 1, 12, { weight: 15, role: "ramp" }),
        ...makeSets("bicep_curls", "accessory", 3, 12, { weight: 25 }),
        ...makeSets("bicep_curls", "accessory", 2, 12, { weight: 20, role: "drop" }),
        ...makeSets("squat", "T1", 5, 3, { weight: 190, role: "work" }),
        ...makeSets("squat", "T1", 1, 5, { weight: 155, role: "backoff" }),
      ],
    });
    expect(lastLoggedWeights([session])).toEqual({ bicep_curls: 25, squat: 190 });
  });
});
