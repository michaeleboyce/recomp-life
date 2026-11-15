// An in-memory HealthSource for tests and for trying the screens in a browser.
import type {
  HealthQuantitySample,
  HealthRange,
  HealthSleepSample,
  HealthSource,
  HealthWeight,
  HealthWorkout,
} from "./types";
import { localDateKey } from "./daily";

export interface FakeHealthData {
  weights?: HealthWeight[];
  workouts?: HealthWorkout[];
  sleep?: HealthSleepSample[];
  daily?: HealthQuantitySample[];
  /** Defaults to true. */
  available?: boolean;
}

function inRange(date: Date, range: HealthRange): boolean {
  return date.getTime() >= range.since.getTime() && date.getTime() < range.until.getTime();
}

/** A source that answers from the given data, honouring the requested range. */
export function createFakeHealthSource(data: FakeHealthData = {}): HealthSource {
  return {
    async isAvailable() {
      return data.available === false
        ? { available: false, reason: "Apple Health is only available in the iPhone app." }
        : { available: true };
    },
    async requestAccess() {},
    async readWeights(range) {
      return (data.weights ?? []).filter((w) => inRange(w.date, range));
    },
    async readWorkouts(range) {
      return (data.workouts ?? []).filter((w) => inRange(w.start, range));
    },
    async readSleep(range) {
      return (data.sleep ?? []).filter((s) => inRange(s.end, range));
    },
    async readDaily(range) {
      const since = localDateKey(range.since);
      const until = localDateKey(range.until);
      return (data.daily ?? []).filter((d) => d.day >= since && d.day <= until);
    },
  };
}
