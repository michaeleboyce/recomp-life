/**
 * Auto-Adapt Engine
 *
 * Converts barbell exercises to dumbbell equivalents for home workouts,
 * evaluating whether the user's available equipment can handle the adapted weight.
 * Provides confidence levels and warning messages per spec sections 2.5 and 12.2.
 */

import type {
  Exercise,
  EquipmentProfile,
  ExerciseAdaptation,
  AdaptationStatus,
  ConfidenceLevel,
} from '@/types';
import { barbellToDumbbell, barbellToBothHands } from './dbConversion';

/**
 * Determines the confidence level for a dumbbell substitute exercise.
 *
 * - High: DB bench press, DB row, DB shoulder press (close biomechanical match)
 * - Medium: Goblet squat (front rack limited), DB RDL (grip limited), or unknown
 * - Low: Any exercise when adaptation status is "exceeds"
 */
export function getConfidenceLevel(
  substituteId: string,
  adaptationStatus: AdaptationStatus
): ConfidenceLevel {
  if (adaptationStatus === 'exceeds') return 'low';

  const highConfidence = ['db_bench', 'db_row', 'db_shoulder_press'];
  const mediumConfidence = ['goblet_squat', 'bulgarian_split_squat', 'db_rdl'];

  if (highConfidence.includes(substituteId)) return 'high';
  if (mediumConfidence.includes(substituteId)) return 'medium';

  return 'medium'; // default for unknown substitutes
}

/**
 * Generates a human-readable warning message based on the adaptation status.
 */
function buildWarningMessage(
  exerciseName: string,
  prescribedWeight: number,
  substituteName: string,
  dbWeight: number,
  maxDumbbellWeight: number,
  status: AdaptationStatus,
  isBothHands: boolean
): string | undefined {
  const weightUnit = isBothHands ? 'lbs' : 'lbs/hand';
  switch (status) {
    case 'fits':
      return `${exerciseName} ${prescribedWeight} lbs \u2192 ${substituteName} ${dbWeight} ${weightUnit} \u2705`;
    case 'borderline':
      return `${exerciseName} at ${prescribedWeight} lbs \u2192 ${dbWeight} lb DBs (your max is ${maxDumbbellWeight}). Close to limit.`;
    case 'exceeds':
      return `\u26a0\ufe0f ${exerciseName} at ${prescribedWeight} lbs \u2192 needs ${dbWeight} lb DBs. Your max is ${maxDumbbellWeight} lbs.`;
    case 'no_substitute':
      return undefined;
  }
}

/**
 * Adapts a single exercise for home use based on available equipment.
 *
 * Decision logic (spec section 2.5):
 * 1. If the exercise does not require a gym, return as-is with "fits" / "high".
 * 2. If the exercise requires a gym AND has a dumbbell alternative:
 *    - Calculate the dumbbell equivalent weight.
 *    - Compare against maxDumbbellWeight to determine status.
 * 3. If the exercise requires a gym AND has no dumbbell alternative,
 *    return "no_substitute".
 *
 * @param exercise         The original barbell/gym exercise
 * @param prescribedWeight The programmed barbell weight in lbs
 * @param equipment        The user's home equipment profile
 * @param substituteExercise  The dumbbell alternative Exercise object, if available
 */
export function adaptExerciseForHome(
  exercise: Exercise,
  prescribedWeight: number,
  equipment: EquipmentProfile,
  substituteExercise?: Exercise
): ExerciseAdaptation {
  // Case 1: Exercise already works at home
  if (!exercise.requiresGym) {
    return {
      originalExercise: exercise,
      originalWeight: prescribedWeight,
      adaptedExercise: exercise,
      adaptedWeight: prescribedWeight,
      adaptationStatus: 'fits',
      confidenceLevel: 'high',
      alternatives: [],
    };
  }

  // Case 3: Requires gym but no dumbbell alternative exists
  if (!exercise.dumbbellAlternative || !substituteExercise) {
    return {
      originalExercise: exercise,
      originalWeight: prescribedWeight,
      adaptedExercise: exercise,
      adaptedWeight: prescribedWeight,
      adaptationStatus: 'no_substitute',
      confidenceLevel: 'low',
      alternatives: [],
    };
  }

  // Case 2: Requires gym and has a dumbbell alternative
  const isBothHands = substituteExercise.grip === 'both_hands';
  const dbEquiv = isBothHands
    ? barbellToBothHands(prescribedWeight)
    : barbellToDumbbell(prescribedWeight);

  let adaptationStatus: AdaptationStatus;
  if (dbEquiv <= equipment.maxDumbbellWeight) {
    adaptationStatus = 'fits';
  } else if (dbEquiv < equipment.maxDumbbellWeight + 10) {
    adaptationStatus = 'borderline';
  } else {
    adaptationStatus = 'exceeds';
  }

  const confidenceLevel = getConfidenceLevel(substituteExercise.id, adaptationStatus);

  const warningMessage = buildWarningMessage(
    exercise.name,
    prescribedWeight,
    substituteExercise.name,
    dbEquiv,
    equipment.maxDumbbellWeight,
    adaptationStatus,
    isBothHands
  );

  return {
    originalExercise: exercise,
    originalWeight: prescribedWeight,
    adaptedExercise: substituteExercise,
    adaptedWeight: dbEquiv,
    adaptationStatus,
    confidenceLevel,
    warningMessage,
    alternatives: [],
  };
}
