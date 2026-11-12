import { describe, it, expect } from "vitest";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { EXERCISES } from "@/lib/exercises";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { EquipmentProfile, LiftState, WorkoutTemplate } from "@/types";
import {
  buildWorkoutPlan,
  describeNextWorkout,
  overridesFromSession,
  substituteModification,
  WARM_UP_TIERS,
} from "./buildPlan";
import type { BuildPlanInput } from "./types";
import { EQUIPMENT, makeSession, seedLiftStates } from "./testFixtures";

function input(overrides: Partial<BuildPlanInput> = {}): BuildPlanInput {
  return {
    template: WORKOUT_TEMPLATES.A1,
    liftStates: seedLiftStates(),
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: false,
    selectedAccessories: [],
    ...overrides,
  };
}

describe("WARM_UP_TIERS", () => {
  it("is T1 only, matching what the active page performs today", () => {
    expect(WARM_UP_TIERS).toEqual(["T1"]);
  });
});

describe("buildWorkoutPlan at the gym", () => {
  it("A1 without warm-ups: one entry per template exercise, as the active page builds it", () => {
    expect(buildWorkoutPlan(input())).toEqual([
      {
        exerciseId: "squat",
        substituteExerciseId: undefined,
        tier: "T1",
        targetSets: 5,
        targetReps: 3,
        weight: 190,
        originalWeight: undefined,
        isAMRAP: true,
        isWarmUp: false,
        completedSets: 0,
      },
      {
        exerciseId: "bench",
        substituteExerciseId: undefined,
        tier: "T2",
        targetSets: 3,
        targetReps: 10,
        weight: 100,
        originalWeight: undefined,
        isAMRAP: false,
        isWarmUp: false,
        completedSets: 0,
      },
      {
        exerciseId: "lat_pulldown",
        substituteExerciseId: undefined,
        tier: "T3",
        targetSets: 3,
        targetReps: 15,
        weight: 90,
        originalWeight: undefined,
        isAMRAP: true,
        isWarmUp: false,
        completedSets: 0,
      },
    ]);
  });

  it("A1 with warm-ups: four warm-up entries before the T1 only", () => {
    const plan = buildWorkoutPlan(input({ includeWarmUps: true }));
    expect(plan.map((e) => [e.exerciseId, e.tier, e.targetSets, e.targetReps, e.weight])).toEqual([
      ["squat", "warmup", 1, 10, 45],
      ["squat", "warmup", 1, 5, 95],
      ["squat", "warmup", 1, 3, 135],
      ["squat", "warmup", 1, 1, 160],
      ["squat", "T1", 5, 3, 190],
      ["bench", "T2", 3, 10, 100],
      ["lat_pulldown", "T3", 3, 15, 90],
    ]);
    for (const warmUp of plan.slice(0, 4)) {
      expect(warmUp).toMatchObject({ isWarmUp: true, isAMRAP: false, completedSets: 0 });
      expect(warmUp.substituteExerciseId).toBeUndefined();
      expect(warmUp.originalWeight).toBeUndefined();
    }
    expect(plan.slice(4).every((e) => !e.isWarmUp)).toBe(true);
  });

  it("uses the lift's current stage for sets and reps", () => {
    const liftStates = seedLiftStates().map((ls): LiftState =>
      ls.exerciseId === "squat"
        ? { ...ls, t1Stage: "6x2" }
        : ls.exerciseId === "bench"
          ? { ...ls, t2Stage: "3x8" }
          : ls
    );
    const plan = buildWorkoutPlan(input({ liftStates }));
    expect(plan[0]).toMatchObject({ targetSets: 6, targetReps: 2, weight: 190 });
    expect(plan[1]).toMatchObject({ targetSets: 3, targetReps: 8, weight: 100 });
  });

  it("a missing lift state gives weight 0 with the template's sets/reps (and still gets warm-ups, as today)", () => {
    const plan = buildWorkoutPlan(input({ liftStates: [], includeWarmUps: true }));
    expect(plan.map((e) => [e.exerciseId, e.tier, e.targetReps, e.weight])).toEqual([
      ["squat", "warmup", 10, 45],
      ["squat", "warmup", 5, 0],
      ["squat", "T1", 3, 0],
      ["bench", "T2", 10, 0],
      ["lat_pulldown", "T3", 15, 0],
    ]);
  });

  it("ignores overrides at the gym", () => {
    const plan = buildWorkoutPlan(input({ overrides: { squat: "goblet_squat" } }));
    expect(plan).toEqual(buildWorkoutPlan(input()));
  });

  it("throws for a template exercise that does not exist (as getExercise does today)", () => {
    const template: WorkoutTemplate = {
      id: "X",
      name: "Broken",
      exercises: [{ exerciseId: "nope", tier: "T1", sets: 5, reps: 3, isAMRAP: true }],
    };
    expect(() => buildWorkoutPlan(input({ template }))).toThrow("Exercise not found: nope");
  });
});

