// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyLiftState } from "@/lib/rebuild";
import { evaluateT1Progression, getIncrement } from "@/lib/progression";
import { T1_STAGE_SCHEME } from "@/lib/workout/prescription";
import type { LiftState, SetLog, T1Stage } from "@/types";
import { CALIBRATION, LIFT_OUTLOOK_MODEL, MILESTONE_MODEL, STALL_MODEL } from "./coefficients";
import { DAY_MS } from "./log";
import {
  forecastMilestone,
  forecastStall,
  liftOutlook,
  liftPace,
  nextRoundWeight,
  nextSessionTimes,
  T1_LIFTS,
  walkProgram,
} from "./outlook";
import { chanceOfAtLeast, estimateRepsLevel, lastT1Sets, repsIndex, repsOutlook } from "./reps";
import { SETTINGS, sourceAt, makeT1Session, WEEK } from "./testHelpers";

const NOW = new Date("2026-11-14T17:00:00Z");
const EQUIPMENT = SETTINGS.equipment;

const stateAt = (weight: number, stage: T1Stage = "5x3", extra: Partial<LiftState> = {}): LiftState => ({
  ...emptyLiftState("squat"),
  t1Weight: weight,
  t1Stage: stage,
  ...extra,
});

/** Squat every nine days, rising 10 lb a session with the last-set reps given. */
function squatHistory(lastReps: number[], start = 200, gapDays = 9) {
  const count = lastReps.length;
  return lastReps.map((reps, i) =>
    makeT1Session({
      id: `sq${i}`,
      at: new Date(NOW.getTime() - (count - i) * gapDays * DAY_MS),
      weight: start + i * 10,
      lastReps: reps,
    })
  );
}

/** A level that does not move and has no error of its own: each session is a fresh draw. */
const flatOutlook = (level: number, daySd: number) => ({
  levelAt: () => level,
  daySd,
  levelErrors: [] as Array<(t: number) => number>,
});

const times = (n: number) => Array.from({ length: n }, (_, i) => NOW.getTime() + (i + 1) * 9 * DAY_MS);

describe("the reps model read at later sessions", () => {
  const input = (history: ReturnType<typeof squatHistory>, weight = 260) => ({
    history: lastT1Sets(history, "squat", NOW),
    performedExerciseId: "squat",
    weight,
    targetReps: 3,
    now: NOW,
  });

  it.each([
    ["no results", []],
    ["one to three results", [7, 6]],
    ["a trend", [8, 7, 7, 6, 6]],
  ] as const)("splits the scatter into a day part and the level's error that add up to it, with %s", (_, reps) => {
    const outlook = repsOutlook(input(squatHistory([...reps])));
    const level = estimateRepsLevel(input(squatHistory([...reps])));
    const errors = outlook.levelErrors.map((error) => error(NOW.getTime()));
    expect(Math.hypot(outlook.daySd, ...errors)).toBeCloseTo(level.scatter, 9);
    expect(outlook.levelAt(NOW.getTime(), 260)).toBeCloseTo(level.level, 9);
    expect(outlook.daySd).toBeGreaterThan(0);
    expect(outlook.daySd).toBeLessThanOrEqual(level.scatter);
  });

  it("adds up after a stage change too, with the extra widening all on the level", () => {
    const history = squatHistory([5, 4, 3]);
    const changed = { ...input(history, 230), targetReps: 2 };
    const outlook = repsOutlook(changed);
    expect(outlook.basis).toBe("regime-change");
    const error = outlook.levelErrors[0](NOW.getTime());
    expect(Math.hypot(outlook.daySd, error)).toBeCloseTo(outlook.scatter, 9);
    expect(error).toBeGreaterThan(outlook.daySd);
  });

  it("follows the trend for a later date and carries one to three results up with the weight", () => {
    const trend = repsOutlook(input(squatHistory([8, 8, 8, 8, 8])));
    expect(trend.basis).toBe("trend");
    const later = NOW.getTime() + 2 * WEEK;
    expect(trend.levelAt(later, 260)).toBeGreaterThan(trend.levelAt(NOW.getTime(), 260));
    // The line's own error grows away from its data.
    const slopePart = trend.levelErrors[1];
    expect(Math.abs(slopePart(later))).toBeGreaterThan(Math.abs(slopePart(NOW.getTime())));

    const few = repsOutlook(input(squatHistory([8, 8])));
    expect(few.basis).toBe("persistence");
    expect(few.levelAt(NOW.getTime(), 280)).toBeGreaterThan(few.levelAt(NOW.getTime(), 260));
    expect(few.levelAt(later, 260)).toBe(few.levelAt(NOW.getTime(), 260));
  });

  it("leaves today's reading exactly as it was", () => {
    const history = squatHistory([8, 7, 7, 6, 6]);
    const { levelAt, daySd, levelErrors, ...level } = repsOutlook(input(history));
    expect([typeof levelAt, typeof daySd, levelErrors.length]).toEqual(["function", "number", 2]);
    expect(estimateRepsLevel(input(history))).toEqual(level);
  });
});

