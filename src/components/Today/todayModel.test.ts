import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { makeSet, makeWorkout } from "@/lib/data/testUtils";
import { getExerciseMedia } from "@/lib/exerciseMedia";
import { HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import {
  atDumbbellCap,
  capNextText,
  dayName,
  displayLiftName,
  formatEyebrowDate,
  exercisePageHref,
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
  it("opens a barbell lift done as itself under Progress, with where it was opened from", () => {
    expect(liftPageHref("squat")).toBe("/progress/lift/squat");
    expect(liftPageHref("squat", { from: "today" })).toBe("/progress/lift/squat?from=today");
    expect(liftPageHref("squat", { as: "squat" })).toBe("/progress/lift/squat");
  });

  it("opens the page of the exercise performed: a home version is its own page", () => {
    expect(liftPageHref("squat", { as: "goblet_squat", from: "today" })).toBe("/exercises/goblet_squat?from=today");
    expect(liftPageHref("squat", { as: "bulgarian_split_squat" })).toBe("/exercises/bulgarian_split_squat");
    expect(liftPageHref("lat_pulldown", { as: "db_row", from: "today" })).toBe("/exercises/db_row?from=today");
    expect(liftPageHref("lat_pulldown", { from: "today" })).toBe("/exercises/lat_pulldown?from=today");
    expect(liftPageHref("db_row")).toBe("/exercises/db_row");
  });
});

describe("exercisePageHref", () => {
  it("is the lift page for a barbell lift and the exercise page for anything else", () => {
    expect(exercisePageHref("bench")).toBe("/progress/lift/bench");
    expect(exercisePageHref("db_bench", { from: "today" })).toBe("/exercises/db_bench?from=today");
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

  it("compares with what the program prescribed after a lighter plan edit, not the weight lifted", () => {
    // Edited from 95 to 85 before START: the sets hold 85 with no original weight, and
    // progression kept the lift at 95. Today's 95 is the same weight held.
    const edited = makeWorkout({
      completedAt: done,
      prescribed: [{ exerciseId: "ohp", tier: "T1", weight: 95, sets: 5, reps: 3 }],
      planEdits: [{ kind: "weight", exerciseId: "ohp", tier: "T1", weight: 85 }],
      sets: [makeSet({ exerciseId: "ohp", tier: "T1", weight: 85 })],
    });
    const today = { exerciseId: "ohp", tier: "T1" as const, weight: 95 };
    expect(reasonText(liftReason(today, [edited]))).toBe("Held at 95");
    expect(reasonText(liftReason({ ...today, weight: 100 }, [edited]))).toBe("▲ 5 from 95");
    // Another tier's prescription is not this one's.
    expect(liftReason({ ...today, tier: "T2" }, [edited])).toEqual({ kind: "first" });
  });

  it("keeps a home substitute's own weight even when the session has a prescription", () => {
    const home = makeWorkout({
      completedAt: done,
      prescribed: [{ exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3 }],
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
    const entry = { exerciseId: "squat", substituteExerciseId: "goblet_squat", tier: "T1" as const, weight: 55 };
    expect(reasonText(liftReason(entry, [home]))).toBe("▲ 5 from 50");
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

describe("atDumbbellCap", () => {
  const equipment = DEFAULT_USER_PROFILE.settings.equipment; // heaviest dumbbell 80, steps of 5
  const held = { kind: "held" as const, weight: 80 };
  const bss = {
    exerciseId: "squat",
    substituteExerciseId: "bulgarian_split_squat",
    tier: "T1" as const,
    weight: 80,
    perHand: true,
  };

  it("says a held home weight is the heaviest dumbbell, and what a pass does instead", () => {
    const reason = atDumbbellCap(bss, held, equipment);
    expect(reason).toEqual({ kind: "capped", weight: 80, next: { policy: "reps", reps: 1 } });
    expect(reasonText(reason)).toBe("Held at 80, your heaviest dumbbell");
    expect(capNextText(reason)).toBe("A pass adds 1 rep a set");
  });

  it("names the harder exercise when the cap policy moves on", () => {
    const goblet = { ...bss, substituteExerciseId: "goblet_squat", perHand: false };
    const reason = atDumbbellCap(goblet, held, equipment);
    expect(capNextText(reason)).toBe("A pass moves to Bulgarian split squat");
  });

  it("leaves every other reason alone", () => {
    expect(atDumbbellCap({ ...bss, weight: 75 }, { kind: "held", weight: 75 }, equipment)).toEqual({ kind: "held", weight: 75 });
    const up = { kind: "up" as const, change: 5, from: 75 };
    expect(atDumbbellCap(bss, up, equipment)).toBe(up);
    // At the gym nothing is capped by a dumbbell.
    const barbell = { exerciseId: "squat", tier: "T1" as const, weight: 80 };
    expect(atDumbbellCap(barbell, held, equipment)).toBe(held);
    expect(capNextText(held)).toBeNull();
  });
});
