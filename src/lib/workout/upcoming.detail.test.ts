// describeUpcomingWorkout: one coming workout in full (W1 to W5). Made-up data only.
import { describe, expect, it } from "vitest";
import { getIncrement } from "@/lib/progression";
import { applySteps } from "@/lib/trace/replay";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { NextSetPlan, PrescribedEntry } from "@/types";
import { foldRotation } from "./credit";
import { resolveNextWorkout } from "./nextWorkout";
import { planWorkoutStart } from "./startPlan";
import { EQUIPMENT, SETTINGS, makeSession, seedLiftStates } from "./testFixtures";
import {
  MAX_UPCOMING_POSITION,
  describeUpcomingWorkout,
  nextOccurrences,
  plannedSetsOf,
  projectUpcomingWorkouts,
  type DescribeUpcomingInput,
} from "./upcoming";

// Local time, so the accessory day is the same calendar day in every time zone.
const AT = (() => {
  const d = new Date(2026, 10, 12);
  d.setHours(9, 0, 0, 0);
  return d;
})();

const settings = { ...SETTINGS, sessionMinutes: 60 };

function input(overrides: Partial<DescribeUpcomingInput> = {}): DescribeUpcomingInput {
  return {
    completedWorkouts: [],
    templates: WORKOUT_TEMPLATES,
    liftStates: seedLiftStates(),
    location: "gym",
    equipment: EQUIPMENT,
    includeWarmUps: true,
    settings,
    now: new Date(0),
    variantStates: [],
    strengthSets: [],
    reentry: true,
    accessoriesNow: AT,
    position: 0,
    ...overrides,
  };
}

const program = (plan: { isWarmUp: boolean; tier: string }[]) =>
  plan.filter((e) => !e.isWarmUp && e.tier !== "accessory");