describe("buildWorkoutPlan accessories", () => {
  it("appends selected accessories as 3 x 15 AMRAP at their default weight", () => {
    const plan = buildWorkoutPlan(
      input({ selectedAccessories: ["face_pulls", "ab_rollout"] })
    );
    expect(plan.slice(3)).toEqual([
      {
        exerciseId: "face_pulls",
        tier: "accessory",
        targetSets: 3,
        targetReps: 15,
        weight: 30,
        isAMRAP: true,
        isWarmUp: false,
        completedSets: 0,
      },
      {
        exerciseId: "ab_rollout",
        tier: "accessory",
        targetSets: 3,
        targetReps: 15,
        weight: 0,
        isAMRAP: true,
        isWarmUp: false,
        completedSets: 0,
      },
    ]);
  });

  it("skips unknown accessory ids", () => {
    const plan = buildWorkoutPlan(input({ selectedAccessories: ["not_real", "face_pulls"] }));
    expect(plan.map((e) => e.exerciseId)).toEqual(["squat", "bench", "lat_pulldown", "face_pulls"]);
  });

  it("a known exercise with no default accessory weight gets weight 0", () => {
    const plan = buildWorkoutPlan(input({ selectedAccessories: ["db_row"] }));
    expect(plan[3]).toMatchObject({ exerciseId: "db_row", tier: "accessory", weight: 0 });
  });

  it("does not adapt accessories at home (as today)", () => {
    const plan = buildWorkoutPlan(
      input({ location: "home", selectedAccessories: ["face_pulls"] })
    );
    const accessory = plan[plan.length - 1];
    expect(accessory).toMatchObject({ exerciseId: "face_pulls", weight: 30 });
    expect(accessory.substituteExerciseId).toBeUndefined();
  });
});

