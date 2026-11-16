/**
 * Auto-Adapt Engine
 *
 * Converts barbell exercises to dumbbell equivalents for home workouts,
 * evaluating whether the user's available equipment can handle the adapted weight.
 * Provides confidence levels and warning messages.
 *
 * @evidence dumbbell-conversion
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
 * Decision logic:
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
  const step = equipment.dumbbellIncrementLbs;
  const isBothHands = substituteExercise.grip === 'both_hands';
  const dbEquiv = convertFor(substituteExercise, prescribedWeight, step);

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

  // Primary exceeds or is borderline -- try the fallback chain. An exercise without
  // one (lat pulldown, for example) has nothing else to try and is capped below.
  const chain = HOME_SUBSTITUTE_CHAINS[exercise.id] ?? [];

  // Build alternatives from the full chain and find the first one that fits
  const alternatives: AdaptationOption[] = [];
  let bestFitExercise: Exercise | null = null;
  let bestFitWeight = 0;

  for (const chainExerciseId of chain) {
    const chainExercise = EXERCISES[chainExerciseId];
    if (!chainExercise) continue;

    const chainIsBothHands = chainExercise.grip === 'both_hands';
    const chainWeight = convertFor(chainExercise, prescribedWeight, step);
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
      ...(cappedWeight < chainWeight ? { cappedFrom: chainWeight } : {}),
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

  // Nothing fits -- cap at maxDumbbellWeight. Of the primary substitute and the chain,
  // keep the one whose capped weight is the heaviest load in total (the first of equals):
  // a heavy squat stays a split squat at the heaviest pair rather than becoming goblet
  // squat with one of them, which would halve the load. The weight asked for is kept.
  const capped = heaviestCapped(
    [substituteExercise, ...chain.map((id) => EXERCISES[id]).filter((e): e is Exercise => !!e)],
    prescribedWeight,
    equipment
  );
  const cappedWeight = equipment.maxDumbbellWeight;
  const finalStatus = computeStatus(capped.wanted, equipment.maxDumbbellWeight); // 'borderline' or 'exceeds'
  const confidenceLevel = getConfidenceLevel(capped.exercise.id, finalStatus);
  const warningMessage = buildWarningMessage(
    exercise.name,
    prescribedWeight,
    capped.exercise.name,
    capped.wanted,
    equipment.maxDumbbellWeight,
    finalStatus,
    capped.exercise.grip === 'both_hands'
  );

  return {
    originalExercise: exercise,
    originalWeight: prescribedWeight,
    adaptedExercise: capped.exercise,
    adaptedWeight: cappedWeight,
    adaptationStatus: finalStatus,
    confidenceLevel,
    warningMessage,
    alternatives,
    cappedFrom: capped.wanted,
  };
}

/** Today's conversion of a barbell weight for one dumbbell exercise, rounded to `step`. */
function convertFor(exercise: Exercise, barbellWeight: number, step: number): number {
  return exercise.grip === 'both_hands'
    ? barbellToBothHands(barbellWeight, step)
    : barbellToDumbbell(barbellWeight, step);
}

/** Total load of a dumbbell weight: two dumbbells for a per-hand exercise, else one. */
function totalLoadOf(exercise: Exercise, weight: number): number {
  return exercise.grip === 'per_hand' ? weight * 2 : weight;
}

/**
 * Of exercises that are all over the heaviest dumbbell, the one with the heaviest total
 * load once capped (the first of equals), with the weight it asked for.
 */
function heaviestCapped(
  candidates: Exercise[],
  barbellWeight: number,
  equipment: EquipmentProfile
): { exercise: Exercise; wanted: number } {
  const max = equipment.maxDumbbellWeight;
  const step = equipment.dumbbellIncrementLbs;
  let best = { exercise: candidates[0], wanted: convertFor(candidates[0], barbellWeight, step) };
  let bestTotal = totalLoadOf(best.exercise, Math.min(best.wanted, max));
  for (const candidate of candidates.slice(1)) {
    const wanted = convertFor(candidate, barbellWeight, step);
    const total = totalLoadOf(candidate, Math.min(wanted, max));
    if (total > bestTotal) {
      best = { exercise: candidate, wanted };
      bestTotal = total;
    }
  }
  return best;
}

/**
 * Computes the adaptation status for a given weight against the max dumbbell weight.
 */
function computeStatus(dbWeight: number, maxDumbbellWeight: number): AdaptationStatus {
  if (dbWeight <= maxDumbbellWeight) return 'fits';
  if (dbWeight < maxDumbbellWeight + 10) return 'borderline';
  return 'exceeds';
}
