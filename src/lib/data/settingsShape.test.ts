import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { NextSetPlan } from "@/types";
import { sanitizeNextSetPlans, sanitizeSettings } from "./settingsShape";

const good: NextSetPlan = {
  exerciseId: "squat",
  liftId: "squat",
  tier: "T1",
  sets: [{ weight: 185, reps: 3 }],
  planSets: [{ weight: 180, reps: 3 }],
  createdAt: "2026-11-17T09:00:00.000Z",
};

describe("sanitizeNextSetPlans", () => {
  it("keeps well-formed plans as they are", () => {
    expect(sanitizeNextSetPlans({ "squat|T1": good })).toEqual({ "squat|T1": good });
  });

  it("is undefined for anything that is not a record of plans", () => {
    expect(sanitizeNextSetPlans(undefined)).toBeUndefined();
    expect(sanitizeNextSetPlans(null)).toBeUndefined();
    expect(sanitizeNextSetPlans("x")).toBeUndefined();
    expect(sanitizeNextSetPlans([good])).toBeUndefined();
  });

  it("drops each plan a reader would crash on, keeps the rest", () => {
    const plans = sanitizeNextSetPlans({
      "squat|T1": good,
      nothing: null,
      noSets: { ...good, sets: undefined },
      badSet: { ...good, sets: [{ weight: "185", reps: 3 }] },
      nullSet: { ...good, sets: [null] },
      noExercise: { ...good, exerciseId: 7 },
      noTier: { ...good, tier: undefined },
    });
    expect(Object.keys(plans!)).toEqual(["squat|T1"]);
  });

  it("repairs what it can: a revived Date, a missing liftId or planSets", () => {
    const plans = sanitizeNextSetPlans({
      "squat|T1": {
        ...good,
        liftId: undefined,
        planSets: "nope",
        createdAt: new Date("2026-11-17T09:00:00.000Z"),
      },
    });
    expect(plans).toEqual({ "squat|T1": { ...good, planSets: [] } });
  });

  it("keeps fields a newer app version added", () => {
    const plans = sanitizeNextSetPlans({ "squat|T1": { ...good, note: "from a newer app" } });
    expect(plans!["squat|T1"]).toMatchObject({ note: "from a newer app" });
  });
});

describe("sanitizeSettings", () => {
  const defaults = DEFAULT_USER_PROFILE.settings;

  it("fills fields an older app version lacked from the defaults", () => {
    const older: Partial<typeof defaults> = { ...defaults };
    delete older.equipment;
    delete older.trainingPhase;
    expect(sanitizeSettings({ ...older, theme: "light" })).toEqual({ ...defaults, theme: "light" });
  });

  it("falls back to the defaults when the settings are not an object", () => {
    expect(sanitizeSettings(null)).toEqual(defaults);
    expect(sanitizeSettings("[]")).toEqual(defaults);
  });

  it("cleans the set plans and drops the key when nothing usable is left", () => {
    expect(sanitizeSettings({ ...defaults, nextSetPlans: { a: null, "squat|T1": good } }).nextSetPlans).toEqual({
      "squat|T1": good,
    });
    expect("nextSetPlans" in sanitizeSettings({ ...defaults, nextSetPlans: 5 })).toBe(false);
  });
});
