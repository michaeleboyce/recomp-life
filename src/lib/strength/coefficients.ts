// The numbers the strength model runs on: how sets of different exercises pool into one
// estimate per program lift, the starting ratios between a home exercise and its barbell
// lift, and how drop sets count. Research: docs/research/2026-11-strength-transfer.md.
// Rules: src/lib/evidence/rules/strength.ts.
//
// Every ratio is "the exercise's estimated max ÷ the barbell lift's estimated max", with
// the exercise's weight counted as the total load moved (both dumbbells when one is held
// in each hand, the single dumbbell for a goblet squat; see `externalLoad`).

import type { SourceId } from "@/lib/evidence/sources";
import { PROJECTION_COEFFICIENTS } from "@/lib/projection/coefficients";

/**
 * Coefficients for `pooledLiftEstimate`, `muscleStrengthIndex` and the re-entry helpers.
 *
 * @evidence strength-pooling
 * @evidence transfer-ratio
 * @evidence drop-set-evidence
 */
export const STRENGTH_POOLING = {
  /**
   * How much one session of a related exercise counts toward a program lift's estimate,
   * relative to a session of the lift itself.
   *
   * Source: none for this question. The value is the projection model's
   * `relatedSetTransfer` (0.4), which is about how much a set of another exercise for the
   * same muscles adds to the lift's *progress* (Pelland 2026, Saeterbakken 2025). Here the
   * question is how much a home session *tells us* about the lift's strength, which no
   * study measures. Judgment: reuse the project's one transfer figure so the two models
   * agree, and widen the range instead of trusting the converted number more.
   */
  transferWeight: PROJECTION_COEFFICIENTS.relatedSetTransfer,
  /**
   * Half-life of a session's weight in the pooled estimate, in days, measured back from
   * the newest session that is pooled.
   *
   * Source: none. A GZCLP lifter gains roughly 1-2% a week early on (the forecast
   * research simulated that range), so a session two weeks older than the newest is a
   * few percent stale. Judgment: halve its weight every 14 days.
   */
  evidenceHalfLifeDays: 14,
  /**
   * Scatter of one session's estimated max around the lifter's true level, as a
   * fraction of it. Sizes the range of the pooled estimate.
   *
   * Source: none directly. Trained lifters retested a week apart scattered by about 2-2.6%
   * on this index in a lab (Mitter 2022, used by the forecast research), a tested 1RM by a
   * median 4.2% in mixed groups (Grgic 2020). Judgment: 3.5%, between the two.
   */
  sessionSdFraction: 0.035,
} as const;

/**
 * How ratios between a home exercise and its barbell lift are learned from the
 * lifter's own sessions (`learnTransferRatio`).
 *
 * @evidence transfer-ratio
 */
export const TRANSFER_RATIO = {
  /**
   * A home session and a gym session of the same program lift form a pair when they are
   * at most this many days apart.
   *
   * Source: none. Long enough that a lifter alternating gym and home weeks gets pairs;
   * short enough that real strength change inside a pair (about 1-2% a week) stays below
   * the scatter of the two estimates. Judgment.
   */
  pairWindowDays: 14,
  /**
   * Scatter of one pair's ratio, on a log scale (about a fraction).
   *
   * Source: none. Two session estimates each scattering by `sessionSdFraction` give
   * √2 × 3.5% ≈ 5%; up to two weeks of real change adds about 2%. Judgment: 0.06.
   */
  pairLogSd: 0.06,
  /**
   * From this many pairs on, the lifter's own spread of ratios replaces `pairLogSd`
   * when it is wider, so pairs that disagree with each other move the ratio less.
   */
  minPairsForOwnSpread: 3,
} as const;

/** The program lifts a home exercise can stand in for. */
export type ProgramLiftId = "squat" | "bench" | "deadlift" | "ohp";

/** One starting ratio and how much it is trusted. */
export interface TransferPrior {
  /** The exercise's estimated max ÷ the barbell lift's, counting the total load. */
  ratio: number;
  /**
   * How far a person's own ratio may sit from the starting one, on a log scale. A prior
   * counts as (pairLogSd ÷ priorLogSd)² pairs against the lifter's own.
   */
  priorLogSd: number;
  /** `limited` when a study measured the pair; `heuristic` when the ratio is assumed. */
  grade: "limited" | "heuristic";
  sources: readonly SourceId[];
  /** One line on where the number comes from. */
  basis: string;
}

/** Prior scatter for a ratio taken from a study: people differ around a study's average. */
const STUDIED_PRIOR_LOG_SD = 0.08;
/** Prior scatter for an assumed ratio: wide, so a few of the lifter's own pairs win. */
const ASSUMED_PRIOR_LOG_SD = 0.2;

