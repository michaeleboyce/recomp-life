// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  calculateE1RM,
  E1RM_MAX_REPS,
  E1RM_MAX_REPS_IN_RESERVE,
  repsInReserveFromRPE,
} from "@/lib/e1rm";
import { prChanceFromProbability, repsToBeat } from "@/lib/projection/prOpportunity";
import { fitTrend } from "@/lib/projection/trend";
import { CALIBRATION, NEW_BEST_MODEL, REPS_MODEL } from "./coefficients";
import { normalCdf } from "./math";
import {
  chanceOfAtLeast,
  chanceOfNewBest,
  estimateRepsLevel,
  forecastReps,
  lastT1Sets,
  mostLikelyReps,
  repsIndex,
  repsPmf,
  repsRange,
  stageForReps,
  typicalReps,
  usualEffortCredit,
  type LastSetPoint,
  type RepsModelInput,
} from "./reps";
import { DAY, t1Session } from "./testHelpers";
import type { SetLog } from "@/types";

const NOW = new Date("2026-11-14T17:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** A history of squat last sets, oldest first: [days ago, weight, reps]. */
function history(rows: Array<[number, number, number]>, extra: Partial<LastSetPoint> = {}) {
  return rows.map(
    ([days, weight, reps], i): LastSetPoint => ({
      t: daysAgo(days).getTime(),
      workoutId: `w${i}`,
      weight,
      reps,
      stage: "5x3",
      phase: "maintaining",
      performedExerciseId: "squat",
      index: repsIndex(weight, reps),
      ...extra,
    })
  );
}

function input(overrides: Partial<RepsModelInput> = {}): RepsModelInput {
  return {
    history: [],
    performedExerciseId: "squat",
    weight: 200,
    targetReps: 3,
    phase: "maintaining",
    now: NOW,
    ...overrides,
  };
}

describe("repsIndex", () => {
  it("is weight x (1 + reps / 30), unrounded", () => {
    expect(repsIndex(200, 5)).toBeCloseTo(233.33333, 4);
    expect(repsIndex(200, 0)).toBe(200);
    // calculateE1RM rounds and credits a logged RPE; the index does neither.
    expect(calculateE1RM(200, 5)).toBe(233);
    expect(calculateE1RM(200, 5, 8)).toBe(247);
  });

  it("names the stage that has a rep count", () => {
    expect(stageForReps(3)).toBe("5x3");
    expect(stageForReps(2)).toBe("6x2");
    expect(stageForReps(1)).toBe("10x1");
    expect(stageForReps(7)).toBeNull();
  });
});

describe("lastT1Sets", () => {
  it("reads the last set of each finished T1 session, oldest first", () => {
    const workouts = [
      t1Session({ id: "b", at: daysAgo(3), weight: 205, lastReps: 4, phase: "cutting" }),
      t1Session({ id: "a", at: daysAgo(12), weight: 200, lastReps: 6, phase: "maintaining" }),
    ];
    const points = lastT1Sets(workouts, "squat", NOW);
    expect(points.map((p) => [p.workoutId, p.weight, p.reps, p.stage, p.phase])).toEqual([
      ["a", 200, 6, "5x3", "maintaining"],
      ["b", 205, 4, "5x3", "cutting"],
    ]);
    expect(points[0].index).toBeCloseTo(repsIndex(200, 6), 10);
    expect(points[0].performedExerciseId).toBe("squat");
    // The time is the set's own.
    expect(points[1].t).toBe(daysAgo(3).getTime() + 5 * 4 * 60_000);
  });

  it("reads the working last set, never a ramp, back-off or drop set around it (H14)", () => {
    const base = t1Session({ id: "a", at: daysAgo(3), weight: 200, lastReps: 5 });
    const last = base.sets.at(-1)!;
    const extra = (id: string, overrides: Partial<SetLog>): SetLog => ({
      ...last,
      id,
      clientId: id,
      setNumber: 6,
      // Even flagged as the as-many-as-you-can set, as an imported row might be.
      isAMRAP: true,
      completedAt: new Date(new Date(last.completedAt).getTime() + 60_000),
      ...overrides,
    });
    const withExtras = {
      ...base,
      sets: [
        extra("ramp", { role: "ramp", weight: 160, actualReps: 9, setNumber: 0, completedAt: base.startedAt }),
        ...base.sets,
        extra("drop", { role: "drop", dropOf: last.id, weight: 160, actualReps: 7 }),
        extra("backoff", { role: "backoff", weight: 170, actualReps: 8, setNumber: 7 }),
      ],
    };
    const [point] = lastT1Sets([withExtras], "squat", NOW);
    expect([point.weight, point.reps]).toEqual([200, 5]);
    expect(lastT1Sets([withExtras], "squat", NOW)).toHaveLength(1);
  });

  it("takes the stage from the set's target reps", () => {
    const [point] = lastT1Sets(
      [t1Session({ id: "a", at: daysAgo(3), weight: 200, lastReps: 3, stage: "6x2" })],
      "squat",
      NOW
    );
    expect(point.stage).toBe("6x2");
  });

  it("uses the logged reps even when an RPE was logged", () => {
    const [point] = lastT1Sets(
      [t1Session({ id: "a", at: daysAgo(3), weight: 200, lastReps: 5, setOverrides: { rpe: 7 } })],
      "squat",
      NOW
    );
    expect(point.index).toBeCloseTo(repsIndex(200, 5), 10);
  });

  it("counts a set longer than the cap as the cap", () => {
    const [point] = lastT1Sets(
      [t1Session({ id: "a", at: daysAgo(3), weight: 100, lastReps: 14 })],
      "squat",
      NOW
    );
    expect(point.reps).toBe(14);
    expect(point.index).toBeCloseTo(repsIndex(100, REPS_MODEL.historyRepsCap), 10);
  });

  it("records the substitute as the exercise performed", () => {
    const [point] = lastT1Sets(
      [
        t1Session({
          id: "a",
          at: daysAgo(3),
          weight: 80,
          lastReps: 5,
          substituteExerciseId: "goblet_squat",
        }),
      ],
      "squat",
      NOW
    );
    expect(point.performedExerciseId).toBe("goblet_squat");
  });

  it("leaves out workouts that are unfinished, deleted or finished after now", () => {
    const workouts = [
      t1Session({ id: "open", at: daysAgo(9), weight: 200, lastReps: 5, overrides: { completedAt: null } }),
      t1Session({ id: "gone", at: daysAgo(8), weight: 200, lastReps: 5, overrides: { deletedAt: 1 } }),
      t1Session({ id: "later", at: new Date(NOW.getTime() + DAY), weight: 200, lastReps: 5 }),
      t1Session({ id: "ok", at: daysAgo(7), weight: 200, lastReps: 5 }),
    ];
    expect(lastT1Sets(workouts, "squat", NOW).map((p) => p.workoutId)).toEqual(["ok"]);
  });

  it("leaves out sessions that do not measure strength", () => {
    const partial = t1Session({ id: "partial", at: daysAgo(9), weight: 200, lastReps: 5 });
    partial.sets = partial.sets.slice(0, 3);
    const pain = t1Session({ id: "pain", at: daysAgo(8), weight: 200, lastReps: 5 });
    pain.sets[1] = { ...pain.sets[1], status: "skipped_pain" };
    const run = t1Session({ id: "run", at: daysAgo(7), weight: 200, lastReps: 5 });
    run.sets[4] = { ...run.sets[4], status: "reduced_run_fatigue" };
    const drop = t1Session({ id: "drop", at: daysAgo(6), weight: 200, lastReps: 5 });
    drop.sets[2] = { ...drop.sets[2], status: "autoregulated_load_drop" };
    const other = t1Session({ id: "other", exerciseId: "bench", at: daysAgo(5), weight: 150, lastReps: 5 });
    expect(lastT1Sets([partial, pain, run, drop, other], "squat", NOW)).toEqual([]);
  });

  it("does not depend on the order of the input", () => {
    const workouts = [1, 2, 3, 4, 5].map((n) =>
      t1Session({ id: `w${n}`, at: daysAgo(n * 7), weight: 250 - n * 10, lastReps: 3 + (n % 3) })
    );
    const shuffled = [workouts[3], workouts[0], workouts[4], workouts[2], workouts[1]];
    expect(lastT1Sets(shuffled, "squat", NOW)).toEqual(lastT1Sets(workouts, "squat", NOW));
  });
});

describe("estimateRepsLevel: cold start", () => {
  it("uses a prior with no results", () => {
    const level = estimateRepsLevel(input());
    const expected = repsIndex(200, 3 + REPS_MODEL.priorRepsAboveTarget);
    expect(level.basis).toBe("prior");
    expect(level.sampleSize).toBe(0);
    expect(level.level).toBeCloseTo(expected, 10);
    expect(level.scatter).toBeCloseTo(REPS_MODEL.priorSdFraction * expected, 10);
    expect(level.regimeChange).toBeNull();
  });

  it("centres the prior on the target plus the prior reps", () => {
    for (const targetReps of [1, 2, 3]) {
      const forecast = forecastReps(input({ targetReps }));
      expect(forecast.typical).toBe(targetReps + REPS_MODEL.priorRepsAboveTarget);
    }
  });

  it("ignores results of a different exercise performed for the lift", () => {
    const level = estimateRepsLevel(
      input({ history: history([[7, 80, 6]], { performedExerciseId: "goblet_squat" }) })
    );
    expect(level.basis).toBe("prior");
  });

  it("ignores results dated after now", () => {
    const level = estimateRepsLevel(input({ history: history([[-2, 200, 9]]) }));
    expect(level.basis).toBe("prior");
  });

  it("takes one result as the level, with the wider floor", () => {
    const level = estimateRepsLevel(input({ history: history([[7, 200, 5]]) }));
    expect(level.basis).toBe("persistence");
    expect(level.sampleSize).toBe(1);
    expect(level.level).toBeCloseTo(repsIndex(200, 5), 10);
    expect(level.scatter).toBeCloseTo(REPS_MODEL.fewPointsSdFloorFraction * level.level, 10);
  });

  it("carries part of the planned weight's rise into one to three results", () => {
    const level = estimateRepsLevel(
      input({
        weight: 210,
        history: history([
          [14, 190, 6],
          [7, 200, 5],
        ]),
      })
    );
    const carry = REPS_MODEL.fewPointsWeightCarry;
    const expected =
      (repsIndex(190, 6) * (1 + carry * (210 / 190 - 1)) +
        repsIndex(200, 5) * (1 + carry * (210 / 200 - 1))) /
      2;
    expect(level.basis).toBe("persistence");
    expect(level.sampleSize).toBe(2);
    expect(level.level).toBeCloseTo(expected, 10);
  });

  it("does not carry anything down when the weight is lower", () => {
    const level = estimateRepsLevel(input({ weight: 195, history: history([[7, 200, 5]]) }));
    expect(level.level).toBeCloseTo(repsIndex(200, 5), 10);
  });

  it("uses the results' own scatter when it is wider than the floor", () => {
    const level = estimateRepsLevel(
      input({
        history: history([
          [21, 200, 2],
          [14, 200, 9],
          [7, 200, 3],
        ]),
      })
    );
    const values = [2, 9, 3].map((reps) => repsIndex(200, reps));
    const mean = sum(values) / 3;
    const sd = Math.sqrt(sum(values.map((v) => (v - mean) ** 2)) / 2);
    expect(sd).toBeGreaterThan(REPS_MODEL.fewPointsSdFloorFraction * mean);
    expect(level.scatter).toBeCloseTo(sd, 10);
  });

  it("does not forecast a miss for a lifter who repeats the same reps as the bar gets heavier", () => {
    // Three passes at 5 reps while the weight rose 5 lb a session.
    const forecast = forecastReps(
      input({
        weight: 205,
        history: history([
          [21, 190, 5],
          [14, 195, 5],
          [7, 200, 5],
        ]),
      })
    );
    expect(forecast.passChance).toBeGreaterThan(0.7);
    expect(forecast.typical).toBeGreaterThanOrEqual(4);
    expect(forecast.typical).toBeLessThanOrEqual(5);

    // Holding the level where it was would call the same lifter close to a coin flip.
    const held = (190 + 195 + 200) / 3 / 205;
    expect(30 * (held * (1 + 5 / 30) - 1)).toBeLessThan(3.5);
  });
});

describe("estimateRepsLevel: trend", () => {
  const rows: Array<[number, number, number]> = [
    [28, 185, 6],
    [21, 190, 6],
    [14, 195, 5],
    [7, 200, 5],
  ];

  it("fits a trend to four or more results of the current stretch", () => {
    const points = history(rows);
    const level = estimateRepsLevel(input({ weight: 205, history: points }));
    const fit = fitTrend(points.map((p) => ({ t: p.t, v: p.index })))!;
    const expected = fit.valueAt(NOW.getTime());
    expect(level.basis).toBe("trend");
    expect(level.sampleSize).toBe(REPS_MODEL.minTrendPoints);
    expect(level.level).toBeCloseTo(expected, 8);
    expect(level.scatter).toBeCloseTo(
      fit.predictionSd(
        NOW.getTime(),
        Math.max(fit.residualSd, REPS_MODEL.trendSdFloorFraction * expected)
      ),
      8
    );
  });

  it("never has a scatter under the floor, even for results exactly on a line", () => {
    const exact = history([
      [28, 170, 5],
      [21, 180, 5],
      [14, 190, 5],
      [7, 200, 5],
    ]);
    const level = estimateRepsLevel(input({ weight: 210, history: exact }));
    expect(level.basis).toBe("trend");
    expect(level.level).toBeCloseTo(repsIndex(210, 5), 6);
    expect(level.scatter).toBeGreaterThan(REPS_MODEL.trendSdFloorFraction * level.level);
  });

  it("does not depend on today's weight, so a heavier bar means fewer reps", () => {
    const points = history(rows);
    const light = forecastReps(input({ weight: 195, history: points }));
    const heavy = forecastReps(input({ weight: 215, history: points }));
    expect(heavy.level).toBeCloseTo(light.level, 10);
    expect(heavy.typical).toBeLessThan(light.typical);
  });

  it("falls back to the mean when fewer than four results are inside the window", () => {
    const old = history([
      [80, 180, 6],
      [70, 185, 6],
      [14, 195, 5],
      [7, 200, 5],
    ]);
    const level = estimateRepsLevel(input({ weight: 205, history: old }));
    // The gap between the second and third result is a break, so only two remain.
    expect(level.basis).toBe("persistence");
    expect(level.sampleSize).toBe(2);
  });

  it("drops results older than the window from the fit", () => {
    const weekly: Array<[number, number, number]> = [];
    for (let week = 12; week >= 1; week--) weekly.push([week * 7, 250 - week * 5, 5]);
    const level = estimateRepsLevel(input({ weight: 250, history: history(weekly) }));
    expect(level.basis).toBe("trend");
    expect(level.sampleSize).toBe(REPS_MODEL.trendWindowWeeks);
  });
});

describe("estimateRepsLevel: regime change", () => {
  const steady: Array<[number, number, number]> = [
    [28, 185, 6],
    [21, 190, 5],
    [14, 195, 4],
    [7, 200, 2],
  ];
  const lastThree = steady.slice(-3).map(([, weight, reps]) => repsIndex(weight, reps));
  const meanOfLastThree = sum(lastThree) / 3;

  it("widens the scatter after a stage change and stops fitting a trend", () => {
    const level = estimateRepsLevel(input({ weight: 200, targetReps: 2, history: history(steady) }));
    expect(level.basis).toBe("regime-change");
    expect(level.regimeChange).toBe("stage-change");
    expect(level.regimeMultiplier).toBe(REPS_MODEL.regimeChangeSdMultiplier);
    expect(level.sampleSize).toBe(3);
    expect(level.level).toBeCloseTo(meanOfLastThree, 10);
    expect(level.scatter).toBeCloseTo(level.baseScatter * REPS_MODEL.regimeChangeSdMultiplier, 10);
    expect(level.baseScatter).toBeGreaterThanOrEqual(
      REPS_MODEL.fewPointsSdFloorFraction * level.level
    );
  });

  it("treats a planned weight well below the last one as a reset", () => {
    const level = estimateRepsLevel(input({ weight: 170, history: history(steady) }));
    expect(level.regimeChange).toBe("reset");
    expect(level.basis).toBe("regime-change");
    // The level is held, so the lighter bar is forecast for more reps.
    expect(level.level).toBeCloseTo(meanOfLastThree, 10);
  });

  it("does not call a small step down a reset", () => {
    const level = estimateRepsLevel(input({ weight: 195, history: history(steady) }));
    expect(level.regimeChange).toBeNull();
    expect(level.basis).toBe("trend");
  });

  it("treats three weeks without the lift as a break", () => {
    const stale = history(steady.map(([days, w, r]) => [days + 21, w, r]));
    const level = estimateRepsLevel(input({ weight: 200, history: stale }));
    expect(level.regimeChange).toBe("break");
    expect(level.basis).toBe("regime-change");

    const recent = history(steady.map(([days, w, r]) => [days + 13, w, r]));
    expect(estimateRepsLevel(input({ weight: 200, history: recent })).regimeChange).toBeNull();
  });

  it("only uses results since the last regime change", () => {
    const afterReset = history([
      [56, 230, 3],
      [49, 235, 3],
      [42, 240, 2],
      [35, 245, 1],
      // Reset: the weight drops by more than the reset threshold.
      [14, 205, 8],
      [7, 210, 7],
    ]);
    const level = estimateRepsLevel(input({ weight: 215, history: afterReset }));
    expect(level.basis).toBe("persistence");
    expect(level.sampleSize).toBe(2);
    expect(level.regimeChange).toBeNull();
  });
});

describe("estimateRepsLevel: shifts and widening", () => {
  const maintaining = history([
    [14, 195, 5],
    [7, 200, 5],
  ]);
  const base = estimateRepsLevel(input({ history: maintaining }));

  it("lowers the level when today is a cut and the fitted sessions were not", () => {
    const cut = estimateRepsLevel(input({ history: maintaining, phase: "cutting" }));
    expect(cut.fittedPhase).toBe("maintaining");
    expect(cut.cuttingShift).toBe(REPS_MODEL.cuttingLevelShift);
    expect(cut.level).toBeCloseTo(base.level * (1 + REPS_MODEL.cuttingLevelShift), 10);
  });

  it("does not shift when the fitted sessions were already in a cut", () => {
    const cutting = history(
      [
        [14, 195, 5],
        [7, 200, 5],
      ],
      { phase: "cutting" }
    );
    const level = estimateRepsLevel(input({ history: cutting, phase: "cutting" }));
    expect(level.cuttingShift).toBe(0);
    expect(level.level).toBeCloseTo(base.level, 10);
  });

  it("does not shift outside a cut, without a majority phase, or on a prior", () => {
    expect(base.cuttingShift).toBe(0);
    expect(estimateRepsLevel(input({ history: maintaining, phase: "bulking" })).cuttingShift).toBe(0);
    const mixed = [...history([[14, 195, 5]], { phase: "cutting" }), ...history([[7, 200, 5]])];
    expect(estimateRepsLevel(input({ history: mixed, phase: "cutting" })).cuttingShift).toBe(0);
    const unknown = history([[7, 200, 5]], { phase: null });
    expect(estimateRepsLevel(input({ history: unknown, phase: "cutting" })).cuttingShift).toBe(0);
    expect(estimateRepsLevel(input({ phase: "cutting" })).cuttingShift).toBe(0);
  });

  it("applies the readiness shift, kept within its limits", () => {
    const down = estimateRepsLevel(input({ history: maintaining, readinessShift: -0.01 }));
    expect(down.readinessShift).toBe(-0.01);
    expect(down.level).toBeCloseTo(base.level * 0.99, 10);
    expect(down.scatter).toBeCloseTo(base.scatter, 10);

    const tooLow = estimateRepsLevel(input({ history: maintaining, readinessShift: -0.5 }));
    expect(tooLow.readinessShift).toBe(REPS_MODEL.readinessLevelShiftMin);
    const tooHigh = estimateRepsLevel(input({ history: maintaining, readinessShift: 0.5 }));
    expect(tooHigh.readinessShift).toBe(REPS_MODEL.readinessLevelShiftMax);
    const invalid = estimateRepsLevel(input({ history: maintaining, readinessShift: NaN }));
    expect(invalid.readinessShift).toBe(0);
  });

  it("widens the scatter by the track-record factor, between 1 and 2", () => {
    const wide = estimateRepsLevel(input({ history: maintaining, sdScale: 1.3 }));
    expect(wide.sdScale).toBe(1.3);
    expect(wide.scatter).toBeCloseTo(base.scatter * 1.3, 10);
    expect(wide.level).toBeCloseTo(base.level, 10);
    expect(estimateRepsLevel(input({ history: maintaining, sdScale: 9 })).sdScale).toBe(
      CALIBRATION.sdScaleMax
    );
    expect(estimateRepsLevel(input({ history: maintaining, sdScale: 0.2 })).sdScale).toBe(
      CALIBRATION.sdScaleMin
    );
  });

  it("works the level out for the planned weight when another weight is tried", () => {
    const planned = forecastReps(input({ weight: 205, history: maintaining }));
    const heavier = forecastReps(input({ weight: 225, plannedWeight: 205, history: maintaining }));
    const lighter = forecastReps(input({ weight: 185, plannedWeight: 205, history: maintaining }));
    expect(heavier.level).toBeCloseTo(planned.level, 10);
    expect(lighter.level).toBeCloseTo(planned.level, 10);
    expect(lighter.regimeChange).toBeNull();
    expect(heavier.passChance).toBeLessThan(planned.passChance);
    expect(lighter.passChance).toBeGreaterThan(planned.passChance);
  });
});

describe("chances", () => {
  const estimates = [
    { level: 230, scatter: 7 },
    { level: 230, scatter: 23 },
    { level: 205, scatter: 12 },
    { level: 300, scatter: 9 },
    { level: 150, scatter: 0.5 },
    { level: 233.3, scatter: 0 },
  ];
  const weights = [45, 135, 200, 222.5, 315];

  it("gives a pmf that sums to 1, for any level, scatter and weight", () => {
    for (const estimate of estimates) {
      for (const weight of weights) {
        const pmf = repsPmf(weight, estimate);
        expect(pmf).toHaveLength(REPS_MODEL.maxReps + 1);
        expect(pmf.every((p) => p >= 0 && p <= 1)).toBe(true);
        expect(sum(pmf)).toBeCloseTo(1, 12);
      }
    }
  });

  it("follows the stated formula", () => {
    const estimate = { level: 230, scatter: 8 };
    for (let reps = 1; reps <= 12; reps++) {
      const needed = 200 * (1 + (reps - REPS_MODEL.continuityReps) / 30);
      expect(chanceOfAtLeast(reps, 200, estimate)).toBeCloseTo(
        1 - normalCdf((needed - 230) / 8),
        12
      );
    }
  });

  it("is certain for zero reps and falls with more reps and with more weight", () => {
    const estimate = { level: 230, scatter: 8 };
    expect(chanceOfAtLeast(0, 200, estimate)).toBe(1);
    for (let reps = 1; reps <= 12; reps++) {
      expect(chanceOfAtLeast(reps, 200, estimate)).toBeLessThan(
        chanceOfAtLeast(reps - 1, 200, estimate)
      );
      expect(chanceOfAtLeast(reps, 210, estimate)).toBeLessThan(
        chanceOfAtLeast(reps, 200, estimate)
      );
    }
  });

  it("has a tail equal to the pmf from that count up", () => {
    for (const estimate of estimates) {
      const pmf = repsPmf(200, estimate);
      for (let reps = 0; reps <= REPS_MODEL.maxReps; reps++) {
        expect(chanceOfAtLeast(reps, 200, estimate)).toBeCloseTo(sum(pmf.slice(reps)), 12);
      }
    }
  });

  it("expects a lifter who always logs 5 reps to log 5 again", () => {
    const always5 = history([
      [28, 200, 5],
      [21, 200, 5],
      [14, 200, 5],
      [7, 200, 5],
    ]);
    const forecast = forecastReps(input({ history: always5 }));
    expect(forecast.typical).toBe(5);
    expect(forecast.mostLikely).toBe(5);
    expect(chanceOfAtLeast(5, 200, forecast)).toBeGreaterThan(0.5);
    expect(chanceOfAtLeast(6, 200, forecast)).toBeLessThan(0.5);
  });
});

describe("typical and most likely count", () => {
  it("picks the middle count and the largest single chance", () => {
    const pmf = [0.05, 0.1, 0.2, 0.35, 0.2, 0.1];
    expect(mostLikelyReps(pmf)).toBe(3);
    expect(typicalReps(pmf)).toBe(3);
  });

  it("keeps the middle count on the curve when a tail piles up at zero", () => {
    // Wide scatter: everything below one rep lands on 0, the largest single entry.
    const pmf = repsPmf(80, { level: repsIndex(80, 3), scatter: 8 });
    expect(mostLikelyReps(pmf)).toBe(0);
    expect(typicalReps(pmf)).toBe(3);
  });

  it("puts the middle count at or above the target exactly when a pass is more likely than not", () => {
    for (let level = 200; level <= 260; level += 1.7) {
      for (const scatter of [4, 9, 20]) {
        const estimate = { level, scatter };
        const pmf = repsPmf(200, estimate);
        const pass = chanceOfAtLeast(3, 200, estimate);
        expect(typicalReps(pmf) >= 3).toBe(pass > 0.5);
      }
    }
  });
});

describe("repsRange", () => {
  it("is the run around the middle count closest to the target share", () => {
    for (let level = 205; level <= 290; level += 3.1) {
      for (const scatter of [5, 8, 14, 25]) {
        const pmf = repsPmf(200, { level, scatter });
        const range = repsRange(pmf);
        const typical = typicalReps(pmf);
        expect(range.low).toBeLessThanOrEqual(typical);
        expect(range.high).toBeGreaterThanOrEqual(typical);
        expect(range.chance).toBeCloseTo(sum(pmf.slice(range.low, range.high + 1)), 12);

        // Neither one step wider nor one step narrower is closer to the target.
        const gap = Math.abs(range.chance - CALIBRATION.targetCoverage);
        const below = range.low > 0 ? pmf[range.low - 1] : null;
        const above = range.high < pmf.length - 1 ? pmf[range.high + 1] : null;
        const next = Math.max(below ?? -1, above ?? -1);
        if (next >= 0 && range.chance < CALIBRATION.targetCoverage) {
          expect(Math.abs(range.chance + next - CALIBRATION.targetCoverage)).toBeGreaterThan(gap);
        }
        expect(range.chance).toBeGreaterThan(0.6);
      }
    }
  });

  it("is a single count when the outcome is all but certain", () => {
    // A level of exactly 5 reps' worth sits in the middle of the "5 reps" bucket.
    const pmf = repsPmf(200, { level: repsIndex(200, 5), scatter: 0.4 });
    expect(repsRange(pmf)).toMatchObject({ low: 5, high: 5 });
    expect(repsRange(pmf).chance).toBeCloseTo(1, 6);
  });

  it("can end at the open top bucket", () => {
    const pmf = repsPmf(100, { level: repsIndex(100, 14), scatter: 4 });
    const range = repsRange(pmf);
    expect(range.high).toBe(REPS_MODEL.maxReps);
  });
});

describe("usualEffortCredit", () => {
  const rpes = (values: Array<number | null | undefined>) =>
    history(values.map((_, i): [number, number, number] => [7 * (values.length - i), 200, 5])).map(
      (point, i) => ({ ...point, rpe: values[i] })
    );
  const credit = (values: Array<number | null | undefined>) =>
    usualEffortCredit(rpes(values), "squat", NOW);

  it("is none when no effort was logged, or there is no history", () => {
    expect(usualEffortCredit([], "squat", NOW)).toEqual({ credit: 0, sample: 0 });
    expect(credit([null, undefined, null])).toEqual({ credit: 0, sample: 3 });
  });

  it("is the middle credit of the recent last sets, as the estimated max counts it", () => {
    expect(credit([8, 8, 8])).toEqual({ credit: 2, sample: 3 });
    expect(credit([9, 8, 7])).toEqual({ credit: repsInReserveFromRPE(8), sample: 3 });
    expect(credit([8.5, 8.5])).toEqual({ credit: 1.5, sample: 2 });
    // Capped as the estimate caps it, and never negative.
    expect(credit([4, 4, 4]).credit).toBe(E1RM_MAX_REPS_IN_RESERVE);
    expect(credit([10, 10, 10]).credit).toBe(0);
  });

  it("counts a last set with no logged effort as no credit", () => {
    // Logged once in five: the usual set gets none.
    expect(credit([null, 8, null, null, null]).credit).toBe(0);
    // Logged on most: the usual set gets it.
    expect(credit([8, null, 8, 8, null]).credit).toBe(2);
  });

  it("reads only the most recent sets, of the exercise performed, up to now", () => {
    const n = NEW_BEST_MODEL.effortCreditRecentSets;
    expect(n).toBe(5);
    const old = Array.from({ length: 4 }, () => 6);
    const recent = Array.from({ length: n }, () => 9);
    expect(credit([...old, ...recent])).toEqual({ credit: 1, sample: n });

    const other = rpes([7, 7, 7]).map((point) => ({ ...point, performedExerciseId: "goblet_squat" }));
    expect(usualEffortCredit([...other, ...rpes([9])], "squat", NOW)).toEqual({ credit: 1, sample: 1 });
    const future = history([[-3, 200, 5]], { rpe: 6 });
    expect(usualEffortCredit([...rpes([9, 9]), ...future], "squat", NOW).credit).toBe(1);
  });

  it("comes through lastT1Sets from the effort logged on the last set", () => {
    const workouts = [
      t1Session({ id: "a", at: daysAgo(9), weight: 200, lastReps: 5, setOverrides: { rpe: 8 } }),
      t1Session({ id: "b", at: daysAgo(2), weight: 205, lastReps: 5 }),
    ];
    const sets = lastT1Sets(workouts, "squat", NOW);
    expect(sets.map((point) => point.rpe)).toEqual([8, null]);
    expect(usualEffortCredit(sets, "squat", NOW)).toEqual({ credit: 1, sample: 2 });
  });
});

describe("forecastReps", () => {
  const points = history([
    [28, 185, 6],
    [21, 190, 6],
    [14, 195, 5],
    [7, 200, 5],
  ]);

  it("gives the pass chance as the tail at the target", () => {
    const forecast = forecastReps(input({ weight: 205, history: points }));
    expect(forecast.passChance).toBe(chanceOfAtLeast(3, 205, forecast));
    expect(forecast.passChance).toBeCloseTo(sum(forecast.pmf.slice(3)), 12);
    expect(forecast.stage).toBe("5x3");
  });

  it("gives the new-best chance as the spread from the reps repsToBeat names up to the longest set that counts", () => {
    for (const best of [225, 232, 238, 245, 255]) {
      const forecast = forecastReps(input({ weight: 205, history: points, bestE1RM: best }));
      const needed = repsToBeat(205, best)!;
      expect(forecast.newBest).not.toBeNull();
      expect(forecast.newBest!.repsNeeded).toBe(needed.reps);
      // No effort was logged on those sets, so none is credited.
      expect(forecast.newBest!.effortCredit).toBe(0);
      expect(forecast.newBest!.effortSample).toBe(points.length);
      expect(forecast.newBest!.chance).toBe(chanceOfNewBest(needed.reps, 205, forecast));
      expect(forecast.newBest!.chance).toBeCloseTo(
        sum(forecast.pmf.slice(needed.reps, E1RM_MAX_REPS + 1)),
        12
      );
      expect(forecast.newBest!.category).toBe(prChanceFromProbability(forecast.newBest!.chance));
      expect(forecast.newBest!.bestE1RM).toBe(best);
    }
  });

  it("leaves out the reps no estimate is kept for: a set longer than the cap is not a new best", () => {
    // A light bar and a strong lifter: most of the spread is above ten reps.
    const strong = { level: repsIndex(100, 11), scatter: 4 };
    const above = chanceOfAtLeast(E1RM_MAX_REPS + 1, 100, strong);
    expect(above).toBeGreaterThan(0.4);
    expect(chanceOfNewBest(2, 100, strong)).toBeCloseTo(chanceOfAtLeast(2, 100, strong) - above, 12);
    expect(chanceOfNewBest(2, 100, strong)).toBeCloseTo(
      sum(repsPmf(100, strong).slice(2, E1RM_MAX_REPS + 1)),
      12
    );
    expect(chanceOfNewBest(E1RM_MAX_REPS + 1, 100, strong)).toBe(0);
  });

  it("counts the lifter's usual effort credit toward the reps a new best needs", () => {
    // Every last set logged as two reps short of all-out (RPE 8).
    const logged = points.map((point) => ({ ...point, rpe: 8 }));
    const best = 245;
    const plain = forecastReps(input({ weight: 205, history: points, bestE1RM: best }));
    const credited = forecastReps(input({ weight: 205, history: logged, bestE1RM: best }));

    expect(credited.newBest!.effortCredit).toBe(2);
    const needed = repsToBeat(205, best, 8)!;
    expect(needed.reps).toBe(repsToBeat(205, best)!.reps - 2);
    expect(credited.newBest!.repsNeeded).toBe(needed.reps);
    expect(credited.newBest!.chance).toBeCloseTo(
      sum(credited.pmf.slice(needed.reps, E1RM_MAX_REPS + 1)),
      12
    );
    expect(credited.newBest!.chance).toBeGreaterThan(plain.newBest!.chance);
    // The spread of logged reps itself does not move: only what a new best needs.
    expect(credited.pmf).toEqual(plain.pmf);
    expect(credited.passChance).toBe(plain.passChance);
  });

  it("has a new-best chance where only the credited estimate can beat the best", () => {
    const logged = points.map((point) => ({ ...point, rpe: 7 }));
    const ceiling = calculateE1RM(205, E1RM_MAX_REPS)!;
    expect(forecastReps(input({ weight: 205, history: points, bestE1RM: ceiling })).newBest).toBeNull();
    const credited = forecastReps(input({ weight: 205, history: logged, bestE1RM: ceiling }));
    expect(credited.newBest!.repsNeeded).toBe(repsToBeat(205, ceiling, 7)!.reps);
  });

  it("makes a new best less likely the higher the best is", () => {
    const easy = forecastReps(input({ weight: 205, history: points, bestE1RM: 225 }));
    const hard = forecastReps(input({ weight: 205, history: points, bestE1RM: 255 }));
    expect(hard.newBest!.chance).toBeLessThan(easy.newBest!.chance);
  });

  it("has no new-best chance without a best, or when no rep count beats it", () => {
    expect(forecastReps(input({ history: points })).newBest).toBeNull();
    expect(forecastReps(input({ history: points, bestE1RM: null })).newBest).toBeNull();
    expect(forecastReps(input({ history: points, bestE1RM: 0 })).newBest).toBeNull();
    expect(repsToBeat(200, 400)).toBeNull();
    expect(forecastReps(input({ history: points, bestE1RM: 400 })).newBest).toBeNull();
  });

  it("is the same whatever the order of the history", () => {
    const mixed = points.map((point, i) => ({ ...point, rpe: [8, null, 9, 7][i] }));
    expect(
      forecastReps(input({ weight: 205, bestE1RM: 240, history: [mixed[2], mixed[0], mixed[3], mixed[1]] }))
    ).toEqual(forecastReps(input({ weight: 205, bestE1RM: 240, history: mixed })));
    const shuffled = [points[2], points[0], points[3], points[1]];
    expect(forecastReps(input({ weight: 205, history: shuffled }))).toEqual(
      forecastReps(input({ weight: 205, history: points }))
    );
  });

  it("reads only results up to now", () => {
    const withFuture = [...points, ...history([[-7, 205, 1]])];
    expect(forecastReps(input({ weight: 205, history: withFuture }))).toEqual(
      forecastReps(input({ weight: 205, history: points }))
    );
  });
});
