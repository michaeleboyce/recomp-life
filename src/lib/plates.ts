// Barbell plate maths. Pure: bar weight and available plates come from the caller
// (settings.equipment).

export interface PlateCount {
  plate: number;
  count: number;
}

export interface PlateLoad {
  /** Plates on one side, heaviest first, grouped by size. */
  perSide: PlateCount[];
  /** The same plates listed one by one, heaviest first: [45, 45, 10]. */
  plates: number[];
  /** What the bar weighs with those plates on both sides. */
  loadableWeight: number;
  /** False when the target cannot be loaded exactly with the available plates. */
  exact: boolean;
}

/**
 * Plates for ONE side of the bar to reach `targetWeight`, heaviest first. Greedy:
 * when the target cannot be loaded exactly, the result is the closest load below it.
 * Empty when the target is the bar weight or less.
 */
export function calculatePlatesPerSide(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[]
): PlateCount[] {
  let remaining = (targetWeight - barWeight) / 2;
  if (remaining <= 0) return [];

  const sorted = [...availablePlates].sort((a, b) => b - a);
  const result: PlateCount[] = [];

  for (const plate of sorted) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      result.push({ plate, count });
      remaining -= plate * count;
    }
  }

  return result;
}

/** Total weight of the bar with `perSide` loaded on both sides. */
export function loadedWeight(perSide: PlateCount[], barWeight: number): number {
  return barWeight + 2 * perSide.reduce((sum, p) => sum + p.plate * p.count, 0);
}

/** The per-side breakdown for a target weight and whether it is an exact load. */
export function describePlateLoad(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[]
): PlateLoad {
  const perSide = calculatePlatesPerSide(targetWeight, barWeight, availablePlates);
  const loadableWeight = loadedWeight(perSide, barWeight);
  return {
    perSide,
    plates: perSide.flatMap((p) => Array.from({ length: p.count }, () => p.plate)),
    loadableWeight,
    exact: loadableWeight === targetWeight,
  };
}