describe("the pace of a lift", () => {
  it("is the mean days between its recent sessions, with their scatter", () => {
    const history = squatHistory([8, 7, 7, 6], 200, 9);
    const pace = liftPace(history, "squat", NOW)!;
    expect(pace.gapDays).toBeCloseTo(9, 6);
    expect(pace.gapSdDays).toBe(LIFT_OUTLOOK_MODEL.gapSdFloorDays);
    expect(pace.sessions).toBe(4);
    expect(pace.lastAt).toBe(Math.max(...history.map((w) => w.completedAt!.getTime())));
  });

  it("needs two sessions inside the window", () => {
    expect(liftPace(squatHistory([8]), "squat", NOW)).toBeNull();
    const old = squatHistory([8, 7], 200, LIFT_OUTLOOK_MODEL.paceWindowWeeks * 7);
    expect(liftPace(old, "squat", NOW)).toBeNull();
    expect(liftPace(squatHistory([8, 7]), "bench", NOW)).toBeNull();
  });

  it("puts the next session one gap after the last, never before now", () => {
    const pace = { gapDays: 9, gapSdDays: 1, lastAt: NOW.getTime() - 2 * DAY_MS, sessions: 3 };
    expect(nextSessionTimes(pace, NOW, 2)).toEqual([
      NOW.getTime() + 7 * DAY_MS,
      NOW.getTime() + 16 * DAY_MS,
    ]);
    const overdue = { ...pace, lastAt: NOW.getTime() - 20 * DAY_MS };
    expect(nextSessionTimes(overdue, NOW, 1)).toEqual([NOW.getTime()]);
  });
});

describe("walking the program forward", () => {
  const walk = (level: number, state: LiftState, n: number, extra: { stopAtMiss?: boolean; target?: number }) =>
    walkProgram({
      outlook: flatOutlook(level, 0.01),
      liftState: state,
      times: times(n),
      liftType: "lower",
      equipment: EQUIPMENT,
      ...extra,
    });

  it("never misses with a level far above the bar, and always misses far below it", () => {
    expect(walk(1000, stateAt(200), 2, { stopAtMiss: true }).firstMiss).toEqual([0, 0]);
    expect(walk(100, stateAt(200), 2, { stopAtMiss: true }).firstMiss).toEqual([1, 0]);
  });

  it("reaches a weight after as many passes as the program's step needs", () => {
    const step = getIncrement("lower", "gym", EQUIPMENT);
    const { reached } = walk(1000, stateAt(200), 8, { target: 225 });
    // 200 -> 210 -> 220 -> 230: the fourth session is the first at 225 or more.
    expect(step).toBe(10);
    expect(reached).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
  });

  it("moves down a stage after a miss, as the program does, and passes there", () => {
    // Strong enough for 2 reps at 220 but not 3: 5x3 misses, 6x2 passes.
    const level = (repsIndex(220, 2) + repsIndex(220, 2.5)) / 2;
    const { reached } = walk(level, stateAt(220), 3, { target: 225 });
    // Session 1 misses at 5x3 (220 stays), session 2 passes at 6x2, session 3 is at 230.
    expect(reached).toEqual([0, 0, 1]);
    const program = evaluateT1Progression(
      stateAt(220),
      [{ status: "failed", actualReps: 0, targetReps: 3 } as SetLog],
      "gym",
      EQUIPMENT,
      "lower"
    );
    expect([program.t1Weight, program.t1Stage]).toEqual([220, "6x2"]);
  });

  it("chains the chance of passing each session", () => {
    const level = repsIndex(200, 3);
    const p1 = chanceOfAtLeast(T1_STAGE_SCHEME["5x3"].reps, 200, { level, scatter: 8 });
    const p2 = chanceOfAtLeast(T1_STAGE_SCHEME["5x3"].reps, 210, { level, scatter: 8 });
    const { firstMiss } = walkProgram({
      outlook: flatOutlook(level, 8),
      liftState: stateAt(200),
      times: times(2),
      liftType: "lower",
      equipment: EQUIPMENT,
      stopAtMiss: true,
    });
    expect(firstMiss[0]).toBeCloseTo(1 - p1, 12);
    expect(firstMiss[1]).toBeCloseTo(p1 * (1 - p2), 12);
  });

  it("treats the level's own error as shared, so two passes are likelier than two independent ones", () => {
    const level = repsIndex(200, 3);
    const run = (errors: Array<(t: number) => number>, daySd: number) =>
      walkProgram({
        outlook: { levelAt: () => level, daySd, levelErrors: errors },
        liftState: stateAt(200),
        times: times(2),
        liftType: "lower",
        equipment: EQUIPMENT,
        stopAtMiss: true,
      });
    const shared = run([() => 8], 6);
    const independent = run([], 10);
    // Same scatter per session (sqrt(6^2 + 8^2) = 10), so the first session is the same.
    expect(shared.firstMiss[0]).toBeCloseTo(independent.firstMiss[0], 2);
    const bothPass = (r: { firstMiss: number[] }) => 1 - r.firstMiss[0] - r.firstMiss[1];
    expect(bothPass(shared)).toBeGreaterThan(bothPass(independent) + 0.02);
  });
});

