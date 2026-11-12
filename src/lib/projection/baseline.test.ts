import { describe, it, expect } from "vitest";
import type { MetricSource } from "@/lib/metrics/types";
import type { SetLog, SetStatus, Tier, UserSettings, WorkoutSession } from "@/types";
import { measureBaseline } from "./index";
import { BASELINE_MAX_WEEKS } from "./baseline";

const NOW = new Date(2026, 2, 30, 18);
const DAY = 24 * 60 * 60 * 1000;

let counter = 0;

function sets(
  exerciseId: string,
  tier: Tier,
  count: number,
  targetReps: number,
  overrides: Partial<SetLog> = {}
): SetLog[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${++counter}`,
    clientId: `s${counter}`,
    exerciseId,
    tier,
    setNumber: i + 1,
    targetReps,
    actualReps: targetReps,
    weight: 200,
    isAMRAP: i === count - 1,
    completedAt: NOW,
    restAfterSeconds: 120,
    status: "completed" as SetStatus,
    isSubstituted: false,
    location: "gym" as const,
    synced: false,
    ...overrides,
  }));
}

function workout(daysAgo: number, workoutSets: SetLog[]): WorkoutSession {
  const startedAt = new Date(NOW.getTime() - daysAgo * DAY);
  return {
    id: `w${++counter}`,
    clientId: `w${counter}`,
    templateId: "A1",
    location: "gym",
    startedAt,
    completedAt: new Date(startedAt.getTime() + 3600 * 1000),
    totalDurationSeconds: 3600,
    includeWarmUps: true,
    selectedAccessories: [],
    sets: workoutSets,
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };
}

function source(workouts: WorkoutSession[], phase?: UserSettings["trainingPhase"]["mode"]): MetricSource {
  return {
    workouts,
    e1rms: [],
    bodyweight: [],
    runs: [],
    readiness: [],
    pain: [],
    liftStates: [],
    settings: phase
      ? ({ trainingPhase: { mode: phase } } as unknown as UserSettings)
      : null,
  };
}

function failLast(list: SetLog[]): SetLog[] {
  return list.map((s, i) =>
    i === list.length - 1 ? { ...s, actualReps: s.targetReps - 1, status: "failed" as SetStatus } : s
  );
}

describe("measureBaseline", () => {
  // Four weeks of history: the first workout is exactly 28 days before `now`.
  const history = [
    workout(28, [...sets("squat", "warmup", 3, 5), ...sets("squat", "T1", 5, 3)]),
    workout(25, [...sets("bench", "T1", 5, 3), ...sets("squat", "T2", 3, 10)]),
    workout(21, failLast(sets("squat", "T1", 5, 3))),
    workout(18, sets("bench", "T1", 5, 3)),
    workout(14, sets("squat", "T1", 5, 3)),
    workout(11, [...sets("bench", "T1", 5, 3), ...sets("squat", "T2", 3, 10)]),
    workout(7, sets("squat", "T1", 5, 3)),
    // Pain skip: not a session for the lift, no volume, neither pass nor fail.
    workout(3, sets("squat", "T1", 5, 3, { status: "skipped_pain", actualReps: 0 })),
  ];

  it("measures frequency, weekly sets, pass rate and phase over the window", () => {
    const baseline = measureBaseline(source(history, "cutting"), "squat", NOW);
    expect(baseline.exerciseId).toBe("squat");
    expect(baseline.windowWeeks).toBeCloseTo(4, 9);
    // 4 T1 sessions + 2 T2 sessions actually trained, over 4 weeks.
    expect(baseline.sessionsPerWeek).toBeCloseTo(6 / 4, 9);
    // 4 x 5 T1 sets + 2 x 3 T2 sets; warm-ups and pain skips earn nothing.
    expect(baseline.directWeeklySets).toBeCloseTo(26 / 4, 9);
    // Bench does not train the squat's primary muscles.
    expect(baseline.relatedWeeklySets).toBe(0);
    // Squat: quads and glutes primary (1 a set), adductors and lower back secondary (0.5).
    expect(baseline.byMuscle.map((m) => m.muscle)).toEqual([
      "quads",
      "glutes",
      "adductors",
      "lower_back",
    ]);
    expect(baseline.byMuscle.map((m) => m.weeklySets)).toEqual([
      26 / 4,
      26 / 4,
      13 / 4,
      13 / 4,
    ]);
    // 3 of the 4 counted T1 sessions were passed.
    expect(baseline.passRate).toBeCloseTo(3 / 4, 9);
    expect(baseline.phase).toBe("cutting");
  });

  it("does not depend on the order of the workouts", () => {
    const reversed = measureBaseline(source([...history].reverse()), "squat", NOW);
    const forward = measureBaseline(source(history), "squat", NOW);
    expect(reversed).toEqual(forward);
  });

  it("credits other exercises to the lift's primary muscles as related sets", () => {
    const direct = measureBaseline(source(history), "squat", NOW).directWeeklySets;

    // Goblet squat trains quads and glutes as primary muscles: 1 a set.
    const withPrimary = [...history, workout(2, sets("goblet_squat", "T3", 3, 15))];
    const a = measureBaseline(source(withPrimary), "squat", NOW);
    expect(a.relatedWeeklySets).toBeCloseTo(3 / 4, 9);
    expect(a.directWeeklySets).toBe(direct);
    expect(a.sessionsPerWeek).toBeCloseTo(6 / 4, 9);
    expect(a.byMuscle.find((m) => m.muscle === "quads")!.weeklySets).toBeCloseTo(29 / 4, 9);

    // Back extensions train glutes only as a secondary muscle: 0.5 a set.
    const withSecondary = [...history, workout(2, sets("back_extensions", "T3", 4, 15))];
    const b = measureBaseline(source(withSecondary), "squat", NOW);
    expect(b.relatedWeeklySets).toBeCloseTo((4 * 0.5) / 4, 9);
    expect(b.byMuscle.find((m) => m.muscle === "glutes")!.weeklySets).toBeCloseTo(28 / 4, 9);
    expect(b.byMuscle.find((m) => m.muscle === "quads")!.weeklySets).toBeCloseTo(26 / 4, 9);
  });

  it("counts a substitute done in the lift's slot as related, not direct", () => {
    const substituted = [
      ...history,
      workout(
        1,
        sets("squat", "T1", 5, 3, { isSubstituted: true, substituteExerciseId: "goblet_squat" })
      ),
    ];
    const baseline = measureBaseline(source(substituted), "squat", NOW);
    expect(baseline.directWeeklySets).toBeCloseTo(26 / 4, 9);
    expect(baseline.relatedWeeklySets).toBeCloseTo(5 / 4, 9);
  });

  it("defaults to maintaining without settings, and pass rate 1 without T1 sessions", () => {
    const baseline = measureBaseline(source(history), "bench", NOW);
    expect(baseline.phase).toBe("maintaining");
    expect(baseline.passRate).toBe(1);

    const t2Only = measureBaseline(
      source([workout(10, sets("ohp", "T2", 3, 10)), workout(3, sets("ohp", "T2", 3, 10))]),
      "ohp",
      NOW
    );
    expect(t2Only.passRate).toBe(1);
    expect(t2Only.sessionsPerWeek).toBeGreaterThan(0);
  });

  it("caps the window and ignores workouts before it or after now", () => {
    const long = [
      workout(20 * 7, sets("squat", "T1", 5, 3)),
      workout(BASELINE_MAX_WEEKS * 7 + 1, failLast(sets("squat", "T1", 5, 3))),
      workout(7, sets("squat", "T1", 5, 3)),
      workout(-2, failLast(sets("squat", "T1", 5, 3))),
    ];
    const baseline = measureBaseline(source(long), "squat", NOW);
    expect(baseline.windowWeeks).toBe(BASELINE_MAX_WEEKS);
    expect(baseline.sessionsPerWeek).toBeCloseTo(1 / BASELINE_MAX_WEEKS, 9);
    expect(baseline.directWeeklySets).toBeCloseTo(5 / BASELINE_MAX_WEEKS, 9);
    expect(baseline.passRate).toBe(1);
  });

  it("divides by at least one week when history is very short", () => {
    const baseline = measureBaseline(source([workout(2, sets("squat", "T1", 5, 3))]), "squat", NOW);
    expect(baseline.windowWeeks).toBe(1);
    expect(baseline.sessionsPerWeek).toBe(1);
    expect(baseline.directWeeklySets).toBe(5);
  });

  it("returns zeros for no history or an unknown exercise, without throwing", () => {
    const empty = measureBaseline(source([]), "squat", NOW);
    expect(empty).toMatchObject({
      sessionsPerWeek: 0,
      directWeeklySets: 0,
      relatedWeeklySets: 0,
      passRate: 1,
      windowWeeks: 0,
    });
    expect(empty.byMuscle.every((m) => m.weeklySets === 0)).toBe(true);

    const unknown = measureBaseline(source(history), "not_a_lift", NOW);
    expect(unknown).toMatchObject({
      sessionsPerWeek: 0,
      directWeeklySets: 0,
      relatedWeeklySets: 0,
      byMuscle: [],
      passRate: 1,
    });
  });

  it("accepts ISO-string dates on synced rows", () => {
    const stringly = history.map(
      (w) => ({ ...w, startedAt: w.startedAt.toISOString() }) as unknown as WorkoutSession
    );
    expect(measureBaseline(source(stringly), "squat", NOW)).toEqual(
      measureBaseline(source(history), "squat", NOW)
    );
  });
});
