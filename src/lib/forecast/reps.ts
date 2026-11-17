// Reps on the last set of a T1 lift, as a spread of rep counts. Pure.
//
// Every past last set becomes one number, the index x = weight x (1 + reps / 30), so
// sets at different weights can be pooled. Today's strength is taken as a bell curve
// around a level m with scatter s, and the chance of at least k reps at weight W is
// the share of that curve at or above the index k reps would need. The chance of a
// new best and the chance of passing are two readings of the same curve.
import { E1RM_MAX_REPS, repsInReserveFromRPE } from "@/lib/e1rm";
import { prChanceFromProbability, repsToBeat, type PrChance } from "@/lib/projection/prOpportunity";
import { WEEK_MS } from "@/lib/dates";
import { fitTrend } from "@/lib/projection/trend";
import { T1_STAGE_SCHEME } from "@/lib/workout/prescription";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type { ForecastBasis, T1Stage, TrainingPhase, WorkoutSession } from "@/types";
import { CALIBRATION, NEW_BEST_MODEL, REPS_MODEL } from "./coefficients";
import {
  finishedBy,
  hasFreeze,
  hasLoadDrop,
  lastSetOf,
  performedExerciseId,
  toMs,
} from "./log";
import { clamp, mean, median, normalCdf, sampleSd } from "./math";

type PhaseMode = TrainingPhase["mode"];

/** One past last set of a T1 lift. */
export interface LastSetPoint {
  /** When the set was logged, epoch milliseconds. */
  t: number;
  workoutId: string;
  /** Weight on the bar, lbs, as logged. */
  weight: number;
  /** Reps logged, with no reps-in-reserve credit. */
  reps: number;
  /** The effort (RPE) logged with the set; null or absent when none was. */
  rpe?: number | null;
  stage: T1Stage | null;
  /** The training phase the session was finished in, when it was stored. */
  phase: PhaseMode | null;
  /** The exercise performed: the substitute at home, otherwise the lift itself. */
  performedExerciseId: string;
  /** `repsIndex` of the set, with reps counted up to REPS_MODEL.historyRepsCap. */
  index: number;
}

/** Why the history counts for less today. */
export type RegimeChange = "stage-change" | "reset" | "break";

/**
 * The strength index of a set: weight x (1 + reps / 30), unrounded, with no credit
 * for reps left in reserve. It is in lbs and matches what `repsToBeat` counts.
 */
