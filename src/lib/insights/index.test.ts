import { describe, it, expect } from "vitest";
import { computeInsights, type InsightContext } from "./index";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import type {
  BodyweightLog,
  Estimated1RM,
  LiftState,
  PainSorenessEntry,
  SetLog,
  Tier,
  UserSettings,
  WorkoutSession,
} from "@/types";

// Wednesday 11 Nov 2026, noon local time.
const NOW = new Date(2026, 10, 11, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    ...DEFAULT_USER_PROFILE.settings,
    morningWeighInReminder: false,
    trainingPhase: { mode: "maintaining" },
    ...overrides,
  };
}

const CUTTING = settings({ trainingPhase: { mode: "cutting" } });

function ctx(overrides: Partial<InsightContext> = {}): InsightContext {
  return {
    workouts: [],
    e1rms: [],
    bodyweight: [],
    runs: [],
    readiness: [],
    pain: [],
    liftStates: [],
    settings: settings(),
    unfinishedWorkout: null,
    now: NOW,
    ...overrides,
  };
}

function lift(id: string, overrides: Partial<LiftState> = {}): LiftState {
  return { ...INITIAL_LIFT_STATES[id], ...overrides };
}

function set(tier: Tier, reps: number, i = 0): SetLog {
  return {
    id: `set-${tier}-${i}`,
    clientId: `set-${tier}-${i}`,
    exerciseId: "squat",
    tier,
    setNumber: i + 1,
    targetReps: reps,
    actualReps: reps,
    weight: 100,
    isAMRAP: false,
    completedAt: NOW,
    restAfterSeconds: 120,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
  };
}

function workout(
  id: string,
  completedAt: Date | null,
  sets: SetLog[] = [],
  templateId = "A1"
): WorkoutSession {
  return {
    id,
    clientId: id,
    templateId,
    location: "gym",
    startedAt: completedAt ? new Date(completedAt.getTime() - 3600_000) : daysAgo(0.1),
    completedAt,
    totalDurationSeconds: 3600,
    includeWarmUps: true,
    selectedAccessories: [],
    sets,
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };
}

function bw(date: Date, weight: number, i = 0): BodyweightLog {
  return { id: `bw-${i}`, clientId: `bw-${i}`, date, weight, timeOfDay: "morning", synced: false } as BodyweightLog;
}

/** One weigh-in a day, ending `endDaysAgo` days ago, going linearly from start to end. */
function bwSeries(start: number, end: number, days: number, endDaysAgo = 0): BodyweightLog[] {
  return Array.from({ length: days }, (_, i) => {
    const weight = Math.round((start + ((end - start) * i) / (days - 1)) * 100) / 100;
    return bw(daysAgo(endDaysAgo + days - 1 - i), weight, i);
  });
}

function e1rm(exerciseId: string, date: Date, value: number, i = 0): Estimated1RM {
  return {
    id: `e1rm-${exerciseId}-${i}`,
    clientId: `e1rm-${exerciseId}-${i}`,
    date,
    exerciseId,
    workingWeight: 200,
    repsCompleted: 5,
    estimated1RM: value,
    workoutSessionId: `w-${i}`,
    synced: false,
  };
}

function pain(id: string, date: Date, overrides: Partial<PainSorenessEntry> = {}): PainSorenessEntry {
  return {
    id,
    clientId: id,
    date,
    region: "lower_back",
    sensation: "pain",
    severity: 3,
    synced: false,
    ...overrides,
  };
}

const kinds = (c: InsightContext) => computeInsights(c).map((i) => i.kind);

