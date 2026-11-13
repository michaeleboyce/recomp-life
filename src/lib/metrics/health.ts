// Metrics from Apple Health's daily values: one point per day that has a value.
// These are for looking at only; no coaching rule reads them. Pure.
import type { HealthDailyValues } from "@/lib/health/types";
import { defineMetric } from "./helpers";
import type { MetricDef, Point } from "./types";

/** Noon, local time, of a "YYYY-MM-DD" day: the point's place on the time axis. */
function dayToMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12).getTime();
}

type DailyField = Exclude<keyof HealthDailyValues, "day">;

function dailyMetric(
  meta: Omit<MetricDef, "compute" | "scope">,
  field: DailyField,
  /** Converts the stored value to the plotted one and gives the point its label. */
  shape: (stored: number) => { v: number; label?: string } = (v) => ({ v })
): MetricDef {
  return defineMetric({ ...meta, scope: "global" }, (source) =>
    (source.healthDaily ?? []).flatMap((row): Point[] => {
      const stored = row[field];
      if (stored === null || stored === undefined) return [];
      return [{ t: dayToMs(row.day), ...shape(stored), refId: row.day }];
    })
  );
}

const whole = (v: number) => Math.round(v).toLocaleString("en-US");
const oneDecimal = (v: number) => v.toFixed(1);

/** "7h 12m" for a number of hours. */
function hoursAndMinutes(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Hours asleep each night, on the day of waking. */
export const sleepHours = dailyMetric(
  { id: "sleepHours", label: "Sleep", unit: "h", better: "up", format: hoursAndMinutes },
  "sleepMinutes",
  (minutes) => ({ v: minutes / 60, label: hoursAndMinutes(minutes / 60) })
);

export const restingHr = dailyMetric(
  { id: "restingHr", label: "Resting heart rate", unit: "bpm", better: "down", format: whole },
  "restingHr"
);

/** Heart-rate variability (SDNN), the day's average. */
export const hrv = dailyMetric(
  { id: "hrv", label: "Heart rate variability", unit: "ms", better: "up", format: whole },
  "hrvMs"
);

export const steps = dailyMetric(
  { id: "steps", label: "Steps", unit: "steps", better: "none", format: whole },
  "steps"
);

export const activeEnergy = dailyMetric(
  { id: "activeEnergy", label: "Active energy", unit: "kcal", better: "none", format: whole },
  "activeEnergyKcal"
);

export const vo2Max = dailyMetric(
  { id: "vo2Max", label: "VO2 max", unit: "mL/kg/min", better: "up", format: oneDecimal },
  "vo2Max"
);

export const bodyFat = dailyMetric(
  { id: "bodyFat", label: "Body fat", unit: "%", better: "none", format: oneDecimal },
  "bodyFatPct"
);

/** Calories eaten, as logged in Apple Health by a food-tracking app. */
export const energyIntake = dailyMetric(
  { id: "energyIntake", label: "Calories eaten", unit: "kcal", better: "none", format: whole },
  "dietaryKcal"
);
