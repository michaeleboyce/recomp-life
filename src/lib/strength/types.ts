// Input and output shapes of the strength model. The stored set type lives in
// src/types; the wiring maps stored sets onto `StrengthSet`.

import type { Tier } from "@/types";

/**
 * What a set was for. `ramp` and `backoff` count like `working` sets at their own
 * weight; `warmup` counts for nothing; `drop` continues another set with no rest.
 */
export type StrengthSetRole = "warmup" | "ramp" | "working" | "backoff" | "drop";

/** One logged set, as evidence about strength. */
export interface StrengthSet {
  id: string;
  /** The workout the set belongs to: sets of one exercise in one session pool into one estimate. */
  sessionId: string;
  /** The exercise actually performed (the home substitute at home, not the program lift). */
  exerciseId: string;
  /** Weight as lifted: per dumbbell when `perHand`. */
  weight: number;
  /** The weight is per dumbbell. See `externalLoad` for how the total is counted. */
  perHand: boolean;
  reps: number;
  /** Logged effort (RPE 6-10), when there is one. */
  rpe?: number | null;
  role: StrengthSetRole;
  /** The slot the set was done in; only T1 sets give an estimate, as today. */
  tier: Tier;
  /** Taken to as many reps as possible. */
  isAMRAP: boolean;
  /** When the set was completed. */
  date: Date | string;
  /** For a drop: the id of the set it continues (a working set or an earlier drop). */
  dropOf?: string;
  /**
   * From a session imported from another app: history, counted by the same rules as
   * every other set, never a GZCLP session. Absent on the app's own sets.
   */
  imported?: true;
}

/** The best set of one session for one exercise. */
export interface EstimateSet {
  id: string;
  weight: number;
  perHand: boolean;
  /** Total load moved (see `externalLoad`). */
  load: number;
  reps: number;
  rpe: number | null;
}

/** What one session says about one exercise's strength. */
export interface SessionEstimate {
  exerciseId: string;
  sessionId: string;
  /** When the best set was done. */
  date: Date;
  /**
   * The estimated max: the best normal set by the app's formula and limits. Never from a
   * drop. This is the value that feeds estimated-max rows and new bests.
   */
  estimatedMax: number;
  /**
   * The session's strength evidence: the estimated max, nudged by the session's first
   * drops after their fatigue allowance. Equal to `estimatedMax` when there are no drops.
   */
  strength: number;
  bestSet: EstimateSet;
  /** First drops that entered `strength`. */
  dropsCounted: number;
}

/** A ratio between a home exercise and its barbell lift, as the app currently believes it. */
export interface TransferRatio {
  liftId: string;
  exerciseId: string;
  /** Exercise estimated max ÷ lift estimated max. */
  ratio: number;
  /** Standard deviation of `ratio` (same units). */
  sd: number;
  /** Standard deviation on the log scale (about a fraction of the ratio). */
  logSd: number;
  /** The lifter's own pairs behind it; 0 means the starting ratio alone. */
  pairs: number;
  /** The starting ratio, or null for a pair the app has no starting ratio for. */
  prior: number | null;
  grade: "limited" | "heuristic";
  /** `prior` with no pairs; `learned` otherwise. */
  basis: "prior" | "learned";
  pairList: SessionPair[];
}

/** A home session and a gym session of the same lift close in time. */
export interface SessionPair {
  exerciseSessionId: string;
  liftSessionId: string;
  exerciseStrength: number;
  liftStrength: number;
  ratio: number;
  gapDays: number;
}

/** A related exercise's session, translated into the program lift's units. */
export interface RelatedEvidence {
  exerciseId: string;
  sessionId: string;
  date: Date;
  /** The session's strength in the exercise's own units (total load). */
  strength: number;
  /** `strength ÷ ratio`: what it says about the lift. */
  liftEquivalent: number;
  ratio: TransferRatio;
  /** Weight in the pool, after the transfer weight and the age decay. */
  weight: number;
}

/** One strength estimate for a program lift, pooled from its own and related sessions. */
export interface PooledEstimate {
  liftId: string;
  /** Pounds, rounded like the app's estimated 1RM. */
  value: number;
  /** Standard deviation, pounds (one decimal). */
  sd: number;
  /** `own`: barbell sessions only; `related`: home sessions only; `pooled`: both. */
  basis: "own" | "related" | "pooled";
  /** The latest session of the lift itself, which starts the estimate. */
  own: SessionEstimate | null;
  /** Weight of `own` in the pool, after the age decay. */
  ownWeight: number;
  /** Related sessions after `own`, oldest first. */
  related: RelatedEvidence[];
}
