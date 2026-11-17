import { describe, expect, it } from "vitest";
import { describeNextWorkout } from "./buildPlan";
import { foldRotation } from "./credit";
import { dueTemplateId } from "./rotation";
import { DEMO_WORKOUTS } from "./testPlanningCases";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { DEFAULT_USER_PROFILE } from "@/db/seed";

describe("dueTemplateId", () => {
  it("starts at A1", () => {
    expect(dueTemplateId([])).toBe("A1");
  });

  it("is the rotation's due day, as the full plan names it, after every demo workout", () => {
    for (let i = 0; i <= DEMO_WORKOUTS.length; i++) {
      const done = DEMO_WORKOUTS.slice(0, i);
      expect(dueTemplateId(done)).toBe(foldRotation(done).dueTemplateId);
      const planned = describeNextWorkout({
        completedWorkouts: done,
        templates: WORKOUT_TEMPLATES,
        liftStates: [],
        plan: {
          location: "gym",
          equipment: DEFAULT_USER_PROFILE.settings.equipment,
          includeWarmUps: false,
          selectedAccessories: [],
        },
      });
      expect(dueTemplateId(done)).toBe(planned.templateId);
    }
  });

  it("ignores unfinished workouts", () => {
    const open = { ...DEMO_WORKOUTS[0], completedAt: null };
    expect(dueTemplateId([open])).toBe("A1");
  });
});
