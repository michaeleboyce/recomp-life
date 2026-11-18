// The time-off rule's "lighter weights after a break" counts training logged in another
// app: an imported session of the lift, or of one of its home versions, ends the break
// for that lift. Made-up data only.
import { describe, expect, it } from "vitest";
import { makeLiftState } from "@/lib/data/testUtils";
import { importedStrengthSets } from "@/lib/import/evidence";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { LONG_BREAK_DAYS } from "@/lib/recovery";
import type { StrengthSet } from "@/lib/strength";
import { getExerciseDecaySuggestions } from "@/lib/weightDecay";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, VariantState } from "@/types";
import { importedLastTrainedByLift, timeOffSuggestions } from "./timeOff";

const NOW = new Date(2026, 10, 18, 12, 0, 0);
const daysAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
};
const A1 = WORKOUT_TEMPLATES.A1.exercises; // squat T1, bench T2, lat pulldown T3
const PHASE = { mode: "maintaining" as const };

/** Squat and bench last done in the app 40 days ago. */
const STATES: LiftState[] = [
  makeLiftState({ exerciseId: "squat", t1Weight: 200, t1LastWorkoutDate: daysAgo(40), t2LastWorkoutDate: null }),
  makeLiftState({ exerciseId: "bench", t2Weight: 100, t1LastWorkoutDate: null, t2LastWorkoutDate: daysAgo(40) }),
];

/** Made-up imported sessions, one exercise each, as strength evidence. */
function imported(...sessions: Array<[exerciseId: string, ago: number]>): StrengthSet[] {
  return importedStrengthSets(
    sessions.map(([exerciseId, ago]) =>
      importedSession([importedSet({ exerciseName: `Test ${exerciseId}`, mappedExerciseId: exerciseId })], {
        startedAt: daysAgo(ago),
      })
    )
  );
}

const lifts = (suggestions: { exerciseId: string; daysSinceLastWorkout: number }[]) =>
  suggestions.map((s) => `${s.exerciseId} ${s.daysSinceLastWorkout}`);

describe("timeOffSuggestions", () => {
  it("is the time-off rule as before when nothing was imported", () => {
    expect(lifts(timeOffSuggestions(A1, STATES, PHASE, NOW, [], []))).toEqual(["squat 40", "bench 40"]);
    expect(timeOffSuggestions(A1, STATES, PHASE, NOW, [], [])).toEqual(
      getExerciseDecaySuggestions(A1, STATES, PHASE, NOW, [])
    );
  });

  it("an imported session of the lift within the window means no break for that lift only", () => {
    const sets = imported(["squat", 3]);
    expect(lifts(timeOffSuggestions(A1, STATES, PHASE, NOW, [], sets))).toEqual(["bench 40"]);
  });

  it("an imported session of a home version counts for the lift", () => {
    const sets = imported(["goblet_squat", 3], ["db_floor_press", LONG_BREAK_DAYS - 1]);
    expect(timeOffSuggestions(A1, STATES, PHASE, NOW, [], sets)).toEqual([]);
  });

  it("an older imported session shortens the break to it, never lengthens it", () => {
    const states = STATES.map((s) => (s.exerciseId === "squat" ? { ...s, t1LastWorkoutDate: daysAgo(80) } : s));
    const sets = imported(["squat", 45], ["bench", 60]);
    // Squat from 80 to 45 days; bench's app session (40 days) is newer than its import.
    expect(lifts(timeOffSuggestions(A1, states, PHASE, NOW, [], sets))).toEqual(["squat 45", "bench 40"]);
  });

  it("counts a home session in the app as before, and leaves out imports after the date planned for", () => {
    const home: VariantState[] = [
      { id: "squat|goblet_squat|T1", liftId: "squat", exerciseId: "goblet_squat", tier: "T1", weight: 50, stage: 0, consecutiveFailures: 0, lastSessionDate: daysAgo(2) } as unknown as VariantState,
    ];
    expect(lifts(timeOffSuggestions(A1, STATES, PHASE, NOW, home, []))).toEqual(["bench 40"]);
    const later = imported(["bench", -2]);
    expect(lifts(timeOffSuggestions(A1, STATES, PHASE, NOW, [], later))).toEqual(["squat 40", "bench 40"]);
  });

  it("a lift never done in the app gets no suggestion from imported history alone", () => {
    const states = [makeLiftState({ exerciseId: "squat", t1Weight: 200, t1LastWorkoutDate: null, t2LastWorkoutDate: null })];
    expect(timeOffSuggestions(A1, states, PHASE, NOW, [], imported(["squat", 90]))).toEqual([]);
  });
});

describe("importedLastTrainedByLift", () => {
  it("is the latest imported session up to the date of the lift or any of its home versions", () => {
    const sets = imported(["squat", 30], ["bulgarian_split_squat", 10], ["bench", 5], ["squat", -1]);
    const last = importedLastTrainedByLift(sets, [], ["squat", "bench", "deadlift"], NOW);
    expect(last.get("squat")).toEqual(daysAgo(10));
    expect(last.get("bench")).toEqual(daysAgo(5));
    expect(last.has("deadlift")).toBe(false);
  });
});