describe("computeInsights: general", () => {
  it("returns [] for an empty context with settings null", () => {
    expect(computeInsights(ctx({ settings: null }))).toEqual([]);
  });

  it("returns [] for an empty context with default settings", () => {
    expect(computeInsights(ctx())).toEqual([]);
  });

  it("is deterministic", () => {
    const c = ctx({
      settings: settings({ morningWeighInReminder: true }),
      unfinishedWorkout: workout("u1", null, [set("T1", 3)]),
      pain: [pain("p1", daysAgo(9)), pain("p2", daysAgo(10), { region: "neck" })],
      e1rms: [e1rm("squat", daysAgo(10), 240, 0), e1rm("squat", daysAgo(2), 250, 1)],
      workouts: [workout("w1", daysAgo(8))],
    });
    expect(computeInsights(c)).toEqual(computeInsights(c));
  });

  it("orders by severity, then kind, then id", () => {
    const c = ctx({
      settings: settings({ morningWeighInReminder: true }),
      unfinishedWorkout: workout("u1", null, [set("T1", 3)]),
      pain: [pain("p2", daysAgo(9)), pain("p1", daysAgo(10), { region: "neck" })],
      workouts: [workout("w1", daysAgo(5.5))],
      e1rms: [
        e1rm("squat", daysAgo(20), 240, 0),
        e1rm("squat", daysAgo(2), 250, 1),
        e1rm("bench", daysAgo(20), 180, 2),
        e1rm("bench", daysAgo(3), 185, 3),
      ],
      liftStates: [lift("deadlift", { recentE1RMs: [300, 295, 290] })],
    });
    const ids = computeInsights(c).map((i) => i.id);
    expect(ids).toEqual([
      "unfinished-workout:u1",
      "weigh-in-due",
      "pain-check:p1",
      "pain-check:p2",
      "inactivity",
      "strength-stall:deadlift",
      "new-pr:bench",
      "new-pr:squat",
    ]);
  });

  it("never uses exclamation marks", () => {
    const c = ctx({
      settings: settings({ morningWeighInReminder: true, trainingPhase: { mode: "cutting" } }),
      unfinishedWorkout: workout("u1", null),
      pain: [pain("p1", daysAgo(9))],
      workouts: [workout("w1", daysAgo(30))],
      e1rms: [e1rm("squat", daysAgo(20), 240, 0), e1rm("squat", daysAgo(2), 250, 1)],
      bodyweight: bwSeries(200, 197.2, 14),
    });
    for (const i of computeInsights(c)) {
      expect(i.title + i.body).not.toMatch(/!/);
      expect(i.title).not.toMatch(/\.$/);
    }
  });
});

describe("unfinished-workout", () => {
  it("offers to resume with the set count", () => {
    const u = workout("abc", null, [set("warmup", 5, 0), set("T1", 3, 1), set("T1", 3, 2), set("T2", 10, 3)]);
    expect(computeInsights(ctx({ unfinishedWorkout: u }))).toEqual([
      {
        id: "unfinished-workout:abc",
        kind: "unfinished-workout",
        severity: "action",
        title: "Unfinished workout",
        body: "Workout A1 has 3 working sets logged. Resume it to pick up where you left off.",
        action: { label: "Resume", href: "/workout/active?sessionId=abc" },
      },
    ]);
  });

  it("handles no sets and one set", () => {
    expect(computeInsights(ctx({ unfinishedWorkout: workout("x", null, [], "B2") }))[0].body).toBe(
      "Workout B2 was started but has no working sets logged. Resume it to pick up where you left off."
    );
    expect(computeInsights(ctx({ unfinishedWorkout: workout("x", null, [set("T1", 3)]) }))[0].body).toBe(
      "Workout A1 has 1 working set logged. Resume it to pick up where you left off."
    );
  });

  it("is absent without an unfinished workout", () => {
    expect(kinds(ctx())).not.toContain("unfinished-workout");
  });
});

