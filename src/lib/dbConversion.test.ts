import { describe, it, expect } from 'vitest';
import { roundToNearest5, barbellToDumbbell, barbellToBothHands, dumbbellToBarbell } from './dbConversion';

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

describe('dumbbellToBarbell', () => {
  it('converts 60 lb dumbbell per hand to 145 lb barbell', () => {
    // 60 * 2 = 120, * 1.20 = 144, round to 145
    expect(dumbbellToBarbell(60)).toBe(145);
  });

  it('converts 40 lb dumbbell per hand to 95 lb barbell', () => {
    // 40 * 2 = 80, * 1.20 = 96, round to 95
    expect(dumbbellToBarbell(40)).toBe(95);
  });

  it('converts 35 lb dumbbell per hand to 85 lb barbell', () => {
    // 35 * 2 = 70, * 1.20 = 84, round to 85
    expect(dumbbellToBarbell(35)).toBe(85);
  });
});
