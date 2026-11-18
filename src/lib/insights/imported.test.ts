// Insights with sessions imported from other apps (made-up sessions only).
import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import type { LiftState, WorkoutSession } from "@/types";
import { computeInsights, type InsightContext } from "./index";

// Wednesday 11 Nov 2026, noon local time.
const NOW = new Date(2026, 10, 11, 12);

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
}

function ctx(overrides: Partial<InsightContext> = {}): InsightContext {
  return {
    workouts: [],
    e1rms: [],
    bodyweight: [],
    runs: [],
    readiness: [],
    pain: [],
    liftStates: [],
    settings: { ...DEFAULT_USER_PROFILE.settings, morningWeighInReminder: false, trainingPhase: { mode: "maintaining" } },
    unfinishedWorkout: null,
    now: NOW,
    ...overrides,
  };
}

const lift = (id: string, overrides: Partial<LiftState> = {}): LiftState => ({ ...INITIAL_LIFT_STATES[id], ...overrides });

function workout(id: string, completedAt: Date): WorkoutSession {
  return {
    id,
    clientId: id,
    templateId: "A1",
    location: "gym",
    startedAt: completedAt,
    completedAt,
    totalDurationSeconds: 3600,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };
}

/** A made-up imported squat session: one working set. */
const squat = (startedAt: Date, weight = 200, reps = 5) =>
  importedSession([importedSet({ exerciseName: "Made-up Squat", mappedExerciseId: "squat", weightPerImplementLb: weight, reps })], {
    startedAt,
  });

const ids = (c: InsightContext) => computeInsights(c).map((i) => i.id);

describe("inactivity with imported sessions (H2)", () => {
  it("counts an imported session as the last workout", () => {
    const c = ctx({ workouts: [workout("w", daysAgo(10))], imported: [squat(daysAgo(2))] });
    expect(ids(c)).not.toContain("inactivity");
  });

  it("gives the days since the later of the two", () => {
    const c = ctx({ workouts: [workout("w", daysAgo(30))], imported: [squat(daysAgo(6))] });
    const insight = computeInsights(c).find((i) => i.id === "inactivity")!;
    expect(insight.title).toBe("6 days since your last workout");
  });

  it("reports a break for a lifter whose only history is imported, and ignores deleted imports", () => {
    expect(computeInsights(ctx({ imported: [squat(daysAgo(9))] })).find((i) => i.id === "inactivity")?.title).toBe(
      "9 days since your last workout"
    );
    expect(ids(ctx({ imported: [{ ...squat(daysAgo(1)), deletedAt: 1 }] }))).not.toContain("inactivity");
  });
});

describe("strength-stall with imported sessions (H2)", () => {
  it("reads the e1RM trend of imported sessions after the lift's last app session", () => {
    const c = ctx({
      liftStates: [lift("squat", { recentE1RMs: [250, 255], t1LastWorkoutDate: daysAgo(30) })],
      imported: [squat(daysAgo(40), 300), squat(daysAgo(10), 205), squat(daysAgo(3), 200)],
    });
    const insight = computeInsights(c).find((i) => i.id === "strength-stall:squat");
    expect(insight).toBeDefined();
    // 255 in the app, then the two imported sessions after it (5 reps: weight x (1 + 5/30)).
    expect(insight!.body).toContain("255, 239 and 233 lbs");
  });

  it("uses imported sessions alone for a lift never trained in the app", () => {
    const c = ctx({
      liftStates: [lift("squat")],
      imported: [squat(daysAgo(20), 220), squat(daysAgo(10), 210), squat(daysAgo(3), 200)],
    });
    expect(ids(c)).toContain("strength-stall:squat");
  });

  it("leaves the trend alone when no imported session came after the app's last one", () => {
    const c = ctx({
      liftStates: [lift("squat", { recentE1RMs: [240, 245, 250], t1LastWorkoutDate: daysAgo(2) })],
      imported: [squat(daysAgo(10), 150)],
    });
    expect(ids(c)).not.toContain("strength-stall:squat");
  });
});