describe("weigh-in-due", () => {
  const on = settings({ morningWeighInReminder: true });

  it("asks for a weight when none is logged today", () => {
    expect(computeInsights(ctx({ settings: on, bodyweight: [bw(daysAgo(2), 226.4)] }))).toEqual([
      {
        id: "weigh-in-due",
        kind: "weigh-in-due",
        severity: "action",
        title: "Log today's weight",
        body: "No weight logged today. Last entry: 226.4 lbs, 2 days ago.",
        action: { label: "Log weight", href: "/weigh-in" },
      },
    ]);
  });

  it("says when nothing has been logged yet", () => {
    expect(computeInsights(ctx({ settings: on }))[0].body).toBe("No weight logged yet.");
  });

  it("is absent when today's weight is logged (even early this morning)", () => {
    const early = new Date(2026, 10, 11, 0, 5);
    expect(kinds(ctx({ settings: on, bodyweight: [bw(early, 226)] }))).not.toContain("weigh-in-due");
  });

  it("treats yesterday late evening as not today", () => {
    const late = new Date(2026, 10, 10, 23, 55);
    expect(computeInsights(ctx({ settings: on, bodyweight: [bw(late, 226)] }))[0].body).toBe(
      "No weight logged today. Last entry: 226 lbs, yesterday."
    );
  });

  it("is absent when the reminder is off or settings are null", () => {
    expect(kinds(ctx())).not.toContain("weigh-in-due");
    expect(kinds(ctx({ settings: null }))).not.toContain("weigh-in-due");
  });

  it("accepts ISO string dates from synced rows", () => {
    const row = bw(NOW, 226);
    (row as unknown as { date: string }).date = new Date(2026, 10, 11, 7).toISOString();
    expect(kinds(ctx({ settings: on, bodyweight: [row] }))).not.toContain("weigh-in-due");
  });
});

describe("inactivity", () => {
  it("gentle level is info", () => {
    expect(computeInsights(ctx({ workouts: [workout("w", daysAgo(5.5))] }))).toEqual([
      {
        id: "inactivity",
        kind: "inactivity",
        severity: "info",
        title: "5 days since your last workout",
        body: "A few days off costs no strength. Your next workout is ready when you are.",
        evidenceId: "time-off",
      },
    ]);
  });

  it("urgent level is a warning", () => {
    const [i] = computeInsights(ctx({ workouts: [workout("w", daysAgo(10))] }));
    expect(i.severity).toBe("warning");
    expect(i.title).toBe("10 days since your last workout");
    expect(i.body).toBe(
      "Up to 20 days off changes nothing in the program, so you can pick up at your current weights."
    );
  });

  it("detraining level is a warning and mentions lighter weights", () => {
    const [i] = computeInsights(ctx({ workouts: [workout("old", daysAgo(40)), workout("w", daysAgo(25))] }));
    expect(i.severity).toBe("warning");
    expect(i.title).toBe("25 days since your last workout");
    expect(i.body).toBe(
      "After 21 or more days off, workout setup suggests lighter starting weights. You can keep your old weights if they feel right."
    );
  });

  it("is absent with a recent workout or with no workouts at all", () => {
    expect(kinds(ctx({ workouts: [workout("w", daysAgo(2))] }))).not.toContain("inactivity");
    expect(kinds(ctx())).not.toContain("inactivity");
  });
});