describe("buildWorkoutPlan at home (D5: same adaptation as Configure)", () => {
  it("A1 uses adaptExerciseForHome's choice, not the raw dumbbellAlternative", () => {
    const plan = buildWorkoutPlan(input({ location: "home" }));
    // Squat 190: goblet squat needs 150 (max 80), so the chain's first fit is chosen.
    expect(plan[0]).toEqual({
      exerciseId: "squat",
      substituteExerciseId: "bulgarian_split_squat",
      tier: "T1",
      targetSets: 5,
      targetReps: 3,
      weight: 75,
      originalWeight: 190,
      isAMRAP: true,
      isWarmUp: false,
      completedSets: 0,
    });
    expect(plan[1]).toMatchObject({
      exerciseId: "bench",
      substituteExerciseId: "db_bench",
      weight: 40,
      originalWeight: 100,
    });
    expect(plan[2]).toMatchObject({
      exerciseId: "lat_pulldown",
      substituteExerciseId: "db_row",
      weight: 35,
      originalWeight: 90,
    });
  });

  it("agrees with adaptExerciseForHome for every template", () => {
    for (const template of Object.values(WORKOUT_TEMPLATES)) {
      const liftStates = seedLiftStates();
      const plan = buildWorkoutPlan(input({ template, liftStates, location: "home" }));
      template.exercises.forEach((templateEx, i) => {
        const exercise = EXERCISES[templateEx.exerciseId];
        const ls = liftStates.find((s) => s.exerciseId === templateEx.exerciseId)!;
        const weight =
          templateEx.tier === "T1" ? ls.t1Weight : templateEx.tier === "T2" ? ls.t2Weight : ls.t3Weight;
        const adaptation = adaptExerciseForHome(
          exercise,
          weight,
          EQUIPMENT,
          exercise.dumbbellAlternative ? EXERCISES[exercise.dumbbellAlternative] : undefined
        );
        const substituted = adaptation.adaptedExercise.id !== exercise.id;
        expect(plan[i].exerciseId).toBe(templateEx.exerciseId);
        expect(plan[i].weight).toBe(adaptation.adaptedWeight);
        expect(plan[i].substituteExerciseId).toBe(
          substituted ? adaptation.adaptedExercise.id : undefined
        );
        expect(plan[i].originalWeight).toBe(substituted ? weight : undefined);
      });
    }
  });

  it("an exercise that already works at home is left alone", () => {
    // B1's T3 is db_row, which does not require a gym.
    const plan = buildWorkoutPlan(input({ template: WORKOUT_TEMPLATES.B1, location: "home" }));
    expect(plan[2]).toEqual({
      exerciseId: "db_row",
      substituteExerciseId: undefined,
      tier: "T3",
      targetSets: 3,
      targetReps: 15,
      weight: 35,
      originalWeight: undefined,
      isAMRAP: true,
      isWarmUp: false,
      completedSets: 0,
    });
  });

  it("warm-ups are generated from the adapted weight and carry the substitute and original weight", () => {
    const plan = buildWorkoutPlan(input({ location: "home", includeWarmUps: true }));
    expect(plan.slice(0, 2)).toEqual([
      {
        exerciseId: "squat",
        substituteExerciseId: "bulgarian_split_squat",
        tier: "warmup",
        targetSets: 1,
        targetReps: 10,
        weight: 30,
        originalWeight: 190,
        isAMRAP: false,
        isWarmUp: true,
        completedSets: 0,
      },
      {
        exerciseId: "squat",
        substituteExerciseId: "bulgarian_split_squat",
        tier: "warmup",
        targetSets: 1,
        targetReps: 5,
        weight: 55,
        originalWeight: 190,
        isAMRAP: false,
        isWarmUp: true,
        completedSets: 0,
      },
    ]);
    expect(plan[2]).toMatchObject({ tier: "T1", weight: 75 });
    expect(plan).toHaveLength(5);
  });

  describe("overrides (R3)", () => {
    it("selects the chosen alternative and its weight", () => {
      const plan = buildWorkoutPlan(
        input({ location: "home", overrides: { squat: "goblet_squat" } })
      );
      // Goblet squat would need 150 lbs; the alternative is capped at the 80 lb max.
      expect(plan[0]).toMatchObject({
        exerciseId: "squat",
        substituteExerciseId: "goblet_squat",
        weight: 80,
        originalWeight: 190,
      });
    });

    it("warm-ups follow the overridden weight", () => {
      const plan = buildWorkoutPlan(
        input({ location: "home", includeWarmUps: true, overrides: { squat: "goblet_squat" } })
      );
      expect(plan.slice(0, 2).map((e) => [e.substituteExerciseId, e.weight])).toEqual([
        ["goblet_squat", 30],
        ["goblet_squat", 55],
      ]);
    });

    it("ignores an override that is not one of the adaptation's alternatives", () => {
      const base = buildWorkoutPlan(input({ location: "home" }));
      expect(
        buildWorkoutPlan(input({ location: "home", overrides: { squat: "db_bench" } }))
      ).toEqual(base);
    });

    it("ignores an override when the default substitute fits (no alternatives offered)", () => {
      // Bench 100 -> DB bench 40/hand fits, so Configure offers no alternatives.
      const base = buildWorkoutPlan(input({ location: "home" }));
      expect(
        buildWorkoutPlan(input({ location: "home", overrides: { bench: "db_floor_press" } }))
      ).toEqual(base);
    });

    it("ignores overrides for exercises that are not in the template", () => {
      const base = buildWorkoutPlan(input({ location: "home" }));
      expect(
        buildWorkoutPlan(input({ location: "home", overrides: { deadlift: "db_rdl" } }))
      ).toEqual(base);
    });
  });

  describe("edge cases follow adaptExerciseForHome", () => {
    it('"exceeds": the primary substitute capped at the max dumbbell weight', () => {
      // Deadlift 220 -> DB RDL needs 90/hand; nothing in the chain fits an 80 lb max.
      const deadlift = EXERCISES.deadlift;
      const adaptation = adaptExerciseForHome(deadlift, 220, EQUIPMENT, EXERCISES.db_rdl);
      expect(adaptation.adaptationStatus).toBe("exceeds");

      const plan = buildWorkoutPlan(input({ template: WORKOUT_TEMPLATES.B2, location: "home" }));
      expect(plan[0]).toMatchObject({
        exerciseId: "deadlift",
        substituteExerciseId: "db_rdl",
        tier: "T1",
        targetSets: 5,
        targetReps: 3,
        weight: 80,
        originalWeight: 220,
      });
    });

    it('"exceeds" with no fallback chain: the substitute capped at the max dumbbell weight', () => {
      // lat_pulldown has no HOME_SUBSTITUTE_CHAINS entry, so adaptExerciseForHome
      // returns db_row capped at the max (the converted weight would be 100).
      const liftStates = seedLiftStates().map((ls) =>
        ls.exerciseId === "lat_pulldown" ? { ...ls, t3Weight: 250 } : ls
      );
      const adaptation = adaptExerciseForHome(EXERCISES.lat_pulldown, 250, EQUIPMENT, EXERCISES.db_row);
      expect(adaptation.adaptationStatus).toBe("exceeds");

      const plan = buildWorkoutPlan(input({ liftStates, location: "home" }));
      expect(plan[2]).toMatchObject({
        exerciseId: "lat_pulldown",
        substituteExerciseId: "db_row",
        weight: 80,
        originalWeight: 250,
      });
    });

    it('"no_substitute": the template exercise at its prescribed weight, not marked as substituted', () => {
      // leg_curls needs a gym and has no dumbbell alternative.
      const template: WorkoutTemplate = {
        id: "X",
        name: "No substitute",
        exercises: [{ exerciseId: "leg_curls", tier: "T3", sets: 3, reps: 15, isAMRAP: true }],
      };
      const liftStates: LiftState[] = [
        { ...seedLiftStates()[0], exerciseId: "leg_curls", t3Weight: 70 },
      ];
      const adaptation = adaptExerciseForHome(EXERCISES.leg_curls, 70, EQUIPMENT, undefined);
      expect(adaptation.adaptationStatus).toBe("no_substitute");

      const home = buildWorkoutPlan(input({ template, liftStates, location: "home" }));
      const gym = buildWorkoutPlan(input({ template, liftStates, location: "gym" }));
      expect(home).toEqual(gym);
      expect(home[0]).toMatchObject({ exerciseId: "leg_curls", weight: 70 });
      expect(home[0].substituteExerciseId).toBeUndefined();
      expect(home[0].originalWeight).toBeUndefined();
    });

    it("respects the equipment profile it is given", () => {
      const bigDumbbells: EquipmentProfile = { ...EQUIPMENT, maxDumbbellWeight: 150 };
      const plan = buildWorkoutPlan(input({ location: "home", equipment: bigDumbbells }));
      expect(plan[0]).toMatchObject({ substituteExerciseId: "goblet_squat", weight: 150 });
    });
  });
});

