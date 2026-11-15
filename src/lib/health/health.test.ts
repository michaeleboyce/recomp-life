import { describe, it, expect } from "vitest";
import { kgToLbs, metresToMiles } from "./units";
import { importedRowId, isStrengthWorkout, mapWorkout } from "./mapWorkout";
import { findManualMatch, HEALTH_MATCH_WINDOW_MINUTES } from "./dedupe";
import { HEALTH_SESSION_OVERLAP, linkSessionWorkout } from "./linkSession";
import {
  formatSleep,
  nightlySleep,
  sleepBucket,
  SLEEP_FULL_HOURS,
  SLEEP_SHORT_HOURS,
} from "./sleep";
import { dailyRowId, foldDaily, localDateKey, sameDailyValues } from "./daily";
import { createFakeHealthSource } from "./fakeSource";
import type { HealthSleepSample, HealthWorkout, SleepStage } from "./types";

/** Local time, so the tests do not depend on the machine's time zone. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

function workout(overrides: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    uuid: "W-1",
    sourceName: "Apple Watch",
    type: "running",
    rawType: "running",
    start: at(10, 7),
    end: at(10, 7, 30),
    durationSeconds: 1800,
    distanceMetres: 5000,
    indoor: false,
    activeEnergyKcal: 320,
    avgHeartRate: 150,
    maxHeartRate: 171,
    ...overrides,
  };
}

function sleep(stage: SleepStage, start: Date, end: Date, uuid = `${stage}-${start.getTime()}`): HealthSleepSample {
  return { uuid, sourceName: "Apple Watch", stage, start, end };
}

describe("units", () => {
  it("converts kilograms to pounds to one decimal", () => {
    expect(kgToLbs(80)).toBe(176.4);
    expect(kgToLbs(0)).toBe(0);
  });

  it("converts metres to miles to two decimals", () => {
    expect(metresToMiles(5000)).toBe(3.11);
    expect(metresToMiles(1609.344)).toBe(1);
  });
});

describe("mapWorkout", () => {
  it("maps an outdoor run to a run with no effort rating", () => {
    const mapped = mapWorkout(workout());
    expect(mapped).toEqual({
      table: "runs",
      record: {
        externalId: "W-1",
        sourceName: "Apple Watch",
        date: at(10, 7),
        durationMinutes: 30,
        distanceMiles: 3.11,
        notes: "",
        perceivedEffort: null,
        type: "outdoor",
        category: "other",
      },
    });
  });

  it("marks an indoor run as treadmill", () => {
    const mapped = mapWorkout(workout({ indoor: true }));
    expect(mapped?.table === "runs" && mapped.record.type).toBe("treadmill");
  });

  it.each([
    ["cycling", "cycling"],
    ["hiking", "hiking"],
    ["walking", "walking"],
    ["yoga", "yoga"],
  ] as const)("maps %s to the %s activity kind", (type, kind) => {
    const mapped = mapWorkout(workout({ type, rawType: type }));
    expect(mapped?.table).toBe("activities");
    expect(mapped?.table === "activities" && mapped.record.kind).toBe(kind);
    expect(mapped?.table === "activities" && mapped.record.style).toBeNull();
    expect(mapped?.record.notes).toBe("");
    expect(mapped?.record.perceivedEffort).toBeNull();
  });

  it("keeps Health's name for a kind the app has no name for", () => {
    const mapped = mapWorkout(
      workout({ type: "other", rawType: "highIntensityIntervalTraining", distanceMetres: null })
    );
    expect(mapped?.table === "activities" && mapped.record.kind).toBe("other");
    expect(mapped?.record.notes).toBe("High intensity interval training");
    expect(mapped?.record.distanceMiles).toBeNull();
  });

  it("treats zero distance as no distance", () => {
    expect(mapWorkout(workout({ type: "yoga", distanceMetres: 0 }))?.record.distanceMiles).toBeNull();
  });

  it("does not import a strength workout", () => {
    const strength = workout({ type: "strength", rawType: "traditionalStrengthTraining" });
    expect(isStrengthWorkout(strength)).toBe(true);
    expect(mapWorkout(strength)).toBeNull();
  });

  it("derives a stable row id from the HealthKit UUID", () => {
    expect(importedRowId("ABC")).toBe("hk:ABC");
  });
});

describe("findManualMatch", () => {
  const start = at(10, 7);
  const minutesAfter = (m: number) => new Date(start.getTime() + m * 60000);

  it("matches a hand-logged row inside the window", () => {
    const row = { id: "r1", date: minutesAfter(HEALTH_MATCH_WINDOW_MINUTES) };
    expect(findManualMatch(start, [row])).toBe(row);
  });

  it("ignores a row outside the window", () => {
    const row = { id: "r1", date: minutesAfter(HEALTH_MATCH_WINDOW_MINUTES + 1) };
    expect(findManualMatch(start, [row])).toBeNull();
  });

  it("ignores rows that already carry an external id", () => {
    expect(findManualMatch(start, [{ id: "r1", date: start, externalId: "W-0" }])).toBeNull();
  });

  it("picks the closest of several and accepts ISO-string dates", () => {
    const far = { id: "far", date: minutesAfter(-20).toISOString() };
    const near = { id: "near", date: minutesAfter(5).toISOString() };
    expect(findManualMatch(start, [far, near])).toBe(near);
  });
});

describe("linkSessionWorkout", () => {
  const session = { startedAt: at(10, 18), completedAt: at(10, 19) };
  const strength = (start: Date, end: Date, uuid = "S-1") =>
    workout({ uuid, type: "strength", rawType: "traditionalStrengthTraining", start, end,
      durationSeconds: (end.getTime() - start.getTime()) / 1000, distanceMetres: null });

  it("links the strength workout recorded during the session", () => {
    expect(linkSessionWorkout(session, [strength(at(10, 17, 58), at(10, 19, 3))])).toEqual({
      externalId: "S-1",
      sourceName: "Apple Watch",
      avgHeartRate: 150,
      maxHeartRate: 171,
      activeEnergyKcal: 320,
      durationSeconds: 3900,
    });
  });

  it("requires the overlap share", () => {
    expect(HEALTH_SESSION_OVERLAP).toBe(0.5);
    expect(linkSessionWorkout(session, [strength(at(10, 18, 31), at(10, 20))])).toBeNull();
    expect(linkSessionWorkout(session, [strength(at(10, 18, 30), at(10, 20))])).not.toBeNull();
  });

  it("never links a workout that is not strength training", () => {
    expect(linkSessionWorkout(session, [workout({ start: at(10, 18), end: at(10, 19) })])).toBeNull();
  });

  it("prefers the workout with the most overlap", () => {
    const linked = linkSessionWorkout(session, [
      strength(at(10, 18, 25), at(10, 19), "short"),
      strength(at(10, 18), at(10, 19), "full"),
    ]);
    expect(linked?.externalId).toBe("full");
  });

  it("returns null for an unfinished session", () => {
    expect(
      linkSessionWorkout({ startedAt: at(10, 18), completedAt: null }, [strength(at(10, 18), at(10, 19))])
    ).toBeNull();
  });
});

describe("sleepBucket", () => {
  it("uses the readiness cut-offs", () => {
    expect(sleepBucket(SLEEP_SHORT_HOURS * 60 - 1)).toBe("<5");
    expect(sleepBucket(SLEEP_SHORT_HOURS * 60)).toBe("5-7");
    expect(sleepBucket(SLEEP_FULL_HOURS * 60 - 1)).toBe("5-7");
    expect(sleepBucket(SLEEP_FULL_HOURS * 60)).toBe("7+");
  });

  it("formats a duration", () => {
    expect(formatSleep(432)).toBe("7h 12m");
    expect(formatSleep(59.6)).toBe("1h 0m");
  });
});

describe("nightlySleep", () => {
  it("totals a night across midnight under the wake day", () => {
    const nights = nightlySleep([
      sleep("core", at(10, 23), at(11, 2)),
      sleep("deep", at(11, 2), at(11, 3)),
      sleep("awake", at(11, 3), at(11, 3, 15)),
      sleep("rem", at(11, 3, 15), at(11, 4, 45)),
      sleep("core", at(11, 4, 45), at(11, 6, 30)),
      sleep("inBed", at(10, 22, 30), at(11, 6, 45)),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({
      day: "2026-11-11",
      asleepMinutes: 180 + 60 + 90 + 105,
      deepMinutes: 60,
      remMinutes: 90,
    });
    expect(nights[0].start).toEqual(at(10, 23));
    expect(nights[0].end).toEqual(at(11, 6, 30));
  });

  it("counts time recorded by two sources once", () => {
    const nights = nightlySleep([
      sleep("asleep", at(10, 23), at(11, 6), "phone"),
      sleep("asleep", at(10, 23, 30), at(11, 6, 30), "watch"),
    ]);
    expect(nights[0].asleepMinutes).toBe(450);
    expect(nights[0].deepMinutes).toBeNull();
    expect(nights[0].remMinutes).toBeNull();
  });

  it("counts an afternoon nap toward the same day and separates nights", () => {
    const nights = nightlySleep([
      sleep("asleep", at(11, 14), at(11, 14, 40)),
      sleep("asleep", at(11, 23), at(12, 6)),
      sleep("asleep", at(11, 0, 30), at(11, 6)),
    ]);
    expect(nights.map((n) => [n.day, n.asleepMinutes])).toEqual([
      ["2026-11-11", 330 + 40],
      ["2026-11-12", 420],
    ]);
  });

  it("has no entry for a night with only in-bed time", () => {
    expect(nightlySleep([sleep("inBed", at(10, 23), at(11, 7))])).toEqual([]);
  });
});

describe("foldDaily", () => {
  it("builds one row per day from quantities and nights", () => {
    const nights = nightlySleep([sleep("asleep", at(10, 23), at(11, 6))]);
    const rows = foldDaily(
      [
        { quantity: "steps", day: "2026-11-11", value: 4000 },
        { quantity: "steps", day: "2026-11-11", value: 9120 },
        { quantity: "restingHr", day: "2026-11-10", value: 52 },
        { quantity: "hrvMs", day: "2026-11-11", value: NaN },
      ],
      nights
    );
    expect(rows.map((r) => r.day)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(rows[0]).toMatchObject({ restingHr: 52, steps: null, sleepMinutes: null });
    expect(rows[1]).toMatchObject({ steps: 9120, hrvMs: null, sleepMinutes: 420 });
  });

  it("compares rows by value", () => {
    const [a] = foldDaily([{ quantity: "steps", day: "2026-11-11", value: 1 }], []);
    const [b] = foldDaily([{ quantity: "steps", day: "2026-11-11", value: 1 }], []);
    const [c] = foldDaily([{ quantity: "steps", day: "2026-11-11", value: 2 }], []);
    expect(sameDailyValues(a, b)).toBe(true);
    expect(sameDailyValues(a, c)).toBe(false);
  });

  it("names days and rows", () => {
    expect(localDateKey(at(3, 23, 59))).toBe("2026-11-03");
    expect(dailyRowId("2026-11-03")).toBe("hd:2026-11-03");
  });
});

describe("createFakeHealthSource", () => {
  const range = { since: at(10, 0), until: at(11, 0) };

  it("answers from its data within the range", async () => {
    const source = createFakeHealthSource({
      weights: [
        { uuid: "a", sourceName: null, date: at(10, 8), kilograms: 80 },
        { uuid: "b", sourceName: null, date: at(11, 8), kilograms: 81 },
      ],
      workouts: [workout(), workout({ uuid: "W-2", start: at(12, 7) })],
      daily: [
        { quantity: "steps", day: "2026-11-10", value: 5 },
        { quantity: "steps", day: "2026-11-13", value: 6 },
      ],
    });
    expect(await source.isAvailable()).toEqual({ available: true });
    expect((await source.readWeights(range)).map((w) => w.uuid)).toEqual(["a"]);
    expect((await source.readWorkouts(range)).map((w) => w.uuid)).toEqual(["W-1"]);
    expect((await source.readDaily(range)).map((d) => d.value)).toEqual([5]);
    expect(await source.readSleep(range)).toEqual([]);
  });

  it("can report that Health is unavailable", async () => {
    const availability = await createFakeHealthSource({ available: false }).isAvailable();
    expect(availability.available).toBe(false);
    expect(availability.reason).toBeTruthy();
  });
});
