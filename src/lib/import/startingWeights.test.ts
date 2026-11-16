import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { recordAdjustment } from "@/lib/data/adjustments";
import { clearDb } from "@/lib/data/testUtils";
import { impliedWeightForReps, roundDownToPlates, TRANSFER_PRIORS } from "@/lib/strength";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { STARTING_WEIGHT_RULES, adjustmentFor, formatAge, suggestStartingWeights } from "./startingWeights";
import { importDay, importedSession, importedSet } from "./testRecords";

// Made-up history only.

const equipment = DEFAULT_USER_PROFILE.settings.equipment;
const maintaining = { mode: "maintaining" as const };

function benchHistory() {
  return [
    importedSession([importedSet({ exerciseName: "Barbell Bench Press", mappedExerciseId: "bench", weightPerImplementLb: 150, reps: 5 })], {
      startedAt: importDay(0),
    }),
  ];
}

function suggest(imported = benchHistory(), now = importDay(3), phase: { mode: "maintaining" | "cutting" | "bulking" } = maintaining) {
  return suggestStartingWeights({
    sets: strengthEvidenceOf([], imported),
    liftStates: Object.values(INITIAL_LIFT_STATES),
    variantStates: [],
    equipment,
    phase,
    now,
  });
}

describe("suggestStartingWeights", () => {
  it("suggests a T1 of 85% of the five-rep max, rounded down to plates", () => {
    const t1 = suggest().find((s) => s.id === "bench|T1|gym")!;
    // 150 × 5 → estimated max 175; five-rep max 150; 85% is 127.5; plates make 125.
    expect(t1.estimate.value).toBe(175);
    const expected = roundDownToPlates(STARTING_WEIGHT_RULES.t1FractionOfFiveRepMax * impliedWeightForReps(175, 5), equipment);
    expect(t1.suggested).toBe(expected);
    expect(t1.suggested).toBe(125);
    expect(t1.current).toBe(INITIAL_LIFT_STATES.bench.t1Weight);
    expect(t1.working.join(" ")).toMatch(/85%/);
    expect(t1.adjustment).toEqual({
      exerciseId: "bench",
      source: "start",
      set: { t1Weight: 125, t1Stage: "5x3", t1FailCount: 0 },
      note: expect.any(String),
    });
  });

  it("suggests a T2 of 65% of the five-rep max", () => {
    const t2 = suggest().find((s) => s.id === "bench|T2|gym")!;
    expect(t2.suggested).toBe(95);
    expect(t2.adjustment.set).toEqual({ t2Weight: 95, t2Stage: "3x10", t2FailCount: 0 });
  });

  it("suggests the home exercise's weight through its ratio, per hand, as a variant adjustment", () => {
    const home = suggest().find((s) => s.id === "bench|T1|home")!;
    expect(home.exerciseId).toBe("db_bench");
    const ratio = TRANSFER_PRIORS.bench.db_bench.ratio;
    expect(home.ratio).toBe(ratio);
    const total = STARTING_WEIGHT_RULES.t1FractionOfFiveRepMax * impliedWeightForReps(175 * ratio, 5);
    expect(home.suggested).toBe(Math.floor(total / 2 / 5) * 5);
    expect(home.perHand).toBe(true);
    expect(home.working.join(" ")).toMatch(/a hand/);
    expect(home.adjustment).toMatchObject({
      exerciseId: "bench",
      source: "start",
      variant: { exerciseId: "db_bench", tier: "T1" },
      set: { t1Weight: home.suggested },
    });
  });

  it("gives nothing for a lift with no evidence", () => {
    expect(suggest().some((s) => s.liftId === "squat")).toBe(false);
    expect(suggest([])).toEqual([]);
  });

  it("applies the time-off rule when the newest session is old", () => {
    const fresh = suggest(benchHistory(), importDay(3)).find((s) => s.id === "bench|T1|gym")!;
    const old = suggest(benchHistory(), importDay(100)).find((s) => s.id === "bench|T1|gym")!;
    expect(fresh.decayPercent).toBe(0);
    expect(old.decayPercent).toBeGreaterThan(0);
    expect(old.suggested).toBeLessThan(fresh.suggested);
    expect(old.working.join(" ")).toMatch(/time-off rule/);
  });

  it("suggests a T3 weight for about 20 reps, per hand for a dumbbell row", () => {
    const rows = importedSession(
      [importedSet({ exerciseName: "Dumbbell Row", mappedExerciseId: "db_row", weightPerImplementLb: 60, reps: 10, implementCount: 2 })],
      { startedAt: importDay(0) }
    );
    const t3 = suggest([rows]).find((s) => s.id === "db_row|T3|gym")!;
    expect(t3.perHand).toBe(true);
    const total = impliedWeightForReps(t3.estimate.value, STARTING_WEIGHT_RULES.t3Reps);
    expect(t3.suggested).toBe(Math.floor(total / 2 / 5) * 5);
    expect(t3.adjustment.set).toEqual({ t3Weight: t3.suggested });
  });

  it("leaves out a lift known from the app's own log alone when told which sessions are imported", () => {
    const history = benchHistory();
    const base = {
      sets: strengthEvidenceOf([], history),
      liftStates: Object.values(INITIAL_LIFT_STATES),
      variantStates: [],
      equipment,
      phase: maintaining,
      now: importDay(3),
    };
    expect(suggestStartingWeights({ ...base, importedSessionIds: new Set([history[0].id]) }).length).toBeGreaterThan(0);
    expect(suggestStartingWeights({ ...base, importedSessionIds: new Set(["another"]) })).toEqual([]);
  });

  it("never uses a muscle-guessed name", () => {
    const guessed = importedSession([importedSet({ exerciseName: "Wobbly Bench Thing", mappedExerciseId: null, muscles: ["chest"] })]);
    expect(suggest([guessed])).toEqual([]);
  });
});

describe("formatAge", () => {
  it("reads days, weeks, months and years", () => {
    expect(formatAge(1)).toBe("1 day");
    expect(formatAge(20)).toBe("2 weeks");
    expect(formatAge(100)).toBe("3 months");
    expect(formatAge(800)).toBe("2 years");
  });
});

describe("confirming a suggestion (I11)", () => {
  beforeEach(async () => {
    await clearDb();
    await initializeDatabase();
  });

  it("changes nothing until confirmed, then records a start adjustment the rebuild applies", async () => {
    const before = await db.liftStates.get("bench");
    const t1 = suggest().find((s) => s.id === "bench|T1|gym")!;
    expect(await db.liftStates.get("bench")).toEqual(before);
    expect(await db.liftAdjustments.where("exerciseId").equals("bench").count()).toBe(1);

    await recordAdjustment(adjustmentFor(t1, 120));
    const after = await db.liftStates.get("bench");
    expect(after!.t1Weight).toBe(120);
    expect(after!.t1Stage).toBe("5x3");
    expect(after!.t2Weight).toBe(before!.t2Weight);
  });

  it("records a home exercise's weight on its own state", async () => {
    const home = suggest().find((s) => s.id === "bench|T1|home")!;
    await recordAdjustment(home.adjustment);
    const variant = (await db.variantStates.toArray()).find((v) => v.exerciseId === "db_bench" && v.tier === "T1");
    expect(variant?.weight).toBe(home.suggested);
    expect((await db.liftStates.get("bench"))!.t1Weight).toBe(INITIAL_LIFT_STATES.bench.t1Weight);
  });
});
