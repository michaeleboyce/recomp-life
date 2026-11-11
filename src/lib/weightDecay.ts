/**
 * Weight Decay Model (time off)
 *
 * Suggests a lighter starting weight after a long break from a lift.
 *
 * Research shows strength holds up well through short breaks: one session a
 * week maintains it for months, and after a 10-week layoff trainees were back
 * to pre-break levels in about 5 weeks. So nothing is suggested before
 * LONG_BREAK_DAYS, and the cuts after that are small. The exact percentages
 * are a judgment call from the direction of that evidence; the phase
 * multipliers are a coaching heuristic.
 *
 * @evidence time-off
 */

import { roundToNearest5 } from "./progression";
import { LONG_BREAK_DAYS } from "./recovery";
import type { TrainingPhase, LiftState } from "@/types";
import type { RuleId } from "./evidence/rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecayTier = "none" | "mild" | "moderate" | "significant";

export interface WeightDecayResult {
  decayPercent: number;
  decayedWeight: number;
  tier: DecayTier;
  message: string;
}

export interface ExerciseDecaySuggestion {
  exerciseId: string;
  tier: "T1" | "T2";
  currentWeight: number;
  suggestedWeight: number;
  daysSinceLastWorkout: number;
  decayTier: DecayTier;
  message: string;
  /** Evidence rule explaining the suggestion. */
  evidenceId: RuleId;
}

// ---------------------------------------------------------------------------
// Decay calculation
// ---------------------------------------------------------------------------

/** Suggested cut by days since the lift was last trained (before phase multiplier). */
export const DECAY_TIERS: ReadonlyArray<{
  maxDays: number;
  baseDecay: number;
  tier: DecayTier;
}> = [
  { maxDays: LONG_BREAK_DAYS - 1, baseDecay: 0, tier: "none" },
  { maxDays: 41, baseDecay: 0.05, tier: "mild" },
  { maxDays: 69, baseDecay: 0.1, tier: "moderate" },
  { maxDays: Infinity, baseDecay: 0.15, tier: "significant" },
];

/** Phase adjustment to the suggested cut. A coaching heuristic. */
export const DECAY_PHASE_MULTIPLIERS: Record<TrainingPhase["mode"], number> = {
  cutting: 1.25,
  maintaining: 1.0,
  bulking: 0.75,
};

/** The largest cut ever suggested, whatever the break length or phase. */
export const MAX_DECAY = 0.2;

/**
 * Calculate how much a working weight should decay based on time away and
 * training phase.
 */
export function calculateWeightDecay(
  daysSinceLastWorkout: number,
  currentWeight: number,
  phase: TrainingPhase
): WeightDecayResult {
  if (daysSinceLastWorkout <= 0 || currentWeight <= 0) {
    return { decayPercent: 0, decayedWeight: currentWeight, tier: "none", message: "" };
  }

  const tierEntry = DECAY_TIERS.find((t) => daysSinceLastWorkout <= t.maxDays)!;

  if (tierEntry.baseDecay === 0) {
    return { decayPercent: 0, decayedWeight: currentWeight, tier: "none", message: "" };
  }

  const multiplier = DECAY_PHASE_MULTIPLIERS[phase.mode];
  const rawDecay = tierEntry.baseDecay * multiplier;
  const decayPercent = Math.min(rawDecay, MAX_DECAY);
  const decayedWeight = roundToNearest5(currentWeight * (1 - decayPercent));

  const weeks = Math.floor(daysSinceLastWorkout / 7);
  const message =
    `${weeks} week${weeks !== 1 ? "s" : ""} since last session — suggest ${Math.round(decayPercent * 100)}% reduction to ${decayedWeight} lbs`;

  return { decayPercent, decayedWeight, tier: tierEntry.tier, message };
}

// ---------------------------------------------------------------------------
// Per-exercise decay suggestions
// ---------------------------------------------------------------------------

/**
 * Compute decay suggestions for each exercise in a workout template.
 * Only returns suggestions for lifts not trained for LONG_BREAK_DAYS or more,
 * and only when the suggested weight actually differs after rounding.
 * Skips exercises with an active deload.
 */
export function getExerciseDecaySuggestions(
  templateExercises: { exerciseId: string; tier: string }[],
  liftStates: LiftState[],
  phase: TrainingPhase,
  now: Date
): ExerciseDecaySuggestion[] {
  const suggestions: ExerciseDecaySuggestion[] = [];
  const liftMap = new Map(liftStates.map((ls) => [ls.exerciseId, ls]));

  for (const tmpl of templateExercises) {
    if (tmpl.tier !== "T1" && tmpl.tier !== "T2") continue;

    const ls = liftMap.get(tmpl.exerciseId);
    if (!ls || ls.deloadActive) continue;

    const lastDate =
      tmpl.tier === "T1" ? ls.t1LastWorkoutDate : ls.t2LastWorkoutDate;
    if (!lastDate) continue;

    const daysSince = Math.floor(
      (now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    const currentWeight = tmpl.tier === "T1" ? ls.t1Weight : ls.t2Weight;
    const result = calculateWeightDecay(daysSince, currentWeight, phase);

    if (result.tier === "none") continue;
    // A small cut on a light weight can round back to the same number.
    if (result.decayedWeight >= currentWeight) continue;

    suggestions.push({
      exerciseId: tmpl.exerciseId,
      tier: tmpl.tier as "T1" | "T2",
      currentWeight,
      suggestedWeight: result.decayedWeight,
      daysSinceLastWorkout: daysSince,
      decayTier: result.tier,
      message: result.message,
      evidenceId: "time-off",
    });
  }

  return suggestions;
}
