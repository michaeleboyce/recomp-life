import { describe, expect, it } from "vitest";
import { demoHealthData } from "./demoData";
import { nightlySleep } from "./sleep";

describe("demoHealthData", () => {
  // Local times across the day, including before the 06:45 weigh-in and late at night.
  const times: [number, number][] = [
    [0, 5],
    [3, 0],
    [6, 44],
    [6, 45],
    [12, 0],
    [23, 30],
  ];

  it.each(times)("gives thirty past weigh-ins and nights at %i:%i", (hour, minute) => {
    const now = new Date(2026, 10, 10, hour, minute, 0);
    const { weights = [], sleep = [] } = demoHealthData(now);

    expect(weights).toHaveLength(30);
    expect(weights.every((weight) => weight.date.getTime() <= now.getTime())).toBe(true);
    expect(new Set(weights.map((weight) => weight.uuid)).size).toBe(30);
    expect(sleep.every((sample) => sample.end.getTime() <= now.getTime())).toBe(true);
    expect(nightlySleep(sleep)).toHaveLength(30);
  });

  it("is the same for the same moment", () => {
    const now = new Date(2026, 10, 10, 12, 0, 0);
    expect(demoHealthData(now)).toEqual(demoHealthData(now));
  });
});
