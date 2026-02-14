import { describe, it, expect } from "vitest";
import { generateWarmUpSets, roundToNearest5 } from "./warmups";
import type { EquipmentProfile } from "@/types";

const defaultEquipment: EquipmentProfile = {
  maxDumbbellWeight: 80,
  dumbbellIncrementLbs: 5,
  hasBench: true,
  hasResistanceBands: false,
  hasPullUpBar: false,
  gymBarbellIncrementLbs: 5,
  availablePlates: [45, 35, 25, 10, 5, 2.5],
  barWeight: 45,
};

describe("roundToNearest5", () => {
  it("rounds down when remainder < 2.5", () => {
    expect(roundToNearest5(12)).toBe(10);
    expect(roundToNearest5(72)).toBe(70);
  });

  it("rounds up when remainder >= 2.5", () => {
    expect(roundToNearest5(13)).toBe(15);
    expect(roundToNearest5(72.5)).toBe(75);
    expect(roundToNearest5(77.5)).toBe(80);
  });

  it("returns same value when already a multiple of 5", () => {
    expect(roundToNearest5(45)).toBe(45);
    expect(roundToNearest5(100)).toBe(100);
    expect(roundToNearest5(0)).toBe(0);
  });
});

describe("generateWarmUpSets", () => {
  describe("gym warm-ups, working weight > 95", () => {
    it("returns 4 sets for working weight 190", () => {
      const sets = generateWarmUpSets(190, "gym", defaultEquipment);
      expect(sets).toHaveLength(4);
      expect(sets[0]).toEqual({ weight: 45, reps: 10, label: "Empty bar" });
      expect(sets[1]).toEqual({ weight: 95, reps: 5, label: "~50%" });
      expect(sets[2]).toEqual({ weight: 135, reps: 3, label: "~70%" });
      expect(sets[3]).toEqual({ weight: 160, reps: 1, label: "~85%" });
    });

    it("returns 4 sets for working weight 145", () => {
      const sets = generateWarmUpSets(145, "gym", defaultEquipment);
      expect(sets).toHaveLength(4);
      expect(sets[0]).toEqual({ weight: 45, reps: 10, label: "Empty bar" });
      expect(sets[1]).toEqual({ weight: 75, reps: 5, label: "~50%" });
      expect(sets[2]).toEqual({ weight: 100, reps: 3, label: "~70%" });
      expect(sets[3]).toEqual({ weight: 125, reps: 1, label: "~85%" });
    });
  });

  describe("gym warm-ups, working weight <= 95", () => {
    it("returns 2 sets for working weight 85", () => {
      const sets = generateWarmUpSets(85, "gym", defaultEquipment);
      expect(sets).toHaveLength(2);
      expect(sets[0]).toEqual({ weight: 45, reps: 10, label: "Empty bar" });
      expect(sets[1]).toEqual({ weight: 60, reps: 5, label: "~70%" });
    });
  });

  describe("home warm-ups (dumbbell)", () => {
    it("returns 2 sets for working weight 60", () => {
      const sets = generateWarmUpSets(60, "home", defaultEquipment);
      expect(sets).toHaveLength(2);
      expect(sets[0]).toEqual({ weight: 25, reps: 10, label: "Light" });
      expect(sets[1]).toEqual({ weight: 40, reps: 5, label: "~70%" });
    });

    it("returns 2 sets for working weight 35", () => {
      const sets = generateWarmUpSets(35, "home", defaultEquipment);
      expect(sets).toHaveLength(2);
      expect(sets[0]).toEqual({ weight: 15, reps: 10, label: "Light" });
      expect(sets[1]).toEqual({ weight: 25, reps: 5, label: "~70%" });
    });
  });

  describe("edge cases", () => {
    it("all warm-up weights round to nearest 5", () => {
      const sets = generateWarmUpSets(133, "gym", defaultEquipment);
      for (const set of sets) {
        expect(set.weight % 5).toBe(0);
      }
    });

    it("light warm-up weight minimum is 5 lbs", () => {
      // Very light dumbbell working weight
      const sets = generateWarmUpSets(10, "home", defaultEquipment);
      expect(sets[0].weight).toBeGreaterThanOrEqual(5);
    });

    it("no warm-up weight exceeds working weight", () => {
      const workingWeight = 50;
      const sets = generateWarmUpSets(workingWeight, "gym", defaultEquipment);
      for (const set of sets) {
        expect(set.weight).toBeLessThanOrEqual(workingWeight);
      }
    });

    it("no warm-up weight exceeds working weight for home", () => {
      const workingWeight = 15;
      const sets = generateWarmUpSets(workingWeight, "home", defaultEquipment);
      for (const set of sets) {
        expect(set.weight).toBeLessThanOrEqual(workingWeight);
      }
    });

    it("custom bar weight (35 lb bar) works correctly", () => {
      const customEquipment: EquipmentProfile = {
        ...defaultEquipment,
        barWeight: 35,
      };
      const sets = generateWarmUpSets(190, "gym", customEquipment);
      expect(sets[0]).toEqual({ weight: 35, reps: 10, label: "Empty bar" });
      // Other sets use percentage-based calculations, unaffected by bar weight
      expect(sets[1]).toEqual({ weight: 95, reps: 5, label: "~50%" });
      expect(sets[2]).toEqual({ weight: 135, reps: 3, label: "~70%" });
      expect(sets[3]).toEqual({ weight: 160, reps: 1, label: "~85%" });
    });

    it("gym warm-ups at exactly 95 return 2 sets", () => {
      const sets = generateWarmUpSets(95, "gym", defaultEquipment);
      expect(sets).toHaveLength(2);
      expect(sets[0]).toEqual({ weight: 45, reps: 10, label: "Empty bar" });
      expect(sets[1]).toEqual({ weight: 65, reps: 5, label: "~70%" });
    });
  });
});