export function repsIndex(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/** The T1 stage whose scheme has this many reps a set, or null. */
export function stageForReps(reps: number): T1Stage | null {
  const stages = Object.keys(T1_STAGE_SCHEME) as T1Stage[];
  return stages.find((stage) => T1_STAGE_SCHEME[stage].reps === reps) ?? null;
}

/**
 * The last set ("as many as you can") of every finished T1 session of the lift up to
 * `now`, oldest first. Read from the workouts themselves, so each point has its
 * weight and nothing is capped at the last few.
 *
 * Left out: workouts that are deleted, unfinished or finished after `now`; sessions
 * where the lift's last set was never reached; sessions where a T1 set of the lift
 * was skipped or lightened for pain, a run or equipment, or carries a load drop
 * (those reps do not measure strength); sets with no weight.
 *
 * @evidence forecast-reps
 */
export function lastT1Sets(
  workouts: WorkoutSession[],
  exerciseId: string,
  now: Date
): LastSetPoint[] {
  const points: LastSetPoint[] = [];
  for (const workout of finishedBy(workouts, now.getTime())) {
    const t1 = workingSetsFor(workout.sets ?? [], exerciseId, "T1");
    if (t1.length === 0 || hasFreeze(t1) || hasLoadDrop(t1)) continue;
    const last = lastSetOf(t1);
    if (!last) continue;
    const { weight, actualReps: reps } = last;
    if (!(weight > 0) || !Number.isFinite(reps) || reps < 0) continue;

    const loggedAt = toMs(last.completedAt);
    const prescribed = workout.prescribed?.find(
      (entry) => entry.exerciseId === exerciseId && entry.tier === "T1"
    );
    points.push({
      t: Number.isFinite(loggedAt) ? loggedAt : toMs(workout.completedAt),
      workoutId: workout.id,
      weight,
      reps,
      rpe: last.rpe ?? null,
      stage: stageForReps(last.targetReps) ?? ((prescribed?.stage as T1Stage) || null),
      phase: workout.completionContext?.phaseMode ?? null,
      performedExerciseId: performedExerciseId(last),
      index: repsIndex(weight, Math.min(reps, REPS_MODEL.historyRepsCap)),
    });
  }
  return points.sort((a, b) => a.t - b.t || (a.workoutId < b.workoutId ? -1 : 1));
}

export interface RepsModelInput {
  /** Past last sets of the lift (`lastT1Sets`), any order. */
  history: LastSetPoint[];
  /** The exercise performed today: the substitute's id at home, else the lift's. */
  performedExerciseId: string;
  /** Weight on the bar the forecast is for, lbs. */
  weight: number;
  /** Target reps of today's scheme (3 at 5x3). */
  targetReps: number;
  /**
   * The weight the program planned for today, when `weight` is a different one being
   * tried out (lighter or heavier). The level is worked out for the planned weight,
   * so trying a heavier bar never makes the lifter look stronger. Defaults to `weight`.
   */
  plannedWeight?: number;
  /** Today's training phase, when known. */
  phase?: PhaseMode | null;
  /** Readiness shift of the level as a fraction; kept within the model's limits. */
  readinessShift?: number;
  /** Widening factor from the track record (`sdScaleFor`); 1 when left out. */
  sdScale?: number;
  /** Best estimated max of the lift, lbs, for the new-best chance. */
  bestE1RM?: number | null;
  now: Date;
}

/** Today's strength level and its scatter, with everything that went into them. */
export interface RepsLevel {
  basis: ForecastBasis;
  /** Level m in index lbs, after the phase and readiness shifts. */
  level: number;
  /** Scatter s in index lbs, after the regime-change and track-record widening. */
  scatter: number;
  /** How many past last sets the level was worked out from. */
  sampleSize: number;
  /** The level before any shift. */
  baseLevel: number;
  /** The scatter before any widening. */
  baseScatter: number;
  regimeChange: RegimeChange | null;
  /** 1, or REPS_MODEL.regimeChangeSdMultiplier after a regime change. */
  regimeMultiplier: number;
  sdScale: number;
  cuttingShift: number;
  readinessShift: number;
  /** The phase most of the fitted sessions were finished in, when one has a majority. */
  fittedPhase: PhaseMode | null;
}

export interface RepsForecast extends RepsLevel {
  weight: number;
  targetReps: number;
  stage: T1Stage | null;
  /** pmf[k] = chance of exactly k reps; the last entry is "that many or more". Sums to 1. */
  pmf: number[];
  /** The rep count with the highest single chance (`mostLikelyReps`). */
  mostLikely: number;
  /** The middle rep count, the one the curve is centred on (`typicalReps`). */
  typical: number;
  /** About an 80% range of rep counts, with the chance the model itself gives it. */
  range: RepsRange;
  /** Chance the last set reaches the target reps. */
  passChance: number;
  /**
   * Chance that the workout sets a new best estimated max; null with no best, or when
   * no rep count that gives an estimate beats it.
   */
  newBest: {
    /** Fewest logged reps that beat the best, given the usual effort credit. */
    repsNeeded: number;
    chance: number;
    category: PrChance;
    bestE1RM: number;
    /** The lifter's usual effort credit on the last set, in reps (`usualEffortCredit`). */
    effortCredit: number;
    /** How many recent last sets that credit was read from. */
    effortSample: number;
  } | null;
}

export interface RepsRange {
  low: number;
  /** When this is the last bucket of the pmf it means "that many or more". */
  high: number;
  /** The chance the pmf gives to low..high. */
  chance: number;
}

/**
 * A boundary between two consecutive sessions of a lift after which the earlier
 * results say less: a different stage, a weight at least
 * REPS_MODEL.regimeChangeWeightDrop lower (a reset or a time-off reduction), or
 * REPS_MODEL.regimeChangeWeeksOff weeks without the lift.
 */
function regimeBetween(
  earlier: Pick<LastSetPoint, "t" | "weight" | "stage">,
  later: { t: number; weight: number; stage: T1Stage | null }
): RegimeChange | null {
  if ((later.t - earlier.t) / WEEK_MS >= REPS_MODEL.regimeChangeWeeksOff) return "break";
  if (earlier.stage && later.stage && earlier.stage !== later.stage) return "stage-change";
  if (later.weight <= earlier.weight * (1 - REPS_MODEL.regimeChangeWeightDrop)) return "reset";
  return null;
}

/** The latest stretch of points with no regime change between neighbours. */
function currentRun(points: LastSetPoint[]): LastSetPoint[] {
  let start = points.length - 1;
  while (start > 0 && !regimeBetween(points[start - 1], points[start])) start -= 1;
  return points.slice(Math.max(0, start));
}

/** The phase more than half of the points with a stored phase share, or null. */
function majorityPhase(points: LastSetPoint[]): PhaseMode | null {
  const counts = new Map<PhaseMode, number>();
  let known = 0;
  for (const point of points) {
    if (!point.phase) continue;
    known += 1;
    counts.set(point.phase, (counts.get(point.phase) ?? 0) + 1);
  }
  for (const [phase, count] of counts) {
    if (count * 2 > known) return phase;
  }
  return null;
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Today's level m and scatter s for a lift.
 *
 * Only past sets of the exercise performed today count (a dumbbell substitute at home
 * and the barbell lift are on different scales). From those:
 * - none: a prior. The level is the index of REPS_MODEL.priorRepsAboveTarget reps
 *   over the target at the planned weight; the scatter is priorSdFraction of it.
 * - a regime change since the last session (`regimeBetween`): the mean index of the
 *   last one to three results of the stretch that just ended, with the few-results
 *   scatter x regimeChangeSdMultiplier.
 * - REPS_MODEL.minTrendPoints or more results of the current stretch inside
 *   trendWindowWeeks: a straight-line trend (`fitTrend`) read at `now`. The scatter
 *   is the residual scatter, at least trendSdFloorFraction of the level, widened for
 *   how well four or so points pin the line down (`predictionSd`).
 * - otherwise (one to three results): their mean, each first carried up by
 *   fewPointsWeightCarry of the planned weight's rise since it was lifted. The
 *   scatter is their own, at least fewPointsSdFloorFraction of the level.
 *
 * Then the level moves by cuttingLevelShift when today is a cut and most fitted
 * sessions were not, and by the readiness shift (kept within its limits); the scatter
 * is multiplied by the track-record widening factor (1 to 2).
 *
 * @evidence forecast-reps
 */
export function estimateRepsLevel(input: RepsModelInput): RepsLevel {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { levelAt, daySd, levelErrors, ...level } = repsOutlook(input);
  return level;
}

/**
 * Today's level (`estimateRepsLevel`) and how it carries to a later session of the
 * same lift, for reading the same model several sessions ahead.
 */
export interface RepsOutlook extends RepsLevel {
  /**
   * The level at `tMs` for a planned weight, with today's shifts. A trend is read at
   * that time; one to three results are carried up by fewPointsWeightCarry of that
   * weight's rise; a prior or the level after a change stays where it is today.
   */
  levelAt(tMs: number, plannedWeight: number): number;
  /** The day-to-day scatter of one result around the level, in index lbs. */
  daySd: number;
  /**
   * The level's own error, as independent bell-curve parts: each gives its size in
   * index lbs at a time. With `daySd` they make up the scatter:
   * scatter^2 = daySd^2 + the sum of the parts' squares at `now`. A part is shared by
   * every later session, so the results of two sessions are not independent.
   */
  levelErrors: ReadonlyArray<(tMs: number) => number>;
}

/**
 * The share of a few-results scatter that is day-to-day scatter, as the floor's own
 * reasoning splits it: the next result spreads around the mean of n results by
 * sd x sqrt(1 + 1/n), so the day part is sqrt(n / (n + 1)) of it.
 */
const dayShare = (n: number) => (n > 0 ? Math.sqrt(n / (n + 1)) : 0);

/**
 * `estimateRepsLevel` with what is needed to read it at later sessions: the level at
 * a later time and weight, and the scatter split into the day-to-day part and the
 * level's own error. The split follows each basis's own reasoning:
 * - trend: the day part is the residual scatter (at least the floor); the level's
 *   error is the fitted line's, its height and its slope (`predictionSd`);
 * - one to three results: n results pin their mean down to a scatter / sqrt(n + 1);
 * - after a change: as for one to three results, and the extra
 *   regimeChangeSdMultiplier widening is all the level's;
 * - prior: the day part is trendSdFloorFraction of the level (the smallest scatter a
 *   trained lifter shows), the rest is the level's.
 * The track-record widening scales both parts.
 *
 * @evidence forecast-reps
 */
export function repsOutlook(input: RepsModelInput): RepsOutlook {
  const nowMs = input.now.getTime();
  const stage = stageForReps(input.targetReps);
  const plannedWeight = finiteOr(input.plannedWeight, input.weight);
  const points = input.history
    .filter((p) => p.performedExerciseId === input.performedExerciseId && p.t <= nowMs)
    .sort((a, b) => a.t - b.t);

  let basis: ForecastBasis;
  let baseLevel: number;
  let baseScatter: number;
  let fitted: LastSetPoint[] = [];
  let regimeChange: RegimeChange | null = null;
  /** The level before shifts at a time and planned weight. */
  let baseLevelAt: (tMs: number, weight: number) => number;
  /** The day part and the level's error parts, before the track-record widening. */
  let baseDaySd: number;
  let baseErrors: Array<(tMs: number) => number>;

  const fewPoints = (values: number[]) => {
    const level = mean(values);
    return {
      level,
      scatter: Math.max(sampleSd(values), REPS_MODEL.fewPointsSdFloorFraction * level),
    };
  };
  const few = REPS_MODEL.minTrendPoints - 1;

  if (points.length === 0) {
    basis = "prior";
    baseLevel = repsIndex(plannedWeight, input.targetReps + REPS_MODEL.priorRepsAboveTarget);
    baseScatter = REPS_MODEL.priorSdFraction * baseLevel;
    const level = baseLevel;
    baseLevelAt = () => level;
    baseDaySd = Math.min(baseScatter, REPS_MODEL.trendSdFloorFraction * baseLevel);
    const error = Math.sqrt(Math.max(0, baseScatter ** 2 - baseDaySd ** 2));
    baseErrors = [() => error];
  } else {
    const last = points[points.length - 1];
    const run = currentRun(points);
    regimeChange = regimeBetween(last, { t: nowMs, weight: plannedWeight, stage });

    if (regimeChange) {
      basis = "regime-change";
      fitted = run.slice(-few);
      ({ level: baseLevel, scatter: baseScatter } = fewPoints(fitted.map((p) => p.index)));
      const level = baseLevel;
      baseLevelAt = () => level;
      baseDaySd = baseScatter * dayShare(fitted.length);
      const total = baseScatter * REPS_MODEL.regimeChangeSdMultiplier;
      const error = Math.sqrt(Math.max(0, total ** 2 - baseDaySd ** 2));
      baseErrors = [() => error];
    } else {
      const windowStart = nowMs - REPS_MODEL.trendWindowWeeks * WEEK_MS;
      const recent = run.filter((p) => p.t >= windowStart);
      const fit =
        recent.length >= REPS_MODEL.minTrendPoints
          ? fitTrend(recent.map((p) => ({ t: p.t, v: p.index })))
          : null;
      const trendLevel = fit ? fit.valueAt(nowMs) : NaN;

      if (fit && Number.isFinite(trendLevel) && trendLevel > 0) {
        basis = "trend";
        fitted = recent;
        baseLevel = trendLevel;
        const single = Math.max(fit.residualSd, REPS_MODEL.trendSdFloorFraction * trendLevel);
        baseScatter = fit.predictionSd(nowMs, single);
        baseLevelAt = (tMs) => fit.valueAt(tMs);
        baseDaySd = single;
        const n = fit.pointsUsed;
        baseErrors = [
          () => single / Math.sqrt(n),
          (tMs) =>
            (single * ((tMs - fit.meanTime) / WEEK_MS)) / Math.sqrt(fit.timeSumSquares),
        ];
      } else {
        basis = "persistence";
        fitted = recent.slice(-few);
        const kept = fitted;
        const carriedAt = (weight: number) =>
          kept.map((p) => {
            const rise = p.weight > 0 ? Math.max(0, weight / p.weight - 1) : 0;
            return p.index * (1 + REPS_MODEL.fewPointsWeightCarry * rise);
          });
        ({ level: baseLevel, scatter: baseScatter } = fewPoints(carriedAt(plannedWeight)));
        baseLevelAt = (_tMs, weight) => mean(carriedAt(weight));
        baseDaySd = baseScatter * dayShare(kept.length);
        const error = baseScatter / Math.sqrt(kept.length + 1);
        baseErrors = [() => error];
      }
    }
  }

  const fittedPhase = majorityPhase(fitted);
  const cuttingShift =
    input.phase === "cutting" && fittedPhase !== null && fittedPhase !== "cutting"
      ? REPS_MODEL.cuttingLevelShift
      : 0;
  const readinessShift = clamp(
    finiteOr(input.readinessShift, 0),
    REPS_MODEL.readinessLevelShiftMin,
    REPS_MODEL.readinessLevelShiftMax
  );
  const regimeMultiplier = regimeChange ? REPS_MODEL.regimeChangeSdMultiplier : 1;
  const sdScale = clamp(
    finiteOr(input.sdScale, 1),
    CALIBRATION.sdScaleMin,
    CALIBRATION.sdScaleMax
  );
  const shift = 1 + cuttingShift + readinessShift;

  return {
    basis,
    level: baseLevel * shift,
    scatter: baseScatter * regimeMultiplier * sdScale,
    sampleSize: fitted.length,
    baseLevel,
    baseScatter,
    regimeChange,
    regimeMultiplier,
    sdScale,
    cuttingShift,
    readinessShift,
    fittedPhase,
    levelAt: (tMs, weight) => baseLevelAt(tMs, weight) * shift,
    daySd: baseDaySd * sdScale,
    levelErrors: baseErrors.map((error) => (tMs: number) => error(tMs) * sdScale),
  };
}

/**
 * Chance of logging at least `reps` reps at `weight`, given the level and scatter:
 * 1 - Phi((W x (1 + (reps - c) / 30) - m) / s), with c = REPS_MODEL.continuityReps.
 * Zero reps or fewer is certain.
 *
 * @evidence forecast-reps
 */
export function chanceOfAtLeast(
  reps: number,
  weight: number,
  estimate: Pick<RepsLevel, "level" | "scatter">
): number {
  if (!(reps > 0)) return 1;
  const needed = repsIndex(weight, reps - REPS_MODEL.continuityReps);
  if (!(estimate.scatter > 0)) return estimate.level >= needed ? 1 : 0;
  return normalCdf((estimate.level - needed) / estimate.scatter);
}

/**
 * The chance of each rep count from 0 to REPS_MODEL.maxReps, the last entry meaning
 * "that many or more". Built from differences of `chanceOfAtLeast`, so it sums to 1.
 */
export function repsPmf(weight: number, estimate: Pick<RepsLevel, "level" | "scatter">): number[] {
  const tails: number[] = [];
  for (let reps = 0; reps <= REPS_MODEL.maxReps; reps++) {
    tails.push(chanceOfAtLeast(reps, weight, estimate));
  }
  return tails.map((tail, reps) =>
    reps === REPS_MODEL.maxReps ? tail : Math.max(0, tail - tails[reps + 1])
  );
}

/** The rep count with the highest single chance; the lower count on a tie. */
export function mostLikelyReps(pmf: number[]): number {
  let best = 0;
  for (let reps = 1; reps < pmf.length; reps++) {
    if (pmf[reps] > pmf[best]) best = reps;
  }
  return best;
}

/**
 * The middle rep count: the lowest count with at least an even chance of doing that
 * many or fewer. This is the count the bell curve is centred on. With a wide scatter
 * the two end buckets collect whole tails, so the single likeliest entry
 * (`mostLikelyReps`) can be 0 while most of the curve sits well above it; the middle
 * count does not jump like that, and it always agrees with the pass chance (it is at
 * or above the target exactly when passing is more likely than not).
 */
export function typicalReps(pmf: number[]): number {
  let cumulative = 0;
  for (let reps = 0; reps < pmf.length; reps++) {
    cumulative += pmf[reps];
    if (cumulative >= 0.5) return reps;
  }
  return Math.max(0, pmf.length - 1);
}

/**
 * The run of neighbouring rep counts around the middle one whose chance is closest
 * to `target` (CALIBRATION.targetCoverage). It grows from the middle count
 * (`typicalReps`), each time taking the likelier neighbour, and stops at whichever of
 * the last two sizes is nearer the target (the wider on a tie). Rep counts are whole
 * numbers, so no range holds exactly 80%; `chance` says what this one holds.
 *
 * @evidence forecast-calibration
 */
export function repsRange(pmf: number[], target: number = CALIBRATION.targetCoverage): RepsRange {
  let low = typicalReps(pmf);
  let high = low;
  let chance = pmf[low] ?? 0;
  while (chance < target && (low > 0 || high < pmf.length - 1)) {
    const below = low > 0 ? pmf[low - 1] : -1;
    const above = high < pmf.length - 1 ? pmf[high + 1] : -1;
    const takeBelow = below > above;
    const added = takeBelow ? below : above;
    if (target - chance < chance + added - target) break;
    if (takeBelow) low -= 1;
    else high += 1;
    chance += added;
  }
  return { low, high, chance };
}

/**
 * The lifter's usual effort credit on the last set of an exercise, in reps: what the
 * estimated max adds for the effort logged with a set (`repsInReserveFromRPE`), as
 * the middle value over the latest NEW_BEST_MODEL.effortCreditRecentSets last sets
 * of the exercise performed, up to `now`. A set with no logged effort counts as no
 * credit, so a lifter who does not log one gets none. `sample` is how many sets
 * were read.
 *
 * @evidence forecast-reps
 */
export function usualEffortCredit(
  history: LastSetPoint[],
  exercisePerformed: string,
  now: Date
): { credit: number; sample: number } {
  const nowMs = now.getTime();
  const recent = history
    .filter((p) => p.performedExerciseId === exercisePerformed && p.t <= nowMs)
    .sort((a, b) => a.t - b.t || (a.workoutId < b.workoutId ? -1 : 1))
    .slice(-NEW_BEST_MODEL.effortCreditRecentSets);
  if (recent.length === 0) return { credit: 0, sample: 0 };
  return {
    credit: median(recent.map((p) => repsInReserveFromRPE(p.rpe))),
    sample: recent.length,
  };
}

/**
 * Chance that the reps logged on the last set land from `repsNeeded` up to
 * E1RM_MAX_REPS. The app keeps no estimated max for a longer set, so reps above that
 * cannot set a best and are left out.
 *
 * @evidence forecast-reps
 */
export function chanceOfNewBest(
  repsNeeded: number,
  weight: number,
  estimate: Pick<RepsLevel, "level" | "scatter">
): number {
  return Math.max(
    0,
    chanceOfAtLeast(repsNeeded, weight, estimate) -
      chanceOfAtLeast(E1RM_MAX_REPS + 1, weight, estimate)
  );
}

/**
 * The whole reps forecast for one lift at one weight.
 *
 * The new best is the event the app itself shows: the workout's estimated max for the
 * lift, with the credit for a logged effort, above the best so far. The reps it needs
 * are `repsToBeat` at the lifter's usual effort credit, and its chance is the spread
 * from that count up to the longest set that gives an estimate (`chanceOfNewBest`).
 *
 * @evidence forecast-reps
 */
export function forecastReps(input: RepsModelInput): RepsForecast {
  const estimate = estimateRepsLevel(input);
  const pmf = repsPmf(input.weight, estimate);

  let newBest: RepsForecast["newBest"] = null;
  const best = input.bestE1RM;
  if (typeof best === "number" && Number.isFinite(best) && best > 0) {
    const effort = usualEffortCredit(input.history, input.performedExerciseId, input.now);
    // The credit as the effort that gives it, so the estimate's own function counts it.
    const needed = repsToBeat(input.weight, best, 10 - effort.credit);
    if (needed) {
      const chance = chanceOfNewBest(needed.reps, input.weight, estimate);
      newBest = {
        repsNeeded: needed.reps,
        chance,
        category: prChanceFromProbability(chance),
        bestE1RM: best,
        effortCredit: effort.credit,
        effortSample: effort.sample,
      };
    }
  }

  return {
    ...estimate,
    weight: input.weight,
    targetReps: input.targetReps,
    stage: stageForReps(input.targetReps),
    pmf,
    mostLikely: mostLikelyReps(pmf),
    typical: typicalReps(pmf),
    range: repsRange(pmf),
    passChance: chanceOfAtLeast(input.targetReps, input.weight, estimate),
    newBest,
  };
}
