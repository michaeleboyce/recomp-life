// The weekly review with sessions imported from other apps (made-up sessions only).
import { describe, expect, it } from "vitest";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { buildWeeklyReview, reviewWeeks } from "./index";
import { AFTER, OPTS, WEEK, fixture } from "./testFixture";

// Review week: Mon 2 Nov to Sun 8 Nov 2026 (local).
const squat = (weight: number, reps = 5, role: "work" | "warmup" = "work") =>
  makeImportedSet({ exerciseName: "Made-up Squat", mappedExerciseId: "squat", weightPerImplementLb: weight, reps, role });
const curl = () =>
  makeImportedSet({ exerciseName: "Made-up Curl", mappedExerciseId: "bicep_curls", weightPerImplementLb: 20, reps: 10 });

// Two imported sessions in the week, one the week before, one deleted.
const imported = [
  makeImportedSession([squat(45, 5, "warmup"), squat(250), squat(250)], { id: "i1", startedAt: new Date(2026, 10, 3, 7) }),
  makeImportedSession([curl(), curl(), curl()], { id: "i2", startedAt: new Date(2026, 10, 6, 7) }),
  makeImportedSession([squat(200)], { id: "i0", startedAt: new Date(2026, 9, 28, 7) }),
  makeImportedSession([squat(400)], { id: "gone", startedAt: new Date(2026, 10, 5, 7), deletedAt: 1 }),
];

const withImported = () => ({ ...fixture(), imported });
const lift = (r: ReturnType<typeof buildWeeklyReview>, id: string) => r.lifts.find((l) => l.id === id)!;

describe("buildWeeklyReview with imported sessions (H1)", () => {
  const plain = buildWeeklyReview(fixture(), [], WEEK, AFTER, OPTS);
  const review = buildWeeklyReview(withImported(), [], WEEK, AFTER, OPTS);

  it("counts imported sessions this week and the week before, and says how many were imported", () => {
    expect(review.sessions.count).toBe(plain.sessions.count + 2);
    expect(review.sessions.previous).toBe(plain.sessions.previous + 1);
    expect(review.sessions.imported).toBe(2);
    expect(review.sessions.previousImported).toBe(1);
    expect(plain.sessions.imported).toBe(0);
  });

  it("counts a lift's imported sessions and their estimates, but never calls an imported one a new best", () => {
    const squatReview = lift(review, "squat");
    expect(squatReview.sessions).toBe(lift(plain, "squat").sessions + 1);
    expect(squatReview.importedSessions).toBe(1);
    // 250 x 5 beats the app's 225 this week.
    expect(squatReview.bestE1RM).toBeGreaterThan(225);
    expect(squatReview.bestImported).toBe(true);
    expect(squatReview.isPR).toBe(false);
    expect(review.prs.map((p) => p.liftId)).not.toContain("squat");
    // Working weight is the program's, app only.
    expect(squatReview.workingWeight).toBe(lift(plain, "squat").workingWeight);
  });

  it("adds imported working sets to the muscle groups and their weight x reps to tonnage", () => {
    const sets = (r: typeof review, group: string) => r.volume.groups.find((g) => g.group === group);
    const quads = sets(review, "Quads")!;
    expect(quads.sets).toBe((sets(plain, "Quads")?.sets ?? 0) + 2);
    expect(quads.previous).toBe((sets(plain, "Quads")?.previous ?? 0) + 1);
    expect(sets(review, "Biceps")!.sets).toBe(3);
    expect(review.volume.tonnage).toBe(plain.volume.tonnage + 2 * 250 * 5 + 3 * 20 * 10);
    expect(review.volume.previousTonnage).toBe(plain.volume.previousTonnage + 200 * 5);
    expect(review.volume.importedSessions).toBe(2);
  });

  it("leaves effort and readiness to the app's own workouts", () => {
    expect(review.effort).toEqual(plain.effort);
    expect(review.readiness).toEqual(plain.readiness);
  });

  it("is not empty for a week with only imported sessions, and lists that week", () => {
    const source = {
      ...fixture(),
      workouts: [],
      bodyweight: [],
      runs: [],
      activities: [],
      e1rms: [],
      imported: [makeImportedSession([squat(200)], { startedAt: new Date(2026, 8, 9, 7) })],
    };
    const week = new Date(2026, 8, 7);
    const r = buildWeeklyReview(source, [], week, AFTER, OPTS);
    expect(r.isEmpty).toBe(false);
    expect(r.sessions.count).toBe(1);
    expect(reviewWeeks(source, AFTER).map((d) => d.getTime())).toContain(week.getTime());
  });
});
