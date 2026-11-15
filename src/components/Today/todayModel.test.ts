import { describe, expect, it } from "vitest";
import { makeSet, makeWorkout } from "@/lib/data/testUtils";
import { getExerciseMedia } from "@/lib/exerciseMedia";
import { HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import {
  dayName,
  displayLiftName,
  formatEyebrowDate,
  liftPageHref,
  liftReason,
  nameInSentence,
  photoPosition,
  reasonText,
} from "./todayModel";

const done = new Date("2026-11-10T10:00:00Z");

describe("displayLiftName", () => {
  it("drops Barbell, spells out OHP and uses sentence case", () => {
    expect(displayLiftName("squat")).toBe("Squat");
    expect(displayLiftName("bench")).toBe("Bench press");
    expect(displayLiftName("ohp")).toBe("Overhead press");
    expect(displayLiftName("db_row")).toBe("Dumbbell row");
    expect(displayLiftName("db_bench")).toBe("DB bench press");
    expect(displayLiftName("db_rdl")).toBe("DB Romanian deadlift");
  });
});

describe("dayName", () => {
  it("names the day after the T1 lift", () => {
    expect(dayName("squat", "A1")).toBe("Squat day");
    expect(dayName("bench", "A2")).toBe("Bench day");
    expect(dayName("deadlift", "B2")).toBe("Deadlift day");
    expect(dayName("ohp", "B1")).toBe("Press day");
    expect(dayName(undefined, "Custom")).toBe("Custom");
  });
});

describe("formatEyebrowDate", () => {
  it("reads weekday · month day", () => {
    expect(formatEyebrowDate(new Date(2026, 10, 13, 12))).toBe("Friday · Nov 13");
  });
});

describe("photoPosition", () => {
  it("frames the four main lifts and leaves others centred", () => {
    for (const id of ["squat", "bench", "deadlift", "ohp"]) {
      expect(photoPosition(id, "hero")).toMatch(/%/);
      expect(photoPosition(id, "card")).toMatch(/%/);
    }
    expect(photoPosition("db_row", "hero")).toBeUndefined();
  });

  it("frames every home substitute that has a photo", () => {
    const withPhoto = Object.values(HOME_SUBSTITUTE_CHAINS)
      .flat()
      .filter((id) => getExerciseMedia(id) !== null);
    expect(withPhoto.length).toBeGreaterThanOrEqual(8);
    for (const id of withPhoto) {
      expect(photoPosition(id, "hero"), id).toMatch(/^\d+% \d+%$/);
      expect(photoPosition(id, "card"), id).toMatch(/^\d+% \d+%$/);
    }
  });
});

describe("liftPageHref", () => {
  it("names the home substitute and where the page was opened from", () => {
    expect(liftPageHref("squat")).toBe("/progress/lift/squat");
    expect(liftPageHref("squat", { from: "today" })).toBe("/progress/lift/squat?from=today");
    expect(liftPageHref("squat", { as: "goblet_squat", from: "today" })).toBe(
      "/progress/lift/squat?as=goblet_squat&from=today"
    );
    expect(liftPageHref("squat", { as: "squat" })).toBe("/progress/lift/squat");
  });

  it("opens the exercise page for a lift that has no lift page, such as a T3 row at home", () => {
    expect(liftPageHref("lat_pulldown", { as: "db_row", from: "today" })).toBe("/exercises/db_row");
    expect(liftPageHref("lat_pulldown", { from: "today" })).toBe("/exercises/lat_pulldown");
  });
});

describe("nameInSentence", () => {
  it("lower-cases the first word unless it is an acronym or a proper name", () => {
    expect(nameInSentence("goblet_squat")).toBe("goblet squat");
    expect(nameInSentence("db_bench")).toBe("DB bench press");
    expect(nameInSentence("bulgarian_split_squat")).toBe("Bulgarian split squat");
    expect(nameInSentence("ohp")).toBe("overhead press");
  });
});

describe("liftReason", () => {
  const entry = { exerciseId: "deadlift", tier: "T1" as const, weight: 215 };

  it("is 'First time' with no history for the lift at this tier", () => {
    const other = makeWorkout({
      completedAt: done,
      sets: [makeSet({ exerciseId: "deadlift", tier: "T2", weight: 155 })],
    });
    expect(liftReason(entry, [other])).toEqual({ kind: "first" });
    expect(reasonText({ kind: "first" })).toBe("First time");
  });

  it("compares with the newest finished workout that had the lift", () => {
    const newer = makeWorkout({
      completedAt: done,
      sets: [makeSet({ exerciseId: "deadlift", tier: "T1", weight: 205 })],
    });
    const older = makeWorkout({
      completedAt: new Date("2026-11-01T10:00:00Z"),
      sets: [makeSet({ exerciseId: "deadlift", tier: "T1", weight: 195 })],
    });
    const reason = liftReason(entry, [newer, older]);
    expect(reason).toEqual({ kind: "up", change: 10, from: 205 });
    expect(reasonText(reason)).toBe("▲ 10 from 205");
  });

  it("says held when the weight is unchanged and shows a drop", () => {
    const last = makeWorkout({
      completedAt: done,
      sets: [makeSet({ exerciseId: "deadlift", tier: "T1", weight: 215 })],
    });
    expect(reasonText(liftReason(entry, [last]))).toBe("Held at 215");
    expect(reasonText(liftReason({ ...entry, weight: 195 }, [last]))).toBe("▼ 20 from 215");
  });

  it("skips unfinished workouts and pain-skipped sets, and counts lightened sets at the prescribed weight", () => {
    const unfinished = makeWorkout({
      completedAt: null,
      sets: [makeSet({ exerciseId: "deadlift", tier: "T1", weight: 100 })],
    });
    const skipped = makeWorkout({
      completedAt: done,
      sets: [makeSet({ exerciseId: "deadlift", tier: "T1", weight: 0, status: "skipped_pain" })],
    });
    const lightened = makeWorkout({
      completedAt: new Date("2026-11-01T10:00:00Z"),
      sets: [
        makeSet({
          exerciseId: "deadlift",
          tier: "T1",
          weight: 185,
          originalWeight: 205,
          status: "reduced_run_fatigue",
        }),
      ],
    });
    expect(liftReason(entry, [unfinished, skipped, lightened])).toEqual({
      kind: "up",
      change: 10,
      from: 205,
    });
  });

  it("matches a home substitute only against the same substitute", () => {
    const gym = makeWorkout({
      completedAt: done,
      sets: [makeSet({ exerciseId: "squat", tier: "T1", weight: 190 })],
    });
    const home = { exerciseId: "squat", substituteExerciseId: "goblet_squat", tier: "T1" as const, weight: 50 };
    expect(liftReason(home, [gym])).toEqual({ kind: "first" });
    const homeBefore = makeWorkout({
      completedAt: done,
      sets: [
        makeSet({
          exerciseId: "squat",
          tier: "T1",
          weight: 50,
          originalWeight: 190,
          isSubstituted: true,
          substituteExerciseId: "goblet_squat",
        }),
      ],
    });
    expect(reasonText(liftReason(home, [homeBefore]))).toBe("Held at 50");
  });
});
