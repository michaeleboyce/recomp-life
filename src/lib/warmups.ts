import type { WarmUpSet, WorkoutLocation, EquipmentProfile } from "@/types";

export function roundToNearest5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

export function generateWarmUpSets(
  workingWeight: number,
  location: WorkoutLocation,
  equipment: EquipmentProfile
): WarmUpSet[] {
  if (location === "home") {
    // Dumbbell warm-ups: start light, fewer sets
    // workingWeight here is the DB weight per hand
    return [
      {
        weight: Math.max(roundToNearest5(workingWeight * 0.4), 5),
        reps: 10,
        label: "Light",
      },
      {
        weight: Math.min(
          roundToNearest5(workingWeight * 0.7),
          workingWeight
        ),
        reps: 5,
        label: "~70%",
      },
    ];
  }

  // Gym warm-ups with barbell
  const barWeight = equipment.barWeight;

  if (workingWeight <= 95) {
    return [
      { weight: barWeight, reps: 10, label: "Empty bar" },
      {
        weight: Math.min(
          roundToNearest5(workingWeight * 0.7),
          workingWeight
        ),
        reps: 5,
        label: "~70%",
      },
    ];
  }

  return [
    { weight: barWeight, reps: 10, label: "Empty bar" },
    {
      weight: Math.min(
        roundToNearest5(workingWeight * 0.5),
        workingWeight
      ),
      reps: 5,
      label: "~50%",
    },
    {
      weight: Math.min(
        roundToNearest5(workingWeight * 0.7),
        workingWeight
      ),
      reps: 3,
      label: "~70%",
    },
    {
      weight: Math.min(
        roundToNearest5(workingWeight * 0.85),
        workingWeight
      ),
      reps: 1,
      label: "~85%",
    },
  ];
}
