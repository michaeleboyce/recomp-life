// The weekly review's lift rows count the lift's home versions (Q3). Made-up sessions only.
import { describe, expect, it } from "vitest";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { strengthTimeline } from "@/lib/strength";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import type { SetLog, WorkoutSession } from "@/types";
import { buildWeeklyReview } from "./index";
import { AFTER, OPTS, WEEK, fixture } from "./testFixture";
import type { ReviewSource } from "./types";

// Review week: Mon 2 Nov to Sun 8 Nov 2026 (local).
const dbBench = (perHand: number, reps = 8) =>
  makeImportedSet({
    exerciseName: "Made-up DB Bench",
    mappedExerciseId: "db_bench",
    weightPerImplementLb: perHand,
    implementCount: 2,
    reps,
  });

/** A finished app workout at home where the bench was done as a dumbbell bench (a substitute). */
function homeWorkout(id: string, at: Date, perHand: number, reps: number): WorkoutSession {
  const set: SetLog = {
    id: `${id}-s1`,
    clientId: `${id}-cs1`,
    exerciseId: "bench",
    substituteExerciseId: "db_bench",
    isSubstituted: true,
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: reps,
    weight: perHand,
    isAMRAP: true,
    completedAt: at,
    restAfterSeconds: 0,
    status: "completed",
    location: "home",
    synced: false,
  };
  return {
    id,
    clientId: `c${id}`,
    templateId: "B1",
    location: "home",
    startedAt: at,
    completedAt: at,
    totalDurationSeconds: 3600,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [set],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };
}

/** The value the lift chart gives a session, in the lift's pounds. */
function chartValue(source: ReviewSource, sessionId: string): number {
  const sets = strengthEvidenceOf(source.workouts, source.imported ?? [], source.overrides);
  return strengthTimeline("bench", sets, { now: AFTER.getTime() }).points.find((p) => p.sessionId === sessionId)!.value;
}

const bench = (r: ReturnType<typeof buildWeeklyReview>) => r.lifts.find((l) => l.id === "bench")!;

describe("weekly review lift rows with home versions (Q3)", () => {
  const plain = buildWeeklyReview(fixture(), [], WEEK, AFTER, OPTS);

  it("counts an imported home version and an app substitute as sessions at home", () => {
    const source = {
      ...fixture(),
      workouts: [...fixture().workouts, homeWorkout("h1", new Date(2026, 10, 6, 18), 40, 8)],
      imported: [makeImportedSession([dbBench(30)], { id: "ih", startedAt: new Date(2026, 10, 7, 9) })],
    };
    const row = bench(buildWeeklyReview(source, [], WEEK, AFTER, OPTS));
    expect(row.sessions).toBe(bench(plain).sessions + 2);
    expect(row.homeSessions).toBe(2);
    expect(row.importedSessions).toBe(1);
    // Both are lighter than the app's 175 this week: the best stays the barbell's.
    expect(row.bestE1RM).toBe(bench(plain).bestE1RM);
    expect(row.bestFrom).toBeNull();
    expect(bench(plain).homeSessions).toBe(0);
  });

  it("takes the week's best from a home version, converted as the lift chart converts it, never a new best", () => {
    const source = {
      ...fixture(),
      imported: [makeImportedSession([dbBench(70, 8)], { id: "heavy", startedAt: new Date(2026, 10, 5, 9) })],
    };
    const row = bench(buildWeeklyReview(source, [], WEEK, AFTER, OPTS));
    expect(row.bestE1RM).toBeCloseTo(chartValue(source, "heavy"), 6);
    expect(row.bestE1RM!).toBeGreaterThan(175);
    expect(row.bestFrom).toBe("db_bench");
    expect(row.bestImported).toBe(true);
    expect(row.bestWorkoutId).toBe("heavy");
    expect(row.isPR).toBe(false);
  });

  it("gives a week with only a dumbbell bench a session and an estimate", () => {
    const week = new Date(2026, 10, 9);
    const source = {
      ...fixture(),
      workouts: [...fixture().workouts, homeWorkout("h2", new Date(2026, 10, 11, 18), 50, 6)],
    };
    const before = bench(buildWeeklyReview(fixture(), [], week, AFTER, OPTS));
    expect(before.sessions).toBe(0);
    expect(before.bestE1RM).toBeNull();
    const row = bench(buildWeeklyReview(source, [], week, AFTER, OPTS));
    expect(row.sessions).toBe(1);
    expect(row.homeSessions).toBe(1);
    expect(row.importedSessions).toBe(0);
    expect(row.bestE1RM).toBeCloseTo(chartValue(source, "h2"), 6);
    expect(row.bestFrom).toBe("db_bench");
    expect(row.bestImported).toBe(false);
    expect(row.isPR).toBe(false);
  });

  it("leaves the other lifts and a new best of the barbell alone", () => {
    const source = {
      ...fixture(),
      imported: [makeImportedSession([dbBench(30)], { id: "ih", startedAt: new Date(2026, 10, 7, 9) })],
    };
    const review = buildWeeklyReview(source, [], WEEK, AFTER, OPTS);
    for (const id of ["squat", "deadlift", "ohp"]) {
      expect(review.lifts.find((l) => l.id === id)).toEqual(plain.lifts.find((l) => l.id === id));
    }
    expect(review.prs).toEqual(plain.prs);
  });
});
