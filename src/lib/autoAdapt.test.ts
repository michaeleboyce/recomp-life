import { describe, it, expect } from 'vitest';
import { adaptExerciseForHome, getConfidenceLevel } from './autoAdapt';
import type { Exercise, EquipmentProfile } from '@/types';

// Test fixtures

function makeEquipment(overrides: Partial<EquipmentProfile> = {}): EquipmentProfile {
  return {
    maxDumbbellWeight: 80,
    dumbbellIncrementLbs: 5,
    hasBench: true,
    hasResistanceBands: true,
    hasPullUpBar: true,
    gymBarbellIncrementLbs: 5,
    availablePlates: [45, 25, 10, 5, 2.5],
    barWeight: 45,
    ...overrides,
  };
}

const barbellBench: Exercise = {
  id: 'barbell_bench',
  name: 'Barbell Bench Press',
  type: 'barbell',
  muscleGroup: 'push',
  requiresGym: true,
  dumbbellAlternative: 'db_bench',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const dbBench: Exercise = {
  id: 'db_bench',
  name: 'Dumbbell Bench Press',
  type: 'dumbbell',
  muscleGroup: 'push',
  requiresGym: false,
  barbellEquivalent: 'barbell_bench',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const barbellSquat: Exercise = {
  id: 'barbell_squat',
  name: 'Barbell Squat',
  type: 'barbell',
  muscleGroup: 'legs',
  requiresGym: true,
  dumbbellAlternative: 'goblet_squat',
  primaryMuscles: ['left_quad', 'right_quad'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const gobletSquat: Exercise = {
  id: 'goblet_squat',
  name: 'Goblet Squat',
  type: 'dumbbell',
  muscleGroup: 'legs',
  requiresGym: false,
  barbellEquivalent: 'barbell_squat',
  primaryMuscles: ['left_quad', 'right_quad'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const barbellDeadlift: Exercise = {
  id: 'barbell_deadlift',
  name: 'Barbell Deadlift',
  type: 'barbell',
  muscleGroup: 'pull',
  requiresGym: true,
  dumbbellAlternative: 'db_rdl',
  primaryMuscles: ['lower_back', 'left_hamstring', 'right_hamstring'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const dbRdl: Exercise = {
  id: 'db_rdl',
  name: 'Dumbbell Romanian Deadlift',
  type: 'dumbbell',
  muscleGroup: 'pull',
  requiresGym: false,
  barbellEquivalent: 'barbell_deadlift',
  primaryMuscles: ['lower_back', 'left_hamstring', 'right_hamstring'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const barbellOHP: Exercise = {
  id: 'barbell_ohp',
  name: 'Barbell Overhead Press',
  type: 'barbell',
  muscleGroup: 'push',
  requiresGym: true,
  dumbbellAlternative: 'db_shoulder_press',
  primaryMuscles: ['left_shoulder', 'right_shoulder'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const dbShoulderPress: Exercise = {
  id: 'db_shoulder_press',
  name: 'Dumbbell Shoulder Press',
  type: 'dumbbell',
  muscleGroup: 'push',
  requiresGym: false,
  barbellEquivalent: 'barbell_ohp',
  primaryMuscles: ['left_shoulder', 'right_shoulder'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const pullUp: Exercise = {
  id: 'pull_up',
  name: 'Pull-Up',
  type: 'bodyweight',
  muscleGroup: 'pull',
  requiresGym: false,
  primaryMuscles: ['upper_back'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const cableRow: Exercise = {
  id: 'cable_row',
  name: 'Cable Row',
  type: 'cable',
  muscleGroup: 'pull',
  requiresGym: true,
  // no dumbbell alternative
  primaryMuscles: ['upper_back'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const barbellRow: Exercise = {
  id: 'barbell_row',
  name: 'Barbell Row',
  type: 'barbell',
  muscleGroup: 'pull',
  requiresGym: true,
  dumbbellAlternative: 'db_row',
  primaryMuscles: ['upper_back'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

const dbRow: Exercise = {
  id: 'db_row',
  name: 'Dumbbell Row',
  type: 'dumbbell',
  muscleGroup: 'pull',
  requiresGym: false,
  barbellEquivalent: 'barbell_row',
  primaryMuscles: ['upper_back'],
  secondaryMuscles: [],
  painSensitiveRegions: [],
};

describe('getConfidenceLevel', () => {
  it('returns "high" for db_bench', () => {
    expect(getConfidenceLevel('db_bench', 'fits')).toBe('high');
  });

  it('returns "high" for db_row', () => {
    expect(getConfidenceLevel('db_row', 'fits')).toBe('high');
  });

  it('returns "high" for db_shoulder_press', () => {
    expect(getConfidenceLevel('db_shoulder_press', 'fits')).toBe('high');
  });

  it('returns "medium" for goblet_squat', () => {
    expect(getConfidenceLevel('goblet_squat', 'fits')).toBe('medium');
  });

  it('returns "medium" for db_rdl', () => {
    expect(getConfidenceLevel('db_rdl', 'fits')).toBe('medium');
  });

  it('returns "low" when adaptation status is "exceeds"', () => {
    expect(getConfidenceLevel('db_bench', 'exceeds')).toBe('low');
    expect(getConfidenceLevel('goblet_squat', 'exceeds')).toBe('low');
  });

  it('returns "medium" for unknown substitute IDs', () => {
    expect(getConfidenceLevel('unknown_exercise', 'fits')).toBe('medium');
  });
});

describe('adaptExerciseForHome', () => {
  describe('non-gym exercises', () => {
    it('returns "fits" with no adaptation for bodyweight exercises', () => {
      const equipment = makeEquipment();
      const result = adaptExerciseForHome(pullUp, 0, equipment);

      expect(result.adaptationStatus).toBe('fits');
      expect(result.confidenceLevel).toBe('high');
      expect(result.originalExercise).toBe(pullUp);
      expect(result.adaptedExercise).toBe(pullUp);
      expect(result.adaptedWeight).toBe(0);
    });
  });

  describe('exercises with dumbbell alternatives', () => {
    it('converts 145 lb barbell bench to 60 lb DB per hand, status "fits", confidence "high"', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellBench, 145, equipment, dbBench);

      expect(result.adaptationStatus).toBe('fits');
      expect(result.adaptedWeight).toBe(60);
      expect(result.confidenceLevel).toBe('high');
      expect(result.adaptedExercise).toBe(dbBench);
      expect(result.warningMessage).toContain('Barbell Bench Press');
      expect(result.warningMessage).toContain('60');
    });

    it('flags 220 lb deadlift as "exceeds" 80 lb DBs, confidence "low"', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellDeadlift, 220, equipment, dbRdl);

      // 220 * 0.80 = 176, / 2 = 88, round to 90
      expect(result.adaptationStatus).toBe('exceeds');
      expect(result.adaptedWeight).toBe(90);
      expect(result.confidenceLevel).toBe('low');
      expect(result.warningMessage).toContain('90');
      expect(result.warningMessage).toContain('80');
    });

    it('returns "borderline" for weights within 10 lbs of max', () => {
      // Need dbEquiv > max but <= max + 10
      // With max 80: need dbEquiv in (80, 90]
      // barbellToDumbbell(200) = 200*0.80=160, /2=80 -> exactly max, that's "fits"
      // barbellToDumbbell(210) = 210*0.80=168, /2=84, round to 85 -> 85 > 80, 85 <= 90 -> borderline
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellBench, 210, equipment, dbBench);

      expect(result.adaptationStatus).toBe('borderline');
      expect(result.adaptedWeight).toBe(85);
      expect(result.warningMessage).toContain('Close to limit');
    });

    it('respects configurable maxDumbbellWeight with max 60', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 60 });
      // 145 lb bench -> 60 lb DB per hand. 60 <= 60 -> fits
      const result = adaptExerciseForHome(barbellBench, 145, equipment, dbBench);

      expect(result.adaptationStatus).toBe('fits');
      expect(result.adaptedWeight).toBe(60);
    });

    it('respects configurable maxDumbbellWeight with max 100', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 100 });
      // 220 lb deadlift -> 90 lb DB per hand. 90 <= 100 -> fits
      const result = adaptExerciseForHome(barbellDeadlift, 220, equipment, dbRdl);

      expect(result.adaptationStatus).toBe('fits');
      expect(result.adaptedWeight).toBe(90);
    });

    it('confidence: goblet_squat = medium', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      // 135 * 0.80 = 108, / 2 = 54, round to 55
      const result = adaptExerciseForHome(barbellSquat, 135, equipment, gobletSquat);

      expect(result.confidenceLevel).toBe('medium');
    });

    it('confidence: db_shoulder_press = high', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellOHP, 85, equipment, dbShoulderPress);

      expect(result.confidenceLevel).toBe('high');
    });

    it('confidence: db_row = high', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellRow, 135, equipment, dbRow);

      expect(result.confidenceLevel).toBe('high');
    });
  });

  describe('exercises with no dumbbell alternative', () => {
    it('returns "no_substitute" for cable row with no DB alternative', () => {
      const equipment = makeEquipment();
      const result = adaptExerciseForHome(cableRow, 100, equipment);

      expect(result.adaptationStatus).toBe('no_substitute');
      expect(result.adaptedExercise).toBe(cableRow);
    });
  });

  describe('warning messages', () => {
    it('generates correct "fits" message', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellBench, 145, equipment, dbBench);

      expect(result.warningMessage).toBe(
        'Barbell Bench Press 145 lbs \u2192 Dumbbell Bench Press 60 lbs/hand \u2705'
      );
    });

    it('generates correct "borderline" message', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellBench, 210, equipment, dbBench);

      expect(result.warningMessage).toBe(
        'Barbell Bench Press at 210 lbs \u2192 85 lb DBs (your max is 80). Close to limit.'
      );
    });

    it('generates correct "exceeds" message', () => {
      const equipment = makeEquipment({ maxDumbbellWeight: 80 });
      const result = adaptExerciseForHome(barbellDeadlift, 220, equipment, dbRdl);

      expect(result.warningMessage).toBe(
        '\u26a0\ufe0f Barbell Deadlift at 220 lbs \u2192 needs 90 lb DBs. Your max is 80 lbs.'
      );
    });
  });
});