describe("describeUpcomingWorkout", () => {
  it("plans position 0 exactly as Today and the Ready screen do, set for set", () => {
    const detail = describeUpcomingWorkout(input())!;
    // Today: `nextWorkoutFrom` -> resolveNextWorkout over the same records.
    const today = resolveNextWorkout({
      completedWorkouts: [],
      liftStates: seedLiftStates(),
      variantStates: [],
      strengthSets: [],
      settings: { ...settings, equipment: EQUIPMENT, showWarmUps: true },
      location: "gym",
      now: AT,
    });
    expect(detail.plan).toEqual(today.plan);
    // Ready with nothing changed: planWorkoutStart for the due day.
    const ready = planWorkoutStart({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: seedLiftStates(),
      variantStates: [],
      location: "gym",
      equipment: EQUIPMENT,
      includeWarmUps: true,
      selectedAccessories: [],
      strengthSets: [],
      accessories: { settings: { ...settings, equipment: EQUIPMENT }, strengthSets: [], now: AT },
    });
    expect(detail.plan).toEqual(ready.plan);
    expect(detail.plan.map(plannedSetsOf)).toEqual(ready.plan.map(plannedSetsOf));
    expect(detail).toMatchObject({ position: 0, templateId: "A1", dueTemplateId: "A1", projected: false });
    expect(detail.sameIfDoneToday).toBe(true);
    expect(detail.lifts.every((lift) => lift.projection === null && lift.dependsOn === null)).toBe(true);
  });

  it("lists warm-ups, the lifts and the accessories in order", () => {
    const { plan } = describeUpcomingWorkout(input({ position: 2 }))!;
    const firstWorking = plan.findIndex((e) => !e.isWarmUp);
    expect(firstWorking).toBeGreaterThan(0);
    expect(plan.slice(0, firstWorking).every((e) => e.tier === "warmup")).toBe(true);
    const tiers = plan.filter((e) => !e.isWarmUp).map((e) => e.tier);
    const firstAccessory = tiers.indexOf("accessory");
    expect(tiers.slice(0, 3)).toEqual(["T1", "T2", "T3"]);
    if (firstAccessory >= 0) expect(tiers.slice(firstAccessory).every((t) => t === "accessory")).toBe(true);
    // Without the warm-up setting, none.
    const bare = describeUpcomingWorkout(input({ position: 2, includeWarmUps: false }))!;
    expect(bare.plan.some((e) => e.isWarmUp)).toBe(false);
  });

  it("gives every position the card's lifts and length plan", () => {
    const cards = projectUpcomingWorkouts({ ...input(), count: 5 });
    cards.forEach((card, position) => {
      const detail = describeUpcomingWorkout(input({ position }))!;
      expect(detail.templateId).toBe(card.templateId);
      expect(program(detail.plan)).toEqual(program(card.plan));
      // Same accessories, so the same session length.
      expect(detail.plan).toEqual(card.plan);
      expect(detail.lifts.map((l) => l.assumed)).toEqual(card.entries.map((e) => e.assumed));
    });
  });

  it("names the session a later lift depends on and projects its weight honestly", () => {
    const again = describeUpcomingWorkout(input({ position: 4 }))!;
    expect(again.templateId).toBe("A1");
    const squat = again.lifts.find((l) => l.entry.tier === "T1")!;
    const inc = getIncrement("lower", "gym", EQUIPMENT);
    expect(squat.entry.weight).toBe(190 + inc);
    expect(squat.assumed).toBe(true);
    expect(squat.dependsOn).toEqual({ position: 0, templateId: "A1" });
    expect(squat.changes).toHaveLength(1);
    expect(squat.changes[0]).toMatchObject({ kind: "passed", from: { weight: 190 }, to: { weight: 190 + inc } });
    // The steps add up to the planned weight and cite the progression rule.
    const trace = squat.projection!;
    expect(applySteps(trace.steps).lb).toBe(squat.entry.weight);
    expect(trace.result).toBe(squat.entry.weight);
    expect(trace.steps[0]).toMatchObject({ id: "projection-start", effect: { op: "start", value: 190 } });
    expect(trace.steps[1]).toMatchObject({ id: "projected-session", effect: { op: "add", value: inc } });
    expect(trace.steps[1].title).toBe("If A1 · Squat day goes to plan");
    expect(trace.steps[1].ruleId).toBe(squat.changes[0].ruleId);
    // A T3 lift done before at the target reps holds, and depends on nothing.
    const t3 = again.lifts.find((l) => l.entry.tier === "T3")!;
    expect(t3.changes[0].kind).toBe("t3Same");
    expect(t3.dependsOn).toBeNull();
    expect(applySteps(t3.projection!.steps).lb).toBe(t3.entry.weight);
  });

  it("leaves a lift no earlier day trains where it stands", () => {
    const a2 = describeUpcomingWorkout(input({ position: 2 }))!;
    const bench = a2.lifts.find((l) => l.entry.tier === "T1")!;
    expect(bench).toMatchObject({ assumed: false, dependsOn: null, changes: [] });
    expect(bench.projection!.steps).toHaveLength(1);
    expect(applySteps(bench.projection!.steps).lb).toBe(bench.entry.weight);
    // Its lifts are what doing it today would plan.
    expect(a2.sameIfDoneToday).toBe(true);
    // The second squat day is not: the first one moved squat.
    expect(describeUpcomingWorkout(input({ position: 4 }))!.sameIfDoneToday).toBe(false);
  });

  it("projects home exercises from their own outcomes", () => {
    const again = describeUpcomingWorkout(input({ position: 4, location: "home" }))!;
    const t1 = again.lifts.find((l) => l.entry.tier === "T1")!;
    expect(t1.entry.substituteExerciseId).toBeDefined();
    expect(t1.changes).toHaveLength(1);
    expect(t1.changes[0].exerciseId).toBe(t1.entry.substituteExerciseId);
    expect(applySteps(t1.projection!.steps).lb).toBe(t1.entry.weight);
  });

  it("gives a per-set plan to the first coming day that does it, and says so in the trace", () => {
    const sets = [
      { weight: 100, reps: 3 },
      { weight: 110, reps: 3 },
      { weight: 120, reps: 3 },
    ];
    const plan: NextSetPlan = {
      exerciseId: "deadlift",
      liftId: "deadlift",
      tier: "T1",
      sets,
      planSets: [],
      createdAt: "2026-11-10T10:00:00.000Z",
    };
    const nextSetPlans = { "deadlift|T1": plan };
    const b2 = describeUpcomingWorkout(input({ position: 3, nextSetPlans }))!;
    const deadlift = b2.lifts.find((l) => l.entry.tier === "T1")!;
    expect(plannedSetsOf(deadlift.entry).map((s) => s.weight)).toEqual([100, 110, 120]);
    expect(applySteps(deadlift.projection!.steps).lb).toBe(deadlift.entry.weight);
    // Used up there: the next deadlift T1 day plans every set alike.
    const later = describeUpcomingWorkout(input({ position: 7, nextSetPlans }))!;
    const next = later.lifts.find((l) => l.entry.tier === "T1")!;
    expect(next.entry.perSet).toBeUndefined();
  });

  it("is null for a position out of range", () => {
    expect(describeUpcomingWorkout(input({ position: -1 }))).toBeNull();
    expect(describeUpcomingWorkout(input({ position: 1.5 }))).toBeNull();
    expect(describeUpcomingWorkout(input({ position: MAX_UPCOMING_POSITION + 1 }))).toBeNull();
    expect(describeUpcomingWorkout(input({ position: MAX_UPCOMING_POSITION }))).not.toBeNull();
  });

  it("doing a later day today leaves the due day due (W5)", () => {
    // The rotation rule itself: credit.test.ts "leaves the due day due after a day pulled out of order".
    const prescribed = (id: string): PrescribedEntry[] => [
      { exerciseId: id, tier: "T1", weight: 100, sets: 5, reps: 3, stage: "5x3" },
    ];
    const a1Done = makeSession({
      id: "a1",
      templateId: "A1",
      startedAt: new Date(2026, 10, 9, 9),
      completedAt: new Date(2026, 10, 9, 10),
      prescribed: prescribed("squat"),
    });
    const due = describeUpcomingWorkout(input({ completedWorkouts: [a1Done] }))!;
    expect(due.templateId).toBe("B1");
    // B2 ("Do this one today" from position 2) done out of order.
    const b2Done = makeSession({
      id: "b2",
      templateId: "B2",
      startedAt: new Date(2026, 10, 10, 9),
      completedAt: new Date(2026, 10, 10, 10),
      prescribed: prescribed("deadlift"),
    });
    expect(foldRotation([a1Done, b2Done]).dueTemplateId).toBe("B1");
    const after = describeUpcomingWorkout(input({ completedWorkouts: [a1Done, b2Done] }))!;
    expect(after.templateId).toBe("B1");
    expect(after.dueTemplateId).toBe("B1");
  });
});

describe("nextOccurrences", () => {
  it("is the first position of each day", () => {
    const days = ["B1", "A2", "B2", "A1", "B1"].map((templateId) => ({ templateId }));
    expect(nextOccurrences(days)).toEqual([0, 1, 2, 3]);
    expect(nextOccurrences([])).toEqual([]);
  });
});
