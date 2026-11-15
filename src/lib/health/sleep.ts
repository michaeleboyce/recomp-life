// Sleep from Apple Health: stage samples to one total per night, and a night's
// total to the three answers of the pre-workout check. Pure.
import type { SleepHours } from "@/types";
import { localDateKey } from "./daily";
import type { HealthSleepSample, NightSleep, SleepStage } from "./types";

/** Under this many hours the readiness check reads "<5". */
export const SLEEP_SHORT_HOURS = 5;
/** From this many hours the readiness check reads "7+". */
export const SLEEP_FULL_HOURS = 7;

/**
 * Local hour at which a new "night" begins. Sleep starting at or after it
 * counts toward the next day; a nap before it counts toward the same day.
 */
export const SLEEP_DAY_CUTOFF_HOUR = 18;

const ASLEEP_STAGES: readonly SleepStage[] = ["asleep", "core", "deep", "rem"];

/**
 * The readiness answer for a night's sleep.
 *
 * @evidence readiness
 */
export function sleepBucket(asleepMinutes: number): SleepHours {
  const hours = asleepMinutes / 60;
  if (hours < SLEEP_SHORT_HOURS) return "<5";
  if (hours < SLEEP_FULL_HOURS) return "5-7";
  return "7+";
}

/** "7h 12m", for showing where a prefilled answer came from. */
export function formatSleep(asleepMinutes: number): string {
  const total = Math.round(asleepMinutes);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

/** The day a sample counts toward: the day after, when it starts in the evening. */
function nightOf(start: Date): string {
  return localDateKey(new Date(start.getTime() + (24 - SLEEP_DAY_CUTOFF_HOUR) * 60 * 60 * 1000));
}

type Interval = [start: number, end: number];

/** Total minutes covered by the intervals, counting overlapping time once. */
function unionMinutes(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [start, end] of sorted) {
    const from = Math.max(start, cursor);
    if (end > from) {
      total += end - from;
      cursor = end;
    }
  }
  return total / 60000;
}

/**
 * One entry per night that has sleep, oldest first. Time is counted once even
 * when a phone and a watch both recorded it. "In bed" and "awake" samples are
 * ignored, so a night with only "in bed" samples (no watch worn) has no entry.
 * Deep and REM are null when the source recorded no stages.
 */
export function nightlySleep(samples: readonly HealthSleepSample[]): NightSleep[] {
  const byNight = new Map<string, HealthSleepSample[]>();
  for (const sample of samples) {
    if (!ASLEEP_STAGES.includes(sample.stage)) continue;
    if (!(sample.end.getTime() > sample.start.getTime())) continue;
    const day = nightOf(sample.start);
    byNight.set(day, [...(byNight.get(day) ?? []), sample]);
  }

  const span = (list: HealthSleepSample[]): Interval[] =>
    list.map((s) => [s.start.getTime(), s.end.getTime()]);

  return [...byNight.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, night]) => {
      const staged = night.some((s) => s.stage !== "asleep");
      return {
        day,
        asleepMinutes: Math.round(unionMinutes(span(night))),
        deepMinutes: staged
          ? Math.round(unionMinutes(span(night.filter((s) => s.stage === "deep"))))
          : null,
        remMinutes: staged
          ? Math.round(unionMinutes(span(night.filter((s) => s.stage === "rem"))))
          : null,
        start: new Date(Math.min(...night.map((s) => s.start.getTime()))),
        end: new Date(Math.max(...night.map((s) => s.end.getTime()))),
      };
    });
}
