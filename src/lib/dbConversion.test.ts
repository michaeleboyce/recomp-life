import { describe, it, expect } from 'vitest';
import {
  BARBELL_FROM_DUMBBELL_FACTOR,
  DUMBBELL_LOAD_FACTOR,
  barbellToBothHands,
  barbellToDumbbell,
  ceilToStep,
  dumbbellToBarbell,
  roundToNearest5,
  roundToStep,
} from './dbConversion';

describe('roundToNearest5', () => {
  it('rounds 58 to 60', () => {
    expect(roundToNearest5(58)).toBe(60);
  });

  it('rounds 88 to 90', () => {
    expect(roundToNearest5(88)).toBe(90);
  });

  it('rounds 34 to 35', () => {
    expect(roundToNearest5(34)).toBe(35);
  });

  it('keeps exact multiples of 5 unchanged', () => {
    expect(roundToNearest5(40)).toBe(40);
    expect(roundToNearest5(100)).toBe(100);
    expect(roundToNearest5(0)).toBe(0);
  });

  it('rounds 2.5 to 5', () => {
    expect(roundToNearest5(2.5)).toBe(5);
  });

  it('rounds 12 to 10', () => {
    expect(roundToNearest5(12)).toBe(10);
  });
});

describe('barbellToDumbbell', () => {
  it('converts 145 lb barbell to 60 lb dumbbell per hand', () => {
    // 145 * 0.80 = 116, / 2 = 58, round to 60
    expect(barbellToDumbbell(145)).toBe(60);
  });

  it('converts 220 lb barbell to 90 lb dumbbell per hand', () => {
    // 220 * 0.80 = 176, / 2 = 88, round to 90
    expect(barbellToDumbbell(220)).toBe(90);
  });

  it('converts 85 lb barbell to 35 lb dumbbell per hand', () => {
    // 85 * 0.80 = 68, / 2 = 34, round to 35
    expect(barbellToDumbbell(85)).toBe(35);
  });

  it('converts 100 lb barbell to 40 lb dumbbell per hand', () => {
    // 100 * 0.80 = 80, / 2 = 40
    expect(barbellToDumbbell(100)).toBe(40);
  });
});

describe('barbellToBothHands', () => {
  it('converts 135 lb barbell to 110 lb single dumbbell', () => {
    // 135 * 0.80 = 108, round to 110
    expect(barbellToBothHands(135)).toBe(110);
  });

  it('converts 100 lb barbell to 80 lb single dumbbell', () => {
    // 100 * 0.80 = 80
    expect(barbellToBothHands(100)).toBe(80);
  });

  it('converts 200 lb barbell to 160 lb single dumbbell', () => {
    // 200 * 0.80 = 160
    expect(barbellToBothHands(200)).toBe(160);
  });

  it('converts 85 lb barbell to 70 lb single dumbbell', () => {
    // 85 * 0.80 = 68, round to 70
    expect(barbellToBothHands(85)).toBe(70);
  });

  it('is always higher than barbellToDumbbell for the same input', () => {
    // both_hands should produce a larger weight since we don't divide by 2
    for (const w of [85, 100, 135, 200]) {
      expect(barbellToBothHands(w)).toBeGreaterThan(barbellToDumbbell(w));
    }
  });
});

// 2026-11-15: the factor was 1.2, which is not the inverse of the 0.8 conversion
// (145 lb barbell -> 60 a hand -> 145, but 150 -> 60 -> 145 and 60 a hand read as 145).
// It is now 1 / 0.8 = 1.25, so a weight converted there and back lands where it began.
describe('dumbbellToBarbell', () => {
  it('converts 60 lb dumbbell per hand to 150 lb barbell', () => {
    // 60 * 2 = 120, / 0.80 = 150
    expect(dumbbellToBarbell(60)).toBe(150);
  });

  it('converts 40 lb dumbbell per hand to 100 lb barbell', () => {
    // 40 * 2 = 80, / 0.80 = 100
    expect(dumbbellToBarbell(40)).toBe(100);
  });

  it('converts 35 lb dumbbell per hand to 90 lb barbell', () => {
    // 35 * 2 = 70, / 0.80 = 87.5, round to 90
    expect(dumbbellToBarbell(35)).toBe(90);
  });

  it('reads one dumbbell held in both hands as the whole load', () => {
    // 80 / 0.80 = 100, not 80 * 2 / 0.80 = 200
    expect(dumbbellToBarbell(80, 'both_hands')).toBe(100);
  });

  it('is the inverse of barbellToDumbbell and barbellToBothHands', () => {
    expect(BARBELL_FROM_DUMBBELL_FACTOR * DUMBBELL_LOAD_FACTOR).toBeCloseTo(1, 10);
    for (let perHand = 5; perHand <= 120; perHand += 5) {
      expect(barbellToDumbbell(dumbbellToBarbell(perHand))).toBe(perHand);
    }
    for (let one = 20; one <= 120; one += 5) {
      expect(barbellToBothHands(dumbbellToBarbell(one, 'both_hands'))).toBe(one);
    }
  });
});

describe('rounding to the dumbbell step', () => {
  it('roundToStep rounds to any step, and to 5 when the step is not usable', () => {
    expect(roundToStep(58, 2.5)).toBe(57.5);
    expect(roundToStep(58, 5)).toBe(60);
    expect(roundToStep(58, 0)).toBe(60);
    expect(ceilToStep(51, 5)).toBe(55);
    expect(ceilToStep(50, 5)).toBe(50);
  });

  it('the conversions round to the step they are given (5 when none is)', () => {
    // 145 * 0.80 / 2 = 58: 57.5 with 2.5 lb dumbbells, 60 with 5 lb steps.
    expect(barbellToDumbbell(145, 2.5)).toBe(57.5);
    expect(barbellToDumbbell(145)).toBe(60);
    // 135 * 0.80 = 108: 107.5 with 2.5 lb steps, 110 with 5.
    expect(barbellToBothHands(135, 2.5)).toBe(107.5);
    expect(barbellToBothHands(135)).toBe(110);
  });
});
