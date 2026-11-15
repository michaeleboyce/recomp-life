// Folds Apple Health values into one row per local day. Pure.
import type { HealthDailyValues, HealthQuantitySample, NightSleep } from "./types";

/** Local calendar day of a date, "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Row id (and clientId) of the daily row for a day. */
export function dailyRowId(day: string): string {
  return `hd:${day}`;
}

function emptyDay(day: string): HealthDailyValues {
  return {
    day,
    sleepMinutes: null,
    sleepDeepMinutes: null,
    sleepRemMinutes: null,
    steps: null,
    restingHr: null,
    hrvMs: null,
    activeEnergyKcal: null,
    exerciseMinutes: null,
    vo2Max: null,
    bodyFatPct: null,
    leanMassLbs: null,
    dietaryKcal: null,
    proteinG: null,
  };
}

/**
 * One row per day that has any value, oldest first. When a quantity appears
 * more than once for a day the last sample wins. Non-finite values are dropped.
 */
export function foldDaily(
  quantities: readonly HealthQuantitySample[],
  nights: readonly NightSleep[]
): HealthDailyValues[] {
  const days = new Map<string, HealthDailyValues>();
  const rowFor = (day: string) => {
    let row = days.get(day);
    if (!row) {
      row = emptyDay(day);
      days.set(day, row);
    }
    return row;
  };

  for (const sample of quantities) {
    if (!Number.isFinite(sample.value)) continue;
    rowFor(sample.day)[sample.quantity] = sample.value;
  }
  for (const night of nights) {
    const row = rowFor(night.day);
    row.sleepMinutes = night.asleepMinutes;
    row.sleepDeepMinutes = night.deepMinutes;
    row.sleepRemMinutes = night.remMinutes;
  }

  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * True when two rows for the same day hold the same values, so an import can
 * skip a write (and a sync) when nothing changed.
 */
export function sameDailyValues(a: HealthDailyValues, b: HealthDailyValues): boolean {
  return (Object.keys(emptyDay(a.day)) as (keyof HealthDailyValues)[]).every(
    (key) => a[key] === b[key]
  );
}
