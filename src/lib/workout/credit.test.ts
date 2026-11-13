import { describe, it, expect } from "vitest";
import type { PlanEdit, PrescribedEntry } from "@/types";
import {
  classifyEntry,
  CREDIT_DECIDING_STATUSES,
  CREDIT_MIN_WEIGHT_RATIO,
  CREDIT_TIERS,
  foldRotation,
  sessionCountsForRotation,
  type RotationSession,
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
  const session = (overrides: Partial<RotationSession> = {}): RotationSession => ({
    templateId: "A1",
    startedAt: new Date("2026-11-12T09:00:00Z"),
    completedAt: new Date("2026-11-12T10:00:00Z"),
    prescribed: PRESCRIBED,
    sets: [],
    ...overrides,
  });

  it("counts the due day done as prescribed, even when ended before any set", () => {
    expect(sessionCountsForRotation(session(), "A1")).toBe(true);
    expect(
      sessionCountsForRotation(session({ sets: makeSets("squat", "T1", 5, 3, { weight: 190 }) }), "A1")
    ).toBe(true);
  });

  it("does not count a day pulled out of order", () => {
    expect(sessionCountsForRotation(session({ templateId: "A1" }), "B1")).toBe(false);
  });

  it("does not count when the T1 lift was removed, swapped or done at another scheme", () => {
    const edits: PlanEdit[] = [
      { kind: "remove", exerciseId: "squat", tier: "T1" },
      { kind: "swap", exerciseId: "squat", tier: "T1", replacementId: "pendulum_squat" },
      { kind: "scheme", exerciseId: "squat", tier: "T1", sets: 4, reps: 8 },
    ];
    for (const edit of edits) {
      expect(sessionCountsForRotation(session({ planEdits: [edit] }), "A1")).toBe(false);
    }
  });

  it("does not count when the T1 sets were all lighter than prescribed", () => {
    const lighter = session({
      planEdits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 150 }],
      sets: makeSets("squat", "T1", 5, 3, { weight: 150 }),
    });
    expect(sessionCountsForRotation(lighter, "A1")).toBe(false);
  });

  it("counts when only the T2 or T3 lift was changed", () => {
    const edited = session({
      planEdits: [
        { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" },
        { kind: "remove", exerciseId: "lat_pulldown", tier: "T3" },
      ],
    });
    expect(sessionCountsForRotation(edited, "A1")).toBe(true);
  });

  it("always counts a session without a prescription, whatever its day", () => {
    expect(sessionCountsForRotation(session({ prescribed: undefined }), "A1")).toBe(true);
    expect(sessionCountsForRotation(session({ prescribed: undefined, templateId: "B2" }), "A1")).toBe(
      true
    );
  });
});

describe("foldRotation", () => {
  const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T09:00:00Z`);
  const done = (templateId: string, day: number, overrides: Partial<RotationSession> = {}) => ({
    id: `${templateId}-${day}`,
    templateId,
    startedAt: at(day),
    completedAt: at(day),
    ...overrides,
  });
  const prescribedT1 = (exerciseId: string): PrescribedEntry[] => [
    { exerciseId, tier: "T1", weight: 100, sets: 5, reps: 3, stage: "5x3" },
  ];

  it("is A1 with no history, and ignores unfinished sessions", () => {
    expect(foldRotation([]).dueTemplateId).toBe("A1");
    expect(foldRotation([done("A1", 1, { completedAt: null })])).toEqual({
      dueTemplateId: "A1",
      sessions: [],
    });
  });

  it("matches the old rule for sessions without a prescription: the day after the latest one", () => {
    expect(foldRotation([done("A1", 1), done("B1", 2)]).dueTemplateId).toBe("A2");
    expect(foldRotation([done("B1", 2), done("A1", 1)]).dueTemplateId).toBe("A2");
    expect(foldRotation([done("B2", 1)]).dueTemplateId).toBe("A1");
    expect(foldRotation([done("A1", 1), done("B2", 2)]).dueTemplateId).toBe("A1");
  });

  it("leaves the due day due after a day pulled out of order", () => {
    const fold = foldRotation([
      done("A1", 1, { prescribed: prescribedT1("squat") }),
      done("B2", 2, { prescribed: prescribedT1("deadlift") }),
    ]);
    expect(fold.dueTemplateId).toBe("B1");
    expect(fold.sessions.map((s) => s.counted)).toEqual([true, false]);
    expect(fold.sessions.map((s) => s.session.id)).toEqual(["A1-1", "B2-2"]);
  });

  it("re-derives later sessions when an earlier one is removed", () => {
    const a1 = done("A1", 1, { prescribed: prescribedT1("squat") });
    const b1 = done("B1", 2, { prescribed: prescribedT1("ohp") });
    expect(foldRotation([a1, b1]).sessions.map((s) => s.counted)).toEqual([true, true]);
    // Without A1, B1 was done while A1 was due: it no longer counts.
    const without = foldRotation([b1]);
    expect(without.sessions.map((s) => s.counted)).toEqual([false]);
    expect(without.dueTemplateId).toBe("A1");
  });

  it("does not advance on a due day whose T1 lift was swapped", () => {
    const fold = foldRotation([
      done("A1", 1, {
        prescribed: prescribedT1("squat"),
        planEdits: [{ kind: "swap", exerciseId: "squat", tier: "T1", replacementId: "pendulum_squat" }],
      }),
    ]);
    expect(fold.dueTemplateId).toBe("A1");
  });
});