describe("deload", () => {
  it("flags a single lift whose e1RM fell for the phase's number of sessions", () => {
    const c = ctx({
      settings: CUTTING,
      liftStates: [lift("squat", { recentE1RMs: [260, 250, 245, 240] })],
    });
    expect(computeInsights(c)).toEqual([
      {
        id: "deload:squat",
        kind: "deload",
        severity: "warning",
        title: "Fatigue sign on Barbell Squat",
        body: "Estimated 1RM has dropped 2 sessions in a row: 250, 245, 240 lbs. If you feel run down, an easier week is optional; one better session clears this.",
        evidenceId: "fatigue-detection",
      },
    ]);
  });

  it("gives one systemic insight when two or more lifts are flagged", () => {
    const c = ctx({
      settings: CUTTING,
      liftStates: [
        lift("squat", { recentE1RMs: [250, 245, 240] }),
        lift("bench", { recentE1RMs: [190, 185, 180] }),
        lift("ohp", { recentE1RMs: [100, 105, 110] }),
      ],
    });
    expect(computeInsights(c)).toEqual([
      {
        id: "deload:systemic",
        kind: "deload",
        severity: "warning",
        title: "Fatigue signs on 2 lifts",
        body: "Estimated 1RM has dropped 2 sessions in a row on Barbell Bench Press and Barbell Squat. If you feel run down, an easier week is optional.",
        evidenceId: "fatigue-detection",
      },
    ]);
  });

  it("needs more sessions when maintaining (3), so 2 drops is only a strength stall", () => {
    const c = ctx({ liftStates: [lift("squat", { recentE1RMs: [250, 245, 240] })] });
    expect(kinds(c)).toEqual(["strength-stall"]);
    const c2 = ctx({ liftStates: [lift("squat", { recentE1RMs: [255, 250, 245, 240] })] });
    expect(kinds(c2)).toEqual(["deload"]);
  });

  it("ignores RPE and AMRAP trends (not comparable across loads)", () => {
    const c = ctx({
      settings: CUTTING,
      liftStates: [
        lift("squat", { recentAvgRPEs: [7, 8, 9], recentAMRAPReps: [8, 6, 4] }),
        lift("bench", { recentAvgRPEs: [7, 8, 9], recentAMRAPReps: [8, 6, 4] }),
      ],
    });
    expect(kinds(c)).not.toContain("deload");
  });

  it("skips lifts already in a deload and needs settings", () => {
    const declining = { recentE1RMs: [250, 245, 240] };
    expect(kinds(ctx({ settings: CUTTING, liftStates: [lift("squat", { ...declining, deloadActive: true })] }))).toEqual([]);
    expect(kinds(ctx({ settings: null, liftStates: [lift("squat", declining)] }))).not.toContain("deload");
  });
});

describe("strength-stall", () => {
  it("reports a falling e1RM trend", () => {
    expect(computeInsights(ctx({ liftStates: [lift("bench", { recentE1RMs: [190, 185, 180] })] }))).toEqual([
      {
        id: "strength-stall:bench",
        kind: "strength-stall",
        severity: "info",
        title: "Barbell Bench Press estimated 1RM down",
        body: "The last three estimated 1RMs were 190, 185 and 180 lbs. Sleep, food and stress usually show up here first.",
        evidenceId: "e1rm-estimate",
      },
    ]);
  });

  it("reports T1 on 10x1 after failures, with the reset weight", () => {
    const c = ctx({ liftStates: [lift("squat", { t1Stage: "10x1", t1FailCount: 2, t1Weight: 225 })] });
    expect(computeInsights(c)).toEqual([
      {
        id: "strength-stall:squat",
        kind: "strength-stall",
        severity: "info",
        title: "Barbell Squat T1 on its last stage",
        body: "T1 is at 10x1 with 225 lbs after 2 failed sessions. If 10x1 fails, T1 resets to 190 lbs at 5x3.",
        evidenceId: "gzclp-progression",
      },
    ]);
  });

  it("gives one insight per lift when both apply", () => {
    const c = ctx({
      liftStates: [lift("squat", { t1Stage: "10x1", t1FailCount: 1, recentE1RMs: [250, 245, 240] })],
    });
    const out = computeInsights(c);
    expect(out).toHaveLength(1);
    expect(out[0].body).toContain("after 1 failed session.");
  });

  it("is absent for rising, flat or short series and for 10x1 without fails", () => {
    const c = ctx({
      liftStates: [
        lift("squat", { recentE1RMs: [240, 245, 250] }),
        lift("bench", { recentE1RMs: [180, 185, 180] }),
        lift("deadlift", { recentE1RMs: [300, 290] }),
        lift("ohp", { t1Stage: "10x1", t1FailCount: 0 }),
      ],
    });
    expect(kinds(c)).toEqual([]);
  });
});

