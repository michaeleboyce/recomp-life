// Readiness metrics: the pre-workout sleep and stress/energy answers as ordered
// levels, one point per log. `format` turns a level back into its word so a chart
// axis can show "7+ h" or "Good" at 1, 2 and 3. Pure.
import type { SleepHours, StressLevel } from "@/types";
import { defineMetric, toMs } from "./helpers";

/** Sleep answer -> level. Higher is more sleep. */
export const SLEEP_LEVELS: Record<SleepHours, number> = { "<5": 1, "5-7": 2, "7+": 3 };
/** Stress / energy answer -> level. Higher is better ("low" is the rough day). */
export const STRESS_LEVELS: Record<StressLevel, number> = { low: 1, normal: 2, good: 3 };

const SLEEP_WORDS = ["<5 h", "5-7 h", "7+ h"];
const STRESS_WORDS = ["Low", "Normal", "Good"];

/** The word for a level; an averaged value goes to the nearest level. */
function word(words: string[], value: number): string {
  const level = Math.min(words.length, Math.max(1, Math.round(value)));
  return words[level - 1] ?? "";
}

/** Sleep before each workout: 1 = "<5 h", 2 = "5-7 h", 3 = "7+ h". */
export const sleep = defineMetric(
  {
    id: "sleep",
    label: "Sleep",
    unit: "level",
    better: "up",
    scope: "global",
    format: (v) => word(SLEEP_WORDS, v),
  },
  (source) =>
    source.readiness.map((log) => {
      const v = SLEEP_LEVELS[log.sleepHours] ?? NaN;
      return { t: toMs(log.date), v, label: word(SLEEP_WORDS, v), refId: log.sessionId };
    })
);

/** Stress / energy before each workout: 1 = "Low", 2 = "Normal", 3 = "Good". */
export const stress = defineMetric(
  {
    id: "stress",
    label: "Stress / energy",
    unit: "level",
    better: "up",
    scope: "global",
    format: (v) => word(STRESS_WORDS, v),
  },
  (source) =>
    source.readiness.map((log) => {
      const v = STRESS_LEVELS[log.stressLevel] ?? NaN;
      return { t: toMs(log.date), v, label: word(STRESS_WORDS, v), refId: log.sessionId };
    })
);
