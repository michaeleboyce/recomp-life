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
  AdaptationOption,
  AdaptationStatus,
  ConfidenceLevel,
} from '@/types';
import { barbellToDumbbell, barbellToBothHands } from './dbConversion';
import { HOME_SUBSTITUTE_CHAINS, EXERCISES } from './exercises';

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

  const highConfidence = ['db_bench', 'db_row', 'db_shoulder_press', 'db_floor_press', 'db_arnold_press'];
  const mediumConfidence = ['goblet_squat', 'bulgarian_split_squat', 'db_rdl', 'db_lunge', 'single_leg_db_rdl'];

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

  const primaryStatus = computeStatus(dbEquiv, equipment.maxDumbbellWeight);

  // If primary substitute fits, return immediately with no alternatives
  if (primaryStatus === 'fits') {
    const confidenceLevel = getConfidenceLevel(substituteExercise.id, primaryStatus);
    const warningMessage = buildWarningMessage(
      exercise.name,
      prescribedWeight,
      substituteExercise.name,
      dbEquiv,
      equipment.maxDumbbellWeight,
      primaryStatus,
      isBothHands
    );

    return {
      originalExercise: exercise,
      originalWeight: prescribedWeight,
      adaptedExercise: substituteExercise,
      adaptedWeight: dbEquiv,
      adaptationStatus: primaryStatus,
      confidenceLevel,
      warningMessage,
      alternatives: [],
    };
  }

  // Primary exceeds or is borderline -- try fallback chain
  const chain = HOME_SUBSTITUTE_CHAINS[exercise.id];

  // No fallback chain for this exercise (e.g. test fixtures with non-matching IDs)
  if (!chain) {
    const confidenceLevel = getConfidenceLevel(substituteExercise.id, primaryStatus);
    const warningMessage = buildWarningMessage(
      exercise.name,
      prescribedWeight,
      substituteExercise.name,
      dbEquiv,
      equipment.maxDumbbellWeight,
      primaryStatus,
      isBothHands
    );

    return {
      originalExercise: exercise,
      originalWeight: prescribedWeight,
      adaptedExercise: substituteExercise,
      adaptedWeight: dbEquiv,
      adaptationStatus: primaryStatus,
      confidenceLevel,
      warningMessage,
      alternatives: [],
    };
  }

  // Build alternatives from the full chain and find the first one that fits
  const alternatives: AdaptationOption[] = [];
  let bestFitExercise: Exercise | null = null;
  let bestFitWeight = 0;

  for (const chainExerciseId of chain) {
    const chainExercise = EXERCISES[chainExerciseId];
    if (!chainExercise) continue;

    const chainIsBothHands = chainExercise.grip === 'both_hands';
    const chainWeight = chainIsBothHands
      ? barbellToBothHands(prescribedWeight)
      : barbellToDumbbell(prescribedWeight);
    const chainStatus = computeStatus(chainWeight, equipment.maxDumbbellWeight);
    const weightUnit = chainIsBothHands ? 'lbs' : 'lbs/hand';

    const fits = chainStatus === 'fits';
    const cappedWeight = fits ? chainWeight : Math.min(chainWeight, equipment.maxDumbbellWeight);

    alternatives.push({
      label: `${chainExercise.name} @ ${cappedWeight} ${weightUnit}`,
      exercise: chainExercise,
      weight: cappedWeight,
      pros: fits ? 'Full load achieved' : `Capped at max DB weight`,
      cons: fits ? '' : `Needs ${chainWeight} ${weightUnit}, max is ${equipment.maxDumbbellWeight}`,
    });

    // Auto-select the FIRST one that fits
    if (fits && !bestFitExercise) {
      bestFitExercise = chainExercise;
      bestFitWeight = chainWeight;
    }
  }

  // If a fallback fits, use it
  if (bestFitExercise) {
    const bestIsBothHands = bestFitExercise.grip === 'both_hands';
    const bestStatus: AdaptationStatus = 'fits';
    const confidenceLevel = getConfidenceLevel(bestFitExercise.id, bestStatus);
    const warningMessage = buildWarningMessage(
      exercise.name,
      prescribedWeight,
      bestFitExercise.name,
      bestFitWeight,
      equipment.maxDumbbellWeight,
      bestStatus,
      bestIsBothHands
    );

    return {
      originalExercise: exercise,
      originalWeight: prescribedWeight,
      adaptedExercise: bestFitExercise,
      adaptedWeight: bestFitWeight,
      adaptationStatus: bestStatus,
      confidenceLevel,
      warningMessage,
      alternatives,
    };
  }

  // Nothing fits -- use primary substitute capped at maxDumbbellWeight
  const cappedWeight = equipment.maxDumbbellWeight;
  const finalStatus: AdaptationStatus = primaryStatus; // preserves 'borderline' vs 'exceeds'
  const confidenceLevel = getConfidenceLevel(substituteExercise.id, finalStatus);
  const warningMessage = buildWarningMessage(
    exercise.name,
    prescribedWeight,
    substituteExercise.name,
    dbEquiv,
    equipment.maxDumbbellWeight,
    finalStatus,
    isBothHands
  );

  return {
    originalExercise: exercise,
    originalWeight: prescribedWeight,
    adaptedExercise: substituteExercise,
    adaptedWeight: cappedWeight,
    adaptationStatus: finalStatus,
    confidenceLevel,
    warningMessage,
    alternatives,
  };
}

/**
 * Computes the adaptation status for a given weight against the max dumbbell weight.
 */
function computeStatus(dbWeight: number, maxDumbbellWeight: number): AdaptationStatus {
  if (dbWeight <= maxDumbbellWeight) return 'fits';
  if (dbWeight < maxDumbbellWeight + 10) return 'borderline';
  return 'exceeds';
}