describe("loss-rate", () => {
  it("is positive when on pace", () => {
    const c = ctx({ settings: CUTTING, bodyweight: bwSeries(200, 197.2, 14) });
    const out = computeInsights(c);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "loss-rate",
      kind: "loss-rate",
      severity: "positive",
      title: "Weight loss on pace",
      evidenceId: "rate-of-loss",
    });
    expect(out[0].body).toMatch(/^Losing \d+\.\d lbs a week \(0\.\d+% of bodyweight\), inside the 0\.5 to 1% target\.$/);
  });

  it("gives the exact numbers", () => {
    // 7 days at 201 then 7 days at 199: 2 lbs over 7 days between half-midpoints.
    const entries = [
      ...Array.from({ length: 7 }, (_, i) => bw(daysAgo(13 - i), 201, i)),
      ...Array.from({ length: 7 }, (_, i) => bw(daysAgo(6 - i), 199, 7 + i)),
    ];
    const [i] = computeInsights(ctx({ settings: CUTTING, bodyweight: entries }));
    expect(i.body).toBe("Losing 2.0 lbs a week (1% of bodyweight), inside the 0.5 to 1% target.");
  });

  it("warns when faster than target", () => {
    const [i] = computeInsights(ctx({ settings: CUTTING, bodyweight: bwSeries(200, 193, 14) }));
    expect(i.severity).toBe("warning");
    expect(i.title).toBe("Weight loss faster than target");
    expect(i.body).toMatch(/^Losing \d+\.\d lbs a week \([\d.]+% of bodyweight\)\. The target is 0\.5 to 1% a week\.$/);
  });

  it("warns when slower than target", () => {
    const [i] = computeInsights(ctx({ settings: CUTTING, bodyweight: bwSeries(200, 199, 14) }));
    expect(i.severity).toBe("warning");
    expect(i.title).toBe("Weight loss slower than target");
  });

  it("warns when weight is going up during a cut", () => {
    // 7 days at 199 then 7 days at 201: up 2 lbs a week.
    const entries = [
      ...Array.from({ length: 7 }, (_, i) => bw(daysAgo(13 - i), 199, i)),
      ...Array.from({ length: 7 }, (_, i) => bw(daysAgo(6 - i), 201, 7 + i)),
    ];
    expect(computeInsights(ctx({ settings: CUTTING, bodyweight: entries }))).toEqual([
      {
        id: "loss-rate",
        kind: "loss-rate",
        severity: "warning",
        title: "Weight is going up",
        body: "Gaining 2.0 lbs a week (1.01% of bodyweight). The target while cutting is to lose 0.5 to 1% a week.",
        evidenceId: "rate-of-loss",
      },
    ]);
  });

  it("three weeks of gaining is reported as gaining, not as a stall", () => {
    expect(kinds(ctx({ settings: CUTTING, bodyweight: bwSeries(200, 206, 21) }))).toEqual([
      "loss-rate",
    ]);
  });

  it("is absent when not cutting, with too few or stale entries", () => {
    expect(kinds(ctx({ bodyweight: bwSeries(200, 197.2, 14) }))).toEqual([]);
    expect(kinds(ctx({ settings: CUTTING, bodyweight: bwSeries(200, 199, 5) }))).toEqual([]);
    expect(kinds(ctx({ settings: CUTTING, bodyweight: bwSeries(200, 197.2, 14, 30) }))).toEqual([]);
  });
});