describe("substituteModification / overridesFromSession", () => {
  it("builds an accepted equipment_limit substitute modification", () => {
    const mod = substituteModification("squat", "goblet_squat", 190, 80);
    expect(mod).toMatchObject({
      exerciseId: "squat",
      originalWeight: 190,
      modifiedWeight: 80,
      action: "substitute",
      source: "equipment_limit",
      userAccepted: true,
    });
    // History renders "<exercise name>: <reason>", so the reason stays readable.
    expect(mod.reason).toBe("Home substitute: Goblet Squat [substitute:goblet_squat]");
  });

  it("round-trips through a session", () => {
    const session = makeSession({
      modifications: [
        substituteModification("squat", "goblet_squat", 190, 80),
        substituteModification("deadlift", "single_leg_db_rdl", 220, 80),
      ],
    });
    expect(overridesFromSession(session)).toEqual({
      squat: "goblet_squat",
      deadlift: "single_leg_db_rdl",
    });
  });

  it("round-trips an id that is not in the exercise library", () => {
    const mod = substituteModification("squat", "future_exercise_2", 190, 80);
    expect(overridesFromSession({ modifications: [mod] })).toEqual({
      squat: "future_exercise_2",
    });
  });

  it("feeds buildWorkoutPlan the same choice that was saved", () => {
    const session = makeSession({
      location: "home",
      modifications: [substituteModification("squat", "goblet_squat", 190, 80)],
    });
    const plan = buildWorkoutPlan(
      input({ location: "home", overrides: overridesFromSession(session) })
    );
    expect(plan[0]).toMatchObject({ substituteExerciseId: "goblet_squat", weight: 80 });
  });

  it("ignores other modifications and reasons that carry no substitute id", () => {
    const session = makeSession({
      modifications: [
        {
          exerciseId: "squat",
          originalWeight: 190,
          modifiedWeight: 170,
          reason: "Left Knee pain (2/5) — reduced load 10%",
          action: "reduce_weight",
          source: "pain",
          userAccepted: true,
        },
        {
          exerciseId: "bench",
          originalWeight: 100,
          modifiedWeight: 40,
          reason: "[substitute:db_floor_press]",
          action: "substitute",
          source: "pain",
          userAccepted: true,
        },
        {
          exerciseId: "ohp",
          originalWeight: 85,
          modifiedWeight: 35,
          reason: "Adapted for home",
          action: "substitute",
          source: "equipment_limit",
          userAccepted: true,
        },
      ],
    });
    expect(overridesFromSession(session)).toEqual({});
  });

  it("returns an empty map for a session with no modifications", () => {
    expect(overridesFromSession(makeSession())).toEqual({});
    expect(
      overridesFromSession({ modifications: undefined as unknown as [] })
    ).toEqual({});
  });

  it("the last saved substitute for an exercise wins", () => {
    const session = makeSession({
      modifications: [
        substituteModification("squat", "goblet_squat", 190, 80),
        substituteModification("squat", "db_lunge", 190, 75),
      ],
    });
    expect(overridesFromSession(session)).toEqual({ squat: "db_lunge" });
  });
});

