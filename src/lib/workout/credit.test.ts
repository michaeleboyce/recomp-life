import { describe, it, expect } from "vitest";
import type { PrescribedEntry } from "@/types";
import {
  classifyEntry,
  CREDIT_DECIDING_STATUSES,
  CREDIT_MIN_WEIGHT_RATIO,
  CREDIT_TIERS,
  sessionCountsForRotation,
} from "./credit";
import { makeEntry, makeSets } from "./testFixtures";

const PRESCRIBED: PrescribedEntry[] = [
  { exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" },
  { exerciseId: "bench", tier: "T2", weight: 100, sets: 3, reps: 10, stage: "3x10" },
  { exerciseId: "lat_pulldown", tier: "T3", weight: 80, sets: 3, reps: 15 },
];

const squat = (overrides = {}) => makeEntry({ ...overrides });
const bench = (overrides = {}) =>
  makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, weight: 100, ...overrides });

describe("constants", () => {
  it("credits the program tiers at the prescribed weight, judged by completed and failed sets", () => {
    expect(CREDIT_TIERS).toEqual(["T1", "T2", "T3"]);
    expect(CREDIT_MIN_WEIGHT_RATIO).toBe(1);
    expect(CREDIT_DECIDING_STATUSES).toEqual(["completed", "failed"]);
  });
});

describe("classifyEntry from the plan (preview)", () => {
  it("is program for a prescribed lift at its scheme and weight", () => {
    expect(classifyEntry(squat(), PRESCRIBED)).toBe("program");
    expect(classifyEntry(bench(), PRESCRIBED)).toBe("program");
  });

  it("is program when heavier than prescribed", () => {
    expect(classifyEntry(squat({ weight: 200 }), PRESCRIBED)).toBe("program");
  });

  it("is logged-only when lighter than prescribed", () => {
    expect(classifyEntry(squat({ weight: 185 }), PRESCRIBED)).toBe("logged-only");
  });

  it("is logged-only at a different scheme", () => {
    expect(classifyEntry(squat({ targetSets: 4, targetReps: 8 }), PRESCRIBED)).toBe("logged-only");
    expect(classifyEntry(squat({ targetSets: 4 }), PRESCRIBED)).toBe("logged-only");
  });

  it("is logged-only for an exercise the session did not prescribe, or at another tier", () => {
    expect(classifyEntry(squat({ exerciseId: "pendulum_squat" }), PRESCRIBED)).toBe("logged-only");
    expect(classifyEntry(bench({ tier: "T1" }), PRESCRIBED)).toBe("logged-only");
  });

  it("is logged-only for accessories and warm-ups", () => {
    expect(classifyEntry(squat({ tier: "accessory" }), PRESCRIBED)).toBe("logged-only");
    expect(classifyEntry(squat({ tier: "warmup", isWarmUp: true }), PRESCRIBED)).toBe("logged-only");
  });

  it("counts a home substitute by the program weight it stands for", () => {
    const substitute = bench({ weight: 40, originalWeight: 100, substituteExerciseId: "db_bench" });
    expect(classifyEntry(substitute, PRESCRIBED)).toBe("program");
    expect(classifyEntry({ ...substitute, weight: 30, originalWeight: 75 }, PRESCRIBED)).toBe(
      "logged-only"
    );
  });

  it("treats every program-tier entry of a session without a prescription as program", () => {
    expect(classifyEntry(squat({ weight: 50, targetSets: 2 }), undefined)).toBe("program");
    expect(classifyEntry(squat({ tier: "accessory" }), undefined)).toBe("logged-only");
  });
});

