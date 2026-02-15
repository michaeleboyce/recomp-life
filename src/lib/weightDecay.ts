/**
 * Weight Decay Model
 *
 * Graduated decay for working weights when a user has been away from lifting.
 * Phase-aware: cutting decays faster, bulking decays slower.
 */

import { roundToNearest5 } from "./progression";
import type { TrainingPhase, LiftState } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecayTier = "none" | "mild" | "moderate" | "significant" | "severe";

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
}

// ---------------------------------------------------------------------------
// Decay calculation
// ---------------------------------------------------------------------------

const DECAY_TIERS: { maxDays: number; baseDecay: number; tier: DecayTier }[] = [
  { maxDays: 13, baseDecay: 0, tier: "none" },
  { maxDays: 21, baseDecay: 0.1, tier: "mild" },
  { maxDays: 42, baseDecay: 0.2, tier: "moderate" },
  { maxDays: 60, baseDecay: 0.3, tier: "significant" },
  { maxDays: Infinity, baseDecay: 0.4, tier: "severe" },
];

const PHASE_MULTIPLIERS: Record<TrainingPhase["mode"], number> = {
  cutting: 1.25,
  maintaining: 1.0,
  bulking: 0.75,
};

const MAX_DECAY = 0.5;

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

  const multiplier = PHASE_MULTIPLIERS[phase.mode];
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
 * Only returns suggestions for exercises with active decay (>13 days).
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

    suggestions.push({
      exerciseId: tmpl.exerciseId,
      tier: tmpl.tier as "T1" | "T2",
      currentWeight,
      suggestedWeight: result.decayedWeight,
      daysSinceLastWorkout: daysSince,
      decayTier: result.tier,
      message: result.message,
    });
  }

  return suggestions;
}