describe("describeNextWorkout", () => {
  const plan = {
    location: "gym" as const,
    equipment: EQUIPMENT,
    includeWarmUps: false,
    selectedAccessories: [],
  };
  const at = (iso: string) => new Date(iso);

  function describeWith(
    completedWorkouts: Parameters<typeof describeNextWorkout>[0]["completedWorkouts"]
  ) {
    return describeNextWorkout({
      completedWorkouts,
      templates: WORKOUT_TEMPLATES,
      liftStates: seedLiftStates(),
      plan,
    });
  }

  it("the first workout ever is A1", () => {
    const next = describeWith([]);
    expect(next.templateId).toBe("A1");
    expect(next.template).toBe(WORKOUT_TEMPLATES.A1);
  });

  it.each([
    ["A1", "B1"],
    ["B1", "A2"],
    ["A2", "B2"],
    ["B2", "A1"],
  ])("after %s comes %s", (last, expected) => {
    const next = describeWith([
      { templateId: last, startedAt: at("2026-11-10T09:00:00Z"), completedAt: at("2026-11-10T10:00:00Z") },
    ]);
    expect(next.templateId).toBe(expected);
    expect(next.template).toBe(WORKOUT_TEMPLATES[expected]);
  });

  it("uses the most recently started workout whatever the input order", () => {
    const next = describeWith([
      { templateId: "A2", startedAt: at("2026-11-09T09:00:00Z"), completedAt: at("2026-11-09T10:00:00Z") },
      { templateId: "A1", startedAt: at("2026-11-05T09:00:00Z"), completedAt: at("2026-11-05T10:00:00Z") },
      { templateId: "B1", startedAt: at("2026-11-07T09:00:00Z"), completedAt: at("2026-11-07T10:00:00Z") },
    ]);
    expect(next.templateId).toBe("B2");
  });

  it("an unfinished workout does not advance the rotation", () => {
    const next = describeWith([
      { templateId: "A1", startedAt: at("2026-11-05T09:00:00Z"), completedAt: at("2026-11-05T10:00:00Z") },
      { templateId: "B1", startedAt: at("2026-11-07T09:00:00Z"), completedAt: null },
    ]);
    expect(next.templateId).toBe("B1");
  });

  it("an unknown last template falls back to A1 (getNextWorkoutId)", () => {
    const next = describeWith([
      { templateId: "ZZ", startedAt: at("2026-11-05T09:00:00Z"), completedAt: at("2026-11-05T10:00:00Z") },
    ]);
    expect(next.templateId).toBe("A1");
  });

  it("returns the plan for that template built with the given options", () => {
    const liftStates = seedLiftStates();
    const next = describeNextWorkout({
      completedWorkouts: [
        { templateId: "A1", startedAt: at("2026-11-05T09:00:00Z"), completedAt: at("2026-11-05T10:00:00Z") },
      ],
      templates: WORKOUT_TEMPLATES,
      liftStates,
      plan: { ...plan, location: "home", includeWarmUps: true, selectedAccessories: ["bicep_curls"] },
    });
    expect(next.plan).toEqual(
      buildWorkoutPlan({
        template: WORKOUT_TEMPLATES.B1,
        liftStates,
        location: "home",
        equipment: EQUIPMENT,
        includeWarmUps: true,
        selectedAccessories: ["bicep_curls"],
      })
    );
  });

  it("throws when the next template is missing from the given templates", () => {
    expect(() =>
      describeNextWorkout({ completedWorkouts: [], templates: {}, liftStates: [], plan })
    ).toThrow("Workout template not found: A1");
  });
});