describe("the chance of a stall", () => {
  const history = squatHistory([7, 6, 6, 5, 5]);
  const source = (state: LiftState = stateAt(250), parts = {}) =>
    sourceAt(NOW, { workouts: history, liftStates: [state], ...parts });

  it("is the chance of missing within the next two sessions, the second a step heavier", () => {
    const stall = forecastStall(source(), "squat")!;
    expect(stall.weight).toBe(250);
    expect(stall.targetReps).toBe(3);
    expect(stall.chance).toBeGreaterThan(1 - stall.passFirst);
    expect(stall.chance).toBeLessThan(1);
    expect(stall.basis).toBe("trend");
    expect(stall.inputs).toMatchObject({ increment: 10, sessions: STALL_MODEL.sessions, weight: 250 });
    const pace = liftPace(history, "squat", NOW)!;
    expect(stall.dueAt).toBe(nextSessionTimes(pace, NOW, 2)[1]);
  });

  it("rises with the weight on the bar", () => {
    const light = forecastStall(source(stateAt(240)), "squat")!.chance;
    const heavy = forecastStall(source(stateAt(270)), "squat")!.chance;
    expect(heavy).toBeGreaterThan(light);
  });

  it("widens with the reps model's track-record factor", () => {
    const strong = forecastStall(source(stateAt(220)), "squat")!.chance;
    const widened = forecastStall(source(stateAt(220), { sdScale: { amrapReps: 2 } }), "squat")!.chance;
    expect(widened).toBeGreaterThan(strong);
  });

  it("is not given without a lift state, during a deload, with no sets of its own or after a stage change", () => {
    expect(forecastStall(sourceAt(NOW, { workouts: history }), "squat")).toBeNull();
    expect(forecastStall(source(stateAt(250, "5x3", { deloadActive: true })), "squat")).toBeNull();
    expect(forecastStall(source(stateAt(250, "6x2")), "squat")).toBeNull();
    expect(liftOutlook(source(stateAt(250, "6x2")), "squat")).toBeNull();
    expect(forecastStall(sourceAt(NOW, { liftStates: [stateAt(250)] }), "squat")).toBeNull();
  });

  it("covers the program's T1 lifts", () => {
    expect([...T1_LIFTS]).toEqual(["bench", "deadlift", "ohp", "squat"]);
  });
});

describe("the date of the next round number", () => {
  it("rounds up to the next multiple", () => {
    expect(MILESTONE_MODEL.roundToLbs).toBe(25);
    expect(nextRoundWeight(225)).toBe(250);
    expect(nextRoundWeight(230)).toBe(250);
    expect(nextRoundWeight(249.5)).toBe(250);
    expect(nextRoundWeight(95)).toBe(100);
  });

  it("needs the chance the top of an 80% range needs", () => {
    expect(MILESTONE_MODEL.minReachChance).toBeCloseTo(0.5 + CALIBRATION.targetCoverage / 2, 12);
  });

  const history = squatHistory([9, 9, 8, 8, 8]);
  const source = (weight: number, parts = {}) =>
    sourceAt(NOW, { workouts: history, liftStates: [stateAt(weight)], ...parts });

  it("gives a middle date and a range around it, from now on", () => {
    const milestone = forecastMilestone(source(240), "squat")!;
    expect(milestone.target).toBe(250);
    expect(milestone.low).toBeGreaterThanOrEqual(NOW.getTime());
    expect(milestone.low).toBeLessThanOrEqual(milestone.point);
    expect(milestone.high).toBeGreaterThan(milestone.point);
    expect(milestone.reachChance).toBeGreaterThanOrEqual(MILESTONE_MODEL.minReachChance);
    // One pass away: most likely the next session but one.
    const pace = liftPace(history, "squat", NOW)!;
    expect(milestone.point).toBe(nextSessionTimes(pace, NOW, 2)[1]);
  });

  it("puts a weight further off later", () => {
    const near = forecastMilestone(source(240), "squat")!;
    const far = forecastMilestone(source(255), "squat")!;
    expect(far.target).toBe(275);
    expect(far.point).toBeGreaterThan(near.point);
  });

  it("widens by its own track-record factor", () => {
    const plain = forecastMilestone(source(230), "squat")!;
    const widened = forecastMilestone(source(230, { sdScale: { milestone: 1.5 } }), "squat")!;
    expect(widened.high - widened.point).toBeCloseTo(1.5 * (plain.high - plain.point), 3);
    expect(widened.inputs.sdScale).toBe(1.5);
  });

  it("gives no date when the walk may not get there within the horizon", () => {
    // A lifter who has not got stronger in weeks, far below the bar: the walk resets.
    const flat = Array.from({ length: 5 }, (_, i) =>
      makeT1Session({ id: `f${i}`, at: new Date(NOW.getTime() - (5 - i) * 9 * DAY_MS), weight: 200, lastReps: 5 })
    );
    const stuck = sourceAt(NOW, { workouts: flat, liftStates: [stateAt(300)] });
    expect(liftOutlook(stuck, "squat")).not.toBeNull();
    expect(forecastMilestone(stuck, "squat")).toBeNull();
  });
});