/**
 * Starting ratios for each home substitute in `HOME_SUBSTITUTE_CHAINS`.
 *
 * Studied pairs (each one small study; see the research note):
 * - Dumbbell bench press: 1RM 17% below the barbell bench press in 12 trained men
 *   (Saeterbakken 2011), so 0.83. A master's thesis (56 men, no DOI) found about 20%.
 * - Dumbbell shoulder press (standing): 1RM 7% below the standing barbell press in 15 men
 *   (Saeterbakken & Fimland 2013), so 0.93.
 * - Bulgarian split squat: a rear-foot-elevated split squat 1RM, loaded with a barbell and
 *   tested on one leg, averaged 75-76 kg against a back squat of about 152-156 kg in 18
 *   academy rugby players (Speirs 2016), so 0.5. Dumbbells change the grip, not the total
 *   load, so the prior is wider than for the presses.
 *
 * Assumed pairs (no comparison study found; grade heuristic):
 * - Floor press: a shorter range than the dumbbell bench press; assume the same 0.83.
 * - Arnold press: the rotation costs load against the plain dumbbell press; assume 0.8.
 * - Lunge: a split stance like the split squat with the rear foot on the floor helping a
 *   little more; assume 0.55.
 * - Goblet squat: limited by holding one dumbbell at the chest, not by the legs; assume 0.45.
 * - Dumbbell Romanian deadlift: a practitioner rule of thumb puts a barbell Romanian
 *   deadlift near 70% of the deadlift (no peer-reviewed comparison); dumbbells lose a
 *   little more to grip; assume 0.6.
 * - Single-leg dumbbell Romanian deadlift: one leg, balance-limited; assume 0.35.
 *
 * @evidence transfer-ratio
 */
export const TRANSFER_PRIORS: Record<ProgramLiftId, Record<string, TransferPrior>> = {
  squat: {
    goblet_squat: {
      ratio: 0.45,
      priorLogSd: ASSUMED_PRIOR_LOG_SD,
      grade: "heuristic",
      sources: [],
      basis: "assumption: limited by holding one dumbbell at the chest",
    },
    bulgarian_split_squat: {
      ratio: 0.5,
      priorLogSd: 0.1,
      grade: "limited",
      sources: ["speirs2016"],
      basis: "split squat 1RM about half the back squat 1RM in 18 rugby players",
    },
    db_lunge: {
      ratio: 0.55,
      priorLogSd: ASSUMED_PRIOR_LOG_SD,
      grade: "heuristic",
      sources: [],
      basis: "assumption: like the split squat, with the rear foot helping a little more",
    },
  },
  bench: {
    db_bench: {
      ratio: 0.83,
      priorLogSd: STUDIED_PRIOR_LOG_SD,
      grade: "limited",
      sources: ["saeterbakken2011"],
      basis: "dumbbell bench 1RM 17% below barbell in 12 trained men",
    },
    db_floor_press: {
      ratio: 0.83,
      priorLogSd: ASSUMED_PRIOR_LOG_SD,
      grade: "heuristic",
      sources: [],
      basis: "assumption: as the dumbbell bench press",
    },
  },
  deadlift: {
    db_rdl: {
      ratio: 0.6,
      priorLogSd: ASSUMED_PRIOR_LOG_SD,
      grade: "heuristic",
      sources: [],
      basis: "assumption: a Romanian deadlift is lighter, and dumbbells lose a little to grip",
    },
    single_leg_db_rdl: {
      ratio: 0.35,
      priorLogSd: ASSUMED_PRIOR_LOG_SD,
      grade: "heuristic",
      sources: [],
      basis: "assumption: one leg at a time, limited by balance",
    },
  },
  ohp: {
    db_shoulder_press: {
      ratio: 0.93,
      priorLogSd: STUDIED_PRIOR_LOG_SD,
      grade: "limited",
      sources: ["saeterbakken2013"],
      basis: "standing dumbbell press 1RM 7% below standing barbell press in 15 men",
    },
    db_arnold_press: {
      ratio: 0.8,
      priorLogSd: ASSUMED_PRIOR_LOG_SD,
      grade: "heuristic",
      sources: [],
      basis: "assumption: the rotation costs load against the plain dumbbell press",
    },
  },
};

/**
 * How drop sets count (`sessionEstimates`, `volumeCredits`).
 *
 * @evidence drop-set-evidence
 */
export const DROP_SETS = {
  /**
   * How far below fresh strength a first drop's estimated max is taken to be. The drop's
   * estimate is divided by (1 - fatigueDiscount) before it is used.
   *
   * Source: Havers 2026 describes protocols where, after a set to failure, lifters managed
   * 5 reps at a 15-rep-max load (Costa) or about 6 reps after a cut from 75% to 55% of
   * 1RM (Enes); by the app's formula those drops sit about 22% and 34% below fresh (our
   * arithmetic). Maximal force fell 11.6-18.1% after drop protocols against 6.3% after
   * traditional sets (Goto, in the same review). Judgment: 25%.
   */
  fatigueDiscount: 0.25,
  /**
   * How much the first drops after a session's sets count, all together, relative to the
   * session's best normal set. Small because the fatigue allowance itself is uncertain.
   * Judgment.
   */
  evidenceWeight: 0.25,
  /** Muscle volume: each drop counts as this many sets. Judgment, cautious (see below). */
  volumeCredit: 0.5,
  /**
   * Muscle volume: the drops that follow one set add at most this many sets. Sødal 2023's
   * included studies had one 12-rep-max set plus three drops grow muscle as much as three
   * full sets (Fink 2018), so one extra set is cautious.
   */
  maxExtraSetsPerWorkingSet: 1,
} as const;

/**
 * How much an exercise counts toward a muscle: the same weights the app uses for volume
 * (a primary muscle 1, a secondary one 0.5; stabilisers 0).
 *
 * @evidence strength-pooling
 */
export const MUSCLE_WEIGHTS = { primary: 1, secondary: 0.5 } as const;

/**
 * The per-muscle strength index (`muscleStrengthIndex`).
 *
 * @evidence strength-pooling
 */
export const MUSCLE_INDEX = {
  /** The index of a muscle at its first estimate. */
  base: 100,
  /**
   * An exercise not done for this many days drops out of the muscle's index until it is
   * done again. Judgment: six weeks, about the length of a home or gym block.
   */
  staleAfterDays: 42,
} as const;
