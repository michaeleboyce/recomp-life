import { describe, it, expect } from "vitest";
import { calculateE1RM } from "@/lib/e1rm";
import { HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { TRANSFER_PRIORS, TRANSFER_RATIO, type ProgramLiftId } from "./coefficients";
import { learnTransferRatio, learnTransferRatios, pairSessions, priorFor } from "./ratio";
import { sessionEstimates, asLifted } from "./estimate";
import { t1Session } from "./testHelpers";
import type { StrengthSet } from "./types";

const PAIRS: Array<[ProgramLiftId, string]> = Object.entries(TRANSFER_PRIORS).flatMap(([lift, table]) =>
  Object.keys(table).map((exerciseId) => [lift as ProgramLiftId, exerciseId] as [ProgramLiftId, string])
);

/**
 * `count` pairs: a gym session of the lift and, two days later, a home session whose
 * estimated max is `trueRatio` × the gym one (times an optional noise factor). The
 * lift's 5-rep AMRAP weight climbs 5 lb a pair.
 */
function syntheticPairs(
  liftId: string,
  exerciseId: string,
  trueRatio: number,
  count: number,
  noise: readonly number[] = []
): StrengthSet[] {
  const sets: StrengthSet[] = [];
  for (let i = 0; i < count; i++) {
    const liftWeight = 200 + 5 * i;
    const liftMax = calculateE1RM(liftWeight, 5)!;
    // Choose the home weight so its estimated max is the target: 8-rep AMRAP.
    const target = liftMax * trueRatio * (noise[i] ?? 1);
    const total = target / (1 + 8 / 30);
    sets.push(
      ...t1Session({ sessionId: `g${i}`, exerciseId: liftId, weight: liftWeight, amrapReps: 5, day: 7 * i }),
      ...t1Session({
        sessionId: `h${i}`,
        exerciseId,
        weight: asLifted(total, exerciseId),
        perHand: true,
        amrapReps: 8,
        day: 7 * i + 2,
      })
    );
  }
  return sets;
}

/** A ratio for a pair with a known prior, which is never null. */
function learnKnown(liftId: string, exerciseId: string, sets: readonly StrengthSet[]) {
  const ratio = learnTransferRatio(liftId, exerciseId, sets);
  if (!ratio) throw new Error(`no ratio for ${liftId} -> ${exerciseId}`);
  return ratio;
}

describe("priors", () => {
  it("cover every home substitute in the substitution chains", () => {
    for (const [lift, chain] of Object.entries(HOME_SUBSTITUTE_CHAINS)) {
      for (const exerciseId of chain) {
        expect(priorFor(lift, exerciseId), `${lift} -> ${exerciseId}`).not.toBeNull();
      }
    }
  });

  it("are ratios below 1 with a positive spread, and only studied pairs cite sources", () => {
    for (const [lift, exerciseId] of PAIRS) {
      const prior = TRANSFER_PRIORS[lift][exerciseId];
      expect(prior.ratio).toBeGreaterThan(0);
      expect(prior.ratio).toBeLessThan(1);
      expect(prior.priorLogSd).toBeGreaterThan(0);
      if (prior.grade === "heuristic") expect(prior.sources).toHaveLength(0);
      else expect(prior.sources.length).toBeGreaterThan(0);
    }
  });
});

describe("pairSessions", () => {
  it("pairs a home session with the gym session closest in time, each session once", () => {
    const sets = syntheticPairs("squat", "bulgarian_split_squat", 0.7, 3);
    const pairs = pairSessions(
      sessionEstimates(sets, "bulgarian_split_squat"),
      sessionEstimates(sets, "squat")
    );
    expect(pairs.map((p) => [p.exerciseSessionId, p.liftSessionId])).toEqual([
      ["h0", "g0"],
      ["h1", "g1"],
      ["h2", "g2"],
    ]);
    expect(pairs.every((p) => p.gapDays === 2)).toBe(true);
  });

  it(`ignores sessions more than ${TRANSFER_RATIO.pairWindowDays} days apart`, () => {
    const gym = t1Session({ sessionId: "g", exerciseId: "squat", weight: 200, amrapReps: 5, day: 0 });
    const home = t1Session({
      sessionId: "h",
      exerciseId: "bulgarian_split_squat",
      weight: 50,
      perHand: true,
      amrapReps: 8,
      day: TRANSFER_RATIO.pairWindowDays + 1,
    });
    const sets = [...gym, ...home];
    expect(pairSessions(sessionEstimates(sets, "bulgarian_split_squat"), sessionEstimates(sets, "squat"))).toEqual([]);
  });

  it("never pairs two sessions of the same workout", () => {
    const gym = t1Session({ sessionId: "same", exerciseId: "squat", weight: 200, amrapReps: 5, day: 0 });
    const home = t1Session({
      sessionId: "same",
      exerciseId: "bulgarian_split_squat",
      weight: 50,
      perHand: true,
      amrapReps: 8,
      day: 0,
    });
    const sets = [...gym, ...home];
    expect(pairSessions(sessionEstimates(sets, "bulgarian_split_squat"), sessionEstimates(sets, "squat"))).toEqual([]);
  });
});

describe("learnTransferRatio", () => {
  it("equals the prior with no pairs", () => {
    for (const [lift, exerciseId] of PAIRS) {
      const learned = learnKnown(lift, exerciseId, []);
      const prior = TRANSFER_PRIORS[lift][exerciseId];
      expect(learned.ratio).toBe(prior.ratio);
      expect(learned.pairs).toBe(0);
      expect(learned.basis).toBe("prior");
      expect(learned.logSd).toBe(prior.priorLogSd);
      expect(learned.sd).toBeCloseTo(prior.ratio * prior.priorLogSd, 10);
    }
  });

  it("with no pairs ignores sessions of only one side", () => {
    const gymOnly = t1Session({ sessionId: "g", exerciseId: "bench", weight: 185, amrapReps: 5, day: 0 });
    expect(learnKnown("bench", "db_bench", gymOnly).ratio).toBe(TRANSFER_PRIORS.bench.db_bench.ratio);
  });

  it("H5: six synthetic pairs with a true ratio of 0.7 land within ±0.03, for every prior", () => {
    for (const [lift, exerciseId] of PAIRS) {
      const learned = learnKnown(lift, exerciseId, syntheticPairs(lift, exerciseId, 0.7, 6));
      expect(learned.pairs, `${lift} -> ${exerciseId}`).toBe(6);
      expect(Math.abs(learned.ratio - 0.7), `${lift} -> ${exerciseId}: ${learned.ratio}`).toBeLessThanOrEqual(0.03);
    }
  });

  it("H5: six noisy pairs (±2-4% session to session) also land within ±0.03", () => {
    const noise = [1.04, 0.96, 1.02, 0.98, 1.03, 0.97];
    for (const [lift, exerciseId] of PAIRS) {
      const learned = learnKnown(lift, exerciseId, syntheticPairs(lift, exerciseId, 0.7, 6, noise));
      expect(Math.abs(learned.ratio - 0.7), `${lift} -> ${exerciseId}: ${learned.ratio}`).toBeLessThanOrEqual(0.03);
    }
  });

  it("shrinks toward the prior with few pairs and moves toward the data with more", () => {
    const prior = TRANSFER_PRIORS.bench.db_bench.ratio;
    const gaps = [1, 2, 4, 6].map((n) =>
      Math.abs(learnKnown("bench", "db_bench", syntheticPairs("bench", "db_bench", 0.7, n)).ratio - 0.7)
    );
    expect(gaps[0]).toBeGreaterThan(gaps[1]);
    expect(gaps[1]).toBeGreaterThan(gaps[2]);
    expect(gaps[2]).toBeGreaterThan(gaps[3]);
    const one = learnKnown("bench", "db_bench", syntheticPairs("bench", "db_bench", 0.7, 1));
    expect(one.ratio).toBeGreaterThan(0.7);
    expect(one.ratio).toBeLessThan(prior);
  });

  it("narrows its uncertainty as pairs accumulate and reports the count for the trace", () => {
    const sds = [0, 2, 4].map((n) => learnKnown("squat", "db_lunge", syntheticPairs("squat", "db_lunge", 0.6, n)));
    expect(sds.map((r) => r.pairs)).toEqual([0, 2, 4]);
    expect(sds[1].logSd).toBeLessThan(sds[0].logSd);
    expect(sds[2].logSd).toBeLessThan(sds[1].logSd);
    expect(sds[2].basis).toBe("learned");
    expect(sds[2].pairList).toHaveLength(4);
  });

  it("widens when the lifter's own pairs disagree more than assumed", () => {
    const calm = learnKnown("squat", "db_lunge", syntheticPairs("squat", "db_lunge", 0.6, 4));
    const wild = learnKnown(
      "squat",
      "db_lunge",
      syntheticPairs("squat", "db_lunge", 0.6, 4, [1.3, 0.75, 1.25, 0.8])
    );
    expect(wild.logSd).toBeGreaterThan(calm.logSd);
  });

  it("learns from pairs alone when no prior is known, and is null-safe without either", () => {
    const sets = syntheticPairs("bench", "incline_db_press", 0.75, 3);
    const learned = learnTransferRatio("bench", "incline_db_press", sets);
    expect(learned?.pairs).toBe(3);
    expect(learned?.prior).toBeNull();
    expect(learned?.ratio).toBeCloseTo(0.75, 2);
    expect(learnTransferRatio("bench", "incline_db_press", [])).toBeNull();
  });

  it("learnTransferRatios covers every prior of a lift", () => {
    const ratios = learnTransferRatios("squat", []);
    expect(Object.keys(ratios).sort()).toEqual(Object.keys(TRANSFER_PRIORS.squat).sort());
  });
});
