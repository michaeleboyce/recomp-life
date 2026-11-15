import { describe, expect, it } from "vitest";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { planForSession } from "./planForSession";
import { planForSession as reExported } from "@/components/ActiveWorkout/activeWorkoutLogic";
import { EQUIPMENT, makeSession, seedLiftStates } from "./testFixtures";

const template = WORKOUT_TEMPLATES.A1;

describe("planForSession", () => {
  it("keeps the old import path working", () => {
    expect(reExported).toBe(planForSession);
  });

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
});
