import { describe, expect, it } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { planForSession } from "./planForSession";
import { EQUIPMENT, makeSession, seedLiftStates } from "./testFixtures";
import { seedVariantState } from "./variant";

const template = WORKOUT_TEMPLATES.A1;

describe("planForSession", () => {
  it("plans from the lift states when nothing was stored", () => {
    const plan = planForSession({
      session: makeSession(),
      template,
      liftStates: seedLiftStates(),
      equipment: EQUIPMENT,
    });
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((e) => !e.isWarmUp)).toBe(true);
  });

  it("keeps the stored prescription over the current lift states", () => {
    const first = planForSession({
      session: makeSession(),
      template,
      liftStates: seedLiftStates(),
      equipment: EQUIPMENT,
    });
    const t1 = first.find((e) => e.tier === "T1")!;
    const session = makeSession({
      prescribed: [{ exerciseId: t1.exerciseId, tier: "T1", weight: 205, sets: 6, reps: 2 }],
    });
    const plan = planForSession({ session, template, liftStates: seedLiftStates(), equipment: EQUIPMENT });
    const entry = plan.find((e) => e.exerciseId === t1.exerciseId && e.tier === "T1")!;
    expect(entry.weight).toBe(205);
    expect(entry.targetSets).toBe(6);
    expect(entry.targetReps).toBe(2);
  });

  it("applies the session's own edits last", () => {
    const first = planForSession({
      session: makeSession(),
      template,
      liftStates: seedLiftStates(),
      equipment: EQUIPMENT,
    });
    const t1 = first.find((e) => e.tier === "T1")!;
    const session = makeSession({
      planEdits: [{ kind: "weight", exerciseId: t1.exerciseId, tier: "T1", weight: 95 }],
    });
    const plan = planForSession({ session, template, liftStates: seedLiftStates(), equipment: EQUIPMENT });
    expect(plan.find((e) => e.exerciseId === t1.exerciseId && e.tier === "T1")!.weight).toBe(95);
  });

  it("at home plans each lift from its own variant state", () => {
    const split = {
      ...seedVariantState({ liftId: "squat", exerciseId: "bulgarian_split_squat", tier: "T1", liftState: seedLiftStates()[0], equipment: EQUIPMENT }),
      weight: 80,
      stage: "6x2" as const,
      current: true,
    };
    const session = makeSession({ location: "home" });
    const plan = planForSession({ session, template, liftStates: seedLiftStates(), equipment: EQUIPMENT, variantStates: [split] });
    expect(plan[0]).toMatchObject({ substituteExerciseId: "bulgarian_split_squat", weight: 80, targetSets: 6, targetReps: 2, originalWeight: 190 });
  });

  it("at home keeps a stored home prescription over the current variant states", () => {
    const session = makeSession({
      location: "home",
      prescribed: [
        {
          exerciseId: "squat",
          tier: "T1",
          weight: 190,
          sets: 5,
          reps: 3,
          stage: "5x3",
          home: { exerciseId: "bulgarian_split_squat", weight: 70, perHand: true, stage: "5x3", sets: 5, reps: 4 },
        },
      ],
    });
    const plan = planForSession({ session, template, liftStates: seedLiftStates(), equipment: EQUIPMENT, variantStates: [] });
    expect(plan[0]).toMatchObject({ substituteExerciseId: "bulgarian_split_squat", weight: 70, targetSets: 5, targetReps: 4 });
  });
});
