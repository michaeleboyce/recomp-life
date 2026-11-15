// Made-up Apple Health data for trying the screens in a browser, where the real
// thing is unavailable. Deterministic: the same `now` gives the same data.
import type { FakeHealthData } from "./fakeSource";
import { localDateKey } from "./daily";
import type { HealthQuantitySample, HealthSleepSample, HealthWeight, HealthWorkout } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A repeatable wobble between -1 and 1 for day `i`. */
const wobble = (i: number, salt: number) => Math.sin(i * 12.9898 + salt * 78.233);

/** Thirty days of weights, sleep, daily values and a few outside workouts. */
export function demoHealthData(now: Date, days = 30): FakeHealthData {
  const weights: HealthWeight[] = [];
  const sleep: HealthSleepSample[] = [];
  const daily: HealthQuantitySample[] = [];
  const workouts: HealthWorkout[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const morning = new Date(now.getTime() - i * DAY_MS);
    morning.setHours(6, 45, 0, 0);
    const day = localDateKey(morning);

    weights.push({
      uuid: `demo-weight-${day}`,
      sourceName: "Demo scale",
      date: morning,
      kilograms: 98 + i * 0.03 + wobble(i, 1) * 0.4,
    });

    const asleepHours = 6.9 + wobble(i, 2) * 0.9;
    const wake = new Date(morning.getTime() - 15 * 60 * 1000);
    const start = new Date(wake.getTime() - asleepHours * 60 * 60 * 1000);
    const deepEnd = new Date(start.getTime() + 55 * 60 * 1000);
    const remStart = new Date(wake.getTime() - 80 * 60 * 1000);
    sleep.push(
      { uuid: `demo-deep-${day}`, sourceName: "Demo watch", stage: "deep", start, end: deepEnd },
      { uuid: `demo-core-${day}`, sourceName: "Demo watch", stage: "core", start: deepEnd, end: remStart },
      { uuid: `demo-rem-${day}`, sourceName: "Demo watch", stage: "rem", start: remStart, end: wake }
    );

    daily.push(
      { quantity: "steps", day, value: Math.round(8200 + wobble(i, 3) * 3000) },
      { quantity: "restingHr", day, value: Math.round(55 + wobble(i, 4) * 3) },
      { quantity: "hrvMs", day, value: Math.round(48 + wobble(i, 5) * 9) },
      { quantity: "activeEnergyKcal", day, value: Math.round(520 + wobble(i, 6) * 160) },
      { quantity: "exerciseMinutes", day, value: Math.round(38 + wobble(i, 7) * 20) }
    );

    if (i % 4 === 1) {
      const runStart = new Date(morning.getTime() + 11 * 60 * 60 * 1000);
      const seconds = Math.round(1700 + wobble(i, 8) * 300);
      workouts.push({
        uuid: `demo-run-${day}`,
        sourceName: "Demo watch",
        type: "running",
        rawType: "running",
        start: runStart,
        end: new Date(runStart.getTime() + seconds * 1000),
        durationSeconds: seconds,
        distanceMetres: Math.round(4800 + wobble(i, 9) * 700),
        indoor: false,
        activeEnergyKcal: 330,
        avgHeartRate: null,
        maxHeartRate: null,
      });
    }
    if (i % 7 === 3) {
      const yogaStart = new Date(morning.getTime() + 12 * 60 * 60 * 1000);
      workouts.push({
        uuid: `demo-yoga-${day}`,
        sourceName: "Demo watch",
        type: "yoga",
        rawType: "yoga",
        start: yogaStart,
        end: new Date(yogaStart.getTime() + 45 * 60 * 1000),
        durationSeconds: 2700,
        distanceMetres: null,
        indoor: true,
        activeEnergyKcal: 140,
        avgHeartRate: null,
        maxHeartRate: null,
      });
    }
  }

  return { weights, sleep, daily, workouts };
}
