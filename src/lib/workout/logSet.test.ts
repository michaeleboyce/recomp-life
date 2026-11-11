import { describe, it, expect } from "vitest";
import { createSetLog, isNextSetAMRAP, nextStep } from "./logSet";
import type { CreateSetLogInput } from "./types";
import { makeEntry } from "./testFixtures";

const NOW = new Date("2026-11-11T10:30:00Z");

function input(overrides: Partial<CreateSetLogInput> = {}): CreateSetLogInput {
  return {
    exercise: makeEntry(),
    actualReps: 3,
    rpe: 8,
    location: "gym",
    autoRegulated: false,
    now: NOW,
    id: "id-1",
    clientId: "client-1",
    ...overrides,
  };
}

describe("isNextSetAMRAP", () => {
  it("is true only for the last set of an AMRAP entry", () => {
    expect(isNextSetAMRAP(makeEntry({ isAMRAP: true, targetSets: 5, completedSets: 4 }))).toBe(true);
    expect(isNextSetAMRAP(makeEntry({ isAMRAP: true, targetSets: 5, completedSets: 3 }))).toBe(false);
    expect(isNextSetAMRAP(makeEntry({ isAMRAP: true, targetSets: 5, completedSets: 0 }))).toBe(false);
  });

  it("is false for a non-AMRAP entry even on its last set", () => {
    expect(isNextSetAMRAP(makeEntry({ isAMRAP: false, targetSets: 3, completedSets: 2 }))).toBe(false);
  });

  it("is false once the entry is already complete", () => {
    expect(isNextSetAMRAP(makeEntry({ isAMRAP: true, targetSets: 5, completedSets: 5 }))).toBe(false);
  });
});

describe("createSetLog", () => {
  it("reproduces the object the active page builds", () => {
    expect(createSetLog(input())).toEqual({
      id: "id-1",
      clientId: "client-1",
      exerciseId: "squat",
      tier: "T1",
      setNumber: 1,
      targetReps: 3,
      actualReps: 3,
      weight: 190,
      isAMRAP: false,
      completedAt: NOW,
      restAfterSeconds: 0,
      status: "completed",
      originalWeight: undefined,
      isSubstituted: false,
      substituteExerciseId: undefined,
      rpe: 8,
      location: "gym",
      synced: false,
    });
  });

  it("numbers the set from completedSets", () => {
    expect(createSetLog(input({ exercise: makeEntry({ completedSets: 2 }) })).setNumber).toBe(3);
  });

  it("marks only the last set of an AMRAP entry as AMRAP", () => {
    expect(createSetLog(input({ exercise: makeEntry({ completedSets: 3 }) })).isAMRAP).toBe(false);
    expect(createSetLog(input({ exercise: makeEntry({ completedSets: 4 }) })).isAMRAP).toBe(true);
    expect(
      createSetLog(
        input({ exercise: makeEntry({ tier: "T2", isAMRAP: false, targetSets: 3, completedSets: 2 }) })
      ).isAMRAP
    ).toBe(false);
  });

  it("status is completed when reps meet or beat the target, failed otherwise", () => {
    expect(createSetLog(input({ actualReps: 3 })).status).toBe("completed");
    expect(createSetLog(input({ actualReps: 7 })).status).toBe("completed");
    expect(createSetLog(input({ actualReps: 2 })).status).toBe("failed");
  });

  it("an accepted T2 load drop is autoregulated_load_drop whatever the reps", () => {
    const t2 = makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, isAMRAP: false });
    expect(createSetLog(input({ exercise: t2, actualReps: 10, autoRegulated: true })).status).toBe(
      "autoregulated_load_drop"
    );
    expect(createSetLog(input({ exercise: t2, actualReps: 6, autoRegulated: true })).status).toBe(
      "autoregulated_load_drop"
    );
  });

  it("the autoRegulated flag has no effect outside T2", () => {
    expect(createSetLog(input({ autoRegulated: true, actualReps: 3 })).status).toBe("completed");
    expect(createSetLog(input({ autoRegulated: true, actualReps: 1 })).status).toBe("failed");
  });

  it("rpe is undefined when none was selected", () => {
    const set = createSetLog(input({ rpe: null }));
    expect(set.rpe).toBeUndefined();
  });

  it("a substituted entry keeps the template id and records the substitute", () => {
    const set = createSetLog(
      input({
        exercise: makeEntry({
          substituteExerciseId: "bulgarian_split_squat",
          weight: 75,
          originalWeight: 190,
        }),
        location: "home",
      })
    );
    expect(set).toMatchObject({
      exerciseId: "squat",
      weight: 75,
      originalWeight: 190,
      isSubstituted: true,
      substituteExerciseId: "bulgarian_split_squat",
      location: "home",
    });
  });

  it("logs a warm-up entry as tier warmup", () => {
    const set = createSetLog(
      input({
        exercise: makeEntry({ tier: "warmup", targetSets: 1, targetReps: 10, weight: 45, isAMRAP: false, isWarmUp: true }),
        actualReps: 10,
        rpe: null,
      })
    );
    expect(set).toMatchObject({ tier: "warmup", setNumber: 1, weight: 45, isAMRAP: false, status: "completed" });
  });
});

describe("nextStep", () => {
  const plan = [
    makeEntry({ tier: "warmup", targetSets: 1, isWarmUp: true, isAMRAP: false }),
    makeEntry({ targetSets: 5 }),
    makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, isAMRAP: false }),
  ];
  const withCompleted = (index: number, completedSets: number) =>
    plan.map((e, i) => (i === index ? { ...e, completedSets } : e));

  it("rest when the entry has more sets after this one", () => {
    expect(nextStep(withCompleted(1, 0), 1)).toBe("rest");
    expect(nextStep(withCompleted(1, 3), 1)).toBe("rest");
  });

  it("next-exercise after the last set of an entry that is not the last", () => {
    expect(nextStep(withCompleted(1, 4), 1)).toBe("next-exercise");
    // A single-set warm-up entry goes straight on, with no rest (as today).
    expect(nextStep(plan, 0)).toBe("next-exercise");
  });

  it("done after the last set of the last entry", () => {
    expect(nextStep(withCompleted(2, 2), 2)).toBe("done");
  });

  it("rest on the last entry while it still has sets left", () => {
    expect(nextStep(withCompleted(2, 1), 2)).toBe("rest");
  });

  it("done when the index is already past the end of the plan", () => {
    expect(nextStep(plan, 3)).toBe("done");
    expect(nextStep([], 0)).toBe("done");
  });
});