describe("fat-loss-stall", () => {
  const flat = () => bwSeries(200, 200, 21);

  it("flags a stall of three or more weeks with the protocol suggestion", () => {
    expect(computeInsights(ctx({ settings: CUTTING, bodyweight: flat() }))).toEqual([
      {
        id: "fat-loss-stall",
        kind: "fat-loss-stall",
        severity: "warning",
        title: "Weight loss stalled for 3 weeks",
        body: "Weight loss has stalled. 7-day avg: 200.0 lbs (was 200.0 lbs). Increase daily steps by 2,000 before cutting calories further.",
        evidenceId: "fat-loss-stall",
      },
    ]);
  });

  it("suggests a calorie cut after five weeks", () => {
    const [i] = computeInsights(ctx({ settings: CUTTING, bodyweight: bwSeries(200, 200, 35) }));
    expect(i.title).toBe("Weight loss stalled for 5 weeks");
    expect(i.body).toContain("Consider reducing daily intake by 100-150 calories.");
  });

  it("stays quiet for a short slow patch (under three weeks)", () => {
    expect(kinds(ctx({ settings: CUTTING, bodyweight: bwSeries(200, 200, 14) }))).toEqual([]);
  });

  it("is absent when losing normally or not cutting", () => {
    expect(kinds(ctx({ settings: CUTTING, bodyweight: bwSeries(206, 197.2, 35) }))).not.toContain("fat-loss-stall");
    expect(kinds(ctx({ bodyweight: flat() }))).toEqual([]);
  });

  it("is the only bodyweight insight during a stall (precedence itself: precedence.test.ts)", () => {
    const k = kinds(ctx({ settings: CUTTING, bodyweight: flat() }));
    expect(k).toEqual(["fat-loss-stall"]);
  });
});

describe("pain-check", () => {
  it("asks about each pain entry older than 7 days", () => {
    expect(computeInsights(ctx({ pain: [pain("p1", daysAgo(9), { region: "left_knee", severity: 2 })] }))).toEqual([
      {
        id: "pain-check:p1",
        kind: "pain-check",
        severity: "action",
        title: "Is your left knee pain still there?",
        body: "You logged it 9 days ago (severity 2 of 5). Mark it resolved if it has cleared, or keep it if not.",
        evidenceId: "training-with-pain",
        action: { label: "Review", href: "/body-check" },
      },
    ]);
  });

  it("ignores recent pain and old soreness", () => {
    const c = ctx({
      pain: [pain("p1", daysAgo(3)), pain("s1", daysAgo(20), { sensation: "soreness" })],
    });
    expect(kinds(c)).toEqual([]);
  });
});

describe("new-pr", () => {
  it("celebrates a recent best with the gain", () => {
    const c = ctx({
      e1rms: [
        e1rm("squat", daysAgo(30), 235, 0),
        e1rm("squat", daysAgo(20), 240, 1),
        e1rm("squat", daysAgo(10), 238, 2),
        e1rm("squat", daysAgo(1), 247, 3),
      ],
    });
    expect(computeInsights(c)).toEqual([
      {
        id: "new-pr:squat",
        kind: "new-pr",
        severity: "positive",
        title: "New best on Barbell Squat",
        body: "Estimated 1RM 247 lbs, up 7 lbs on your previous best of 240 lbs.",
        evidenceId: "e1rm-estimate",
      },
    ]);
  });

  it("works when rows are out of order", () => {
    const c = ctx({ e1rms: [e1rm("bench", daysAgo(2), 190, 1), e1rm("bench", daysAgo(9), 185, 0)] });
    expect(computeInsights(c).map((i) => i.id)).toEqual(["new-pr:bench"]);
  });

  it("is absent for an old best, a non-best latest, a tie, or a first-ever entry", () => {
    expect(kinds(ctx({ e1rms: [e1rm("squat", daysAgo(30), 230, 0), e1rm("squat", daysAgo(9), 240, 1)] }))).toEqual([]);
    expect(kinds(ctx({ e1rms: [e1rm("squat", daysAgo(30), 250, 0), e1rm("squat", daysAgo(1), 240, 1)] }))).toEqual([]);
    expect(kinds(ctx({ e1rms: [e1rm("squat", daysAgo(30), 240, 0), e1rm("squat", daysAgo(1), 240, 1)] }))).toEqual([]);
    expect(kinds(ctx({ e1rms: [e1rm("squat", daysAgo(1), 240, 0)] }))).toEqual([]);
  });
});
