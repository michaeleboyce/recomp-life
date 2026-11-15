import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { ACCESSORY_IDS } from "@/lib/exercises";
import { forecastSessionLength, type ForecastSource } from "@/lib/forecast";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { estimateWorkoutMinutes } from "@/lib/workout/duration";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { WorkoutSession } from "@/types";
import { readyLengthFrom } from "./useReadyLength";

const settings = DEFAULT_USER_PROFILE.settings;
const phase = settings.trainingPhase;
const NOW = new Date("2026-11-15T09:00:00Z");

const plan = (includeWarmUps: boolean, selectedAccessories: string[] = []) =>
  buildWorkoutPlan({
    template: WORKOUT_TEMPLATES.A1,
    liftStates: Object.values(INITIAL_LIFT_STATES),
    location: "gym",
    equipment: settings.equipment,
    includeWarmUps,
    selectedAccessories,
  });

/** Sessions that each ran half again as long as their sets on paper. */
function slowHistory(): WorkoutSession[] {
  const day = 24 * 3600_000;
  return Array.from({ length: 8 }, (_, i) => {
    const startedAt = new Date(NOW.getTime() - (i + 1) * 2 * day);
    const sets = plan(false)
      .filter((e) => !e.isWarmUp)
      .flatMap((e) =>
        Array.from({ length: e.targetSets }, (_, n) => ({
          id: `s${i}-${e.exerciseId}-${n}`,
          clientId: `c${i}-${e.exerciseId}-${n}`,
          exerciseId: e.exerciseId,
          tier: e.tier,
          setNumber: n + 1,
          targetReps: e.targetReps,
          actualReps: e.targetReps,
          weight: e.weight,
          isAMRAP: false,
          completedAt: startedAt,
          restAfterSeconds: 0,
          status: "completed" as const,
          isSubstituted: false,
          location: "gym" as const,
          synced: false,
        }))
      );
    const paper = estimateWorkoutMinutes(plan(false), phase) * 60;
    return {
      id: `w${i}`,
      clientId: `w${i}`,
      templateId: "A1",
      location: "gym",
      startedAt,
      completedAt: new Date(startedAt.getTime() + paper * 1500),
      totalDurationSeconds: Math.round(paper * 1.5),
      includeWarmUps: false,
      selectedAccessories: [],
      sets,
      preWorkoutPainEntries: [],
      modifications: [],
      synced: false,
    } satisfies WorkoutSession;
  });
}

const source = (workouts: WorkoutSession[]): ForecastSource =>
  ({ workouts, bodyweight: [], liftStates: [], bestE1RMs: {}, settings, now: NOW }) as unknown as ForecastSource;

describe("readyLengthFrom", () => {
  it("is the length on paper, with no range, until the history has loaded", () => {
    expect(readyLengthFrom(null, plan(true), phase)).toEqual({
      minutes: estimateWorkoutMinutes(plan(true), phase),
    });
  });

  it("is the session-length forecast for this plan, with its range", () => {
    const workouts = slowHistory();
    const expected = forecastSessionLength({ plan: plan(false), workouts, phase, now: NOW });
    const length = readyLengthFrom(source(workouts), plan(false), phase);
    expect(length.minutes).toBe(Math.round(expected.seconds / 60));
    expect(length.low).toBe(Math.round(expected.low / 60));
    expect(length.high).toBe(Math.round(expected.high / 60));
    // Pace-corrected: the lifter's sessions run long, so it is above the paper figure.
    expect(length.minutes).toBeGreaterThan(estimateWorkoutMinutes(plan(false), phase));
  });

  it("counts warm-ups and accessories chosen on the Ready screen", () => {
    const s = source(slowHistory());
    const bare = readyLengthFrom(s, plan(false), phase).minutes;
    expect(readyLengthFrom(s, plan(true), phase).minutes).toBeGreaterThan(bare);
    const withAccessory = readyLengthFrom(s, plan(false, [ACCESSORY_IDS[0]]), phase).minutes;
    expect(withAccessory).toBeGreaterThan(bare);
  });
});