describe("classifyEntry from logged sets", () => {
  it("is program for a home substitute: dumbbell weight logged, barbell weight in originalWeight", () => {
    const sets = makeSets("bench", "T2", 3, 10, {
      weight: 40,
      originalWeight: 100,
      isSubstituted: true,
      substituteExerciseId: "db_bench",
      location: "home",
    });
    const entry = bench({ weight: 40, originalWeight: 100 });
    expect(classifyEntry(entry, PRESCRIBED, sets)).toBe("program");
  });

  it("is program for an accepted T2 load drop", () => {
    const sets = [
      ...makeSets("bench", "T2", 1, 10, { weight: 100 }),
      ...makeSets("bench", "T2", 2, 10, {
        weight: 90,
        originalWeight: 100,
        status: "autoregulated_load_drop",
      }),
    ];
    expect(classifyEntry(bench(), PRESCRIBED, sets)).toBe("program");
  });

  it("is program when every set was a load drop or a freeze status", () => {
    const sets = makeSets("squat", "T1", 5, 3, { weight: 150, status: "reduced_run_fatigue" });
    expect(classifyEntry(squat(), PRESCRIBED, sets)).toBe("program");
  });

  it("is not flipped by one mistyped set", () => {
    const sets = [
      ...makeSets("squat", "T1", 4, 3, { weight: 190 }),
      ...makeSets("squat", "T1", 1, 3, { weight: 19 }),
    ];
    expect(classifyEntry(squat(), PRESCRIBED, sets)).toBe("program");
  });

  it("is logged-only when every deciding set is below the prescription", () => {
    const sets = makeSets("squat", "T1", 5, 3, { weight: 185 });
    expect(classifyEntry(squat(), PRESCRIBED, sets)).toBe("logged-only");
    // The stored sets decide, not the entry: a finished set corrected downwards
    // removes the lift's credit.
    expect(classifyEntry(squat({ weight: 190 }), PRESCRIBED, sets)).toBe("logged-only");
  });

  it("counts failed sets at the prescribed weight as a program attempt", () => {
    const sets = makeSets("squat", "T1", 5, 3, { weight: 190, actualReps: 1, status: "failed" });
    expect(classifyEntry(squat(), PRESCRIBED, sets)).toBe("program");
  });

  it("ignores sets of other exercises and tiers", () => {
    const sets = [
      ...makeSets("squat", "warmup", 2, 5, { weight: 95 }),
      ...makeSets("bench", "T2", 3, 10, { weight: 50 }),
    ];
    expect(classifyEntry(squat(), PRESCRIBED, sets)).toBe("program");
  });
});

describe("sessionCountsForRotation", () => {
  const plan = [squat(), bench()];
  const base = { templateId: "A1", plan, prescribed: PRESCRIBED, sets: [], dueTemplateId: "A1" };

  it("counts when no due day is given, as before this rule", () => {
    expect(sessionCountsForRotation({ ...base, templateId: "B2", dueTemplateId: undefined })).toBe(
      true
    );
  });

  it("counts the due day done as prescribed, even when ended before any set", () => {
    expect(sessionCountsForRotation(base)).toBe(true);
  });

  it("does not count a day pulled out of order", () => {
    expect(sessionCountsForRotation({ ...base, templateId: "B1" })).toBe(false);
  });

  it("does not count when the T1 lift was removed, swapped or done lighter", () => {
    expect(sessionCountsForRotation({ ...base, plan: [bench()] })).toBe(false);
    expect(
      sessionCountsForRotation({ ...base, plan: [squat({ exerciseId: "pendulum_squat" }), bench()] })
    ).toBe(false);
    expect(
      sessionCountsForRotation({ ...base, sets: makeSets("squat", "T1", 5, 3, { weight: 150 }) })
    ).toBe(false);
  });

  it("counts when only the T2 or T3 lift was changed", () => {
    expect(
      sessionCountsForRotation({ ...base, plan: [squat(), bench({ exerciseId: "incline_db_press" })] })
    ).toBe(true);
  });

  it("counts a session without a prescription on its due day", () => {
    expect(sessionCountsForRotation({ ...base, prescribed: undefined })).toBe(true);
  });
});
