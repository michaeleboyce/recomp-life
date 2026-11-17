// The reps model read at a T1 lift's next sessions: the chance the lift misses at its
// current stage within its next two sessions, and when its working weight reaches its
// next round number. Pure.
//
// Both walk the program's own rules forward (`evaluateT1`): a pass adds the lift's step
// (`getIncrement`, `progressionLiftType`), a miss moves it down a stage, a miss at the
// last stage resets it. Each session passes with the reps model's chance of reaching
// the target on the last set at that session's weight and date (`repsOutlook`). The
// level's own error is shared by every session, so it is averaged over (Gauss-Hermite
// points) rather than drawn afresh each time; only the day-to-day part is.
import { EXERCISES } from "@/lib/exercises";
import { evaluateT1, getIncrement } from "@/lib/progression";
import { WEEK_MS } from "@/lib/dates";
import { progressionLiftType } from "@/lib/workout/completeWorkout";
import { T1_STAGE_SCHEME } from "@/lib/workout/prescription";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  EquipmentProfile,
  ForecastBasis,
  LiftState,
  SetLog,
  T1Stage,
  WorkoutSession,
} from "@/types";
import {
  CALIBRATION,
  LIFT_OUTLOOK_MODEL,
  MILESTONE_MODEL,
  STALL_MODEL,
} from "./coefficients";
import { DAY_MS, finishedBy, toMs } from "./log";
import { clamp, mean, normalNodes, sampleSd } from "./math";
import {
  chanceOfAtLeast,
  lastT1Sets,
  repsOutlook,
  repsRange,
  typicalReps,
  type RepsOutlook,
} from "./reps";
import type { ForecastSource } from "./types";

/** The program's T1 lifts, in a fixed order. */
export const T1_LIFTS: readonly string[] = [
  ...new Set(
    Object.values(WORKOUT_TEMPLATES).flatMap((template) =>
      template.exercises.filter((ex) => ex.tier === "T1").map((ex) => ex.exerciseId)
    )
  ),
].sort();

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

/** How often a lift comes round. */
export interface LiftPace {
  /** Mean days between the lift's recent sessions. */
  gapDays: number;
  /** Their scatter, at least LIFT_OUTLOOK_MODEL.gapSdFloorDays. */
  gapSdDays: number;
  /** When its latest session was finished, epoch milliseconds. */
  lastAt: number;
  /** How many sessions the pace was read from. */
  sessions: number;
}

/**
 * The pace of a lift from its T1 sessions (done as itself or with its home
 * substitute) finished within LIFT_OUTLOOK_MODEL.paceWindowWeeks before `now`. Null
 * with fewer than minPaceSessions of them.
 *
 * @evidence forecast-stall
 */
export function liftPace(workouts: WorkoutSession[], exerciseId: string, now: Date): LiftPace | null {
  const nowMs = now.getTime();
  const from = nowMs - LIFT_OUTLOOK_MODEL.paceWindowWeeks * WEEK_MS;
  const times = finishedBy(workouts, nowMs)
    .filter((w) => workingSetsFor(w.sets ?? [], exerciseId, "T1").length > 0)
    .map((w) => toMs(w.completedAt))
    .filter((t) => t >= from);
  if (times.length < Math.max(2, LIFT_OUTLOOK_MODEL.minPaceSessions)) return null;
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / DAY_MS);
  const gapDays = mean(gaps);
  if (!(gapDays > 0)) return null;
  return {
    gapDays,
    gapSdDays: Math.max(sampleSd(gaps), LIFT_OUTLOOK_MODEL.gapSdFloorDays),
    lastAt: times[times.length - 1],
    sessions: times.length,
  };
}

/** When the lift's next `count` sessions fall at its pace: the first one gap after the last, and not before `now`. */
export function nextSessionTimes(pace: LiftPace, now: Date, count: number): number[] {
  const gapMs = pace.gapDays * DAY_MS;
  const first = Math.max(now.getTime(), pace.lastAt + gapMs);
  return Array.from({ length: count }, (_, i) => first + i * gapMs);
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/** A point on the walk: the lift's working weight and stage before a session. */
interface WalkState {
  weight: number;
  stage: T1Stage;
}

const stateKey = (state: WalkState) => `${state.weight}|${state.stage}`;

/** Sets standing for a whole session, as the progression rule reads them. */
function sessionSets(stage: T1Stage, passed: boolean): SetLog[] {
  const { sets, reps } = T1_STAGE_SCHEME[stage];
  return Array.from({ length: sets }, (_, i) => ({
    status: passed || i < sets - 1 ? "completed" : "failed",
    actualReps: passed || i < sets - 1 ? reps : 0,
    targetReps: reps,
  })) as SetLog[];
}

export interface WalkInput {
  outlook: Pick<RepsOutlook, "levelAt" | "daySd" | "levelErrors">;
  /** The lift as it stands: its T1 weight and stage are where the walk starts. */
  liftState: LiftState;
  /** When each session comes, oldest first. */
  times: readonly number[];
  /** Which step a pass adds (`getIncrement`), at the gym with this equipment. */
  liftType: "upper" | "lower";
  equipment: EquipmentProfile;
  /** Stop a path at its first miss (for the stall chance). */
  stopAtMiss?: boolean;
  /** Stop a path once its working weight is at or above this (for a milestone). */
  target?: number;
}

export interface WalkResult {
  /** firstMiss[i]: chance session i + 1 is the first that does not pass. */
  firstMiss: number[];
  /** reached[i]: chance session i + 1 is the first at or above `target`. */
  reached: number[];
}

/** The independent parts of the level's error, each with its Gauss-Hermite points. */
function errorGrid(parts: number): { zs: number[]; weight: number }[] {
  const nodes = normalNodes(LIFT_OUTLOOK_MODEL.levelErrorPoints);
  let grid: { zs: number[]; weight: number }[] = [{ zs: [], weight: 1 }];
  for (let p = 0; p < parts; p++) {
    grid = grid.flatMap((cell) =>
      nodes.map((node) => ({ zs: [...cell.zs, node.z], weight: cell.weight * node.weight }))
    );
  }
  return grid;
}

const TINY = 1e-12;

/**
 * Walks the program forward over `times`, session by session. Each path passes with
 * the reps model's chance of reaching the stage's target on the last set at its
 * weight and date, given a value of the level's error; a pass or a miss then does
 * what `evaluateT1` does. The result is averaged over the level's error.
 *
 * @evidence forecast-stall
 * @evidence forecast-milestone
 */
export function walkProgram(input: WalkInput): WalkResult {
  const sessions = input.times.length;
  const firstMiss = new Array<number>(sessions).fill(0);
  const reached = new Array<number>(sessions).fill(0);
  const { outlook, liftState, times } = input;

  // What a pass and a miss do to each state, as the program's own rule does it.
  const transitions = new Map<string, { pass: WalkState; miss: WalkState }>();
  const next = (state: WalkState) => {
    const key = stateKey(state);
    let found = transitions.get(key);
    if (!found) {
      const from: LiftState = { ...liftState, t1Weight: state.weight, t1Stage: state.stage };
      const after = (passed: boolean): WalkState => {
        const { state: result } = evaluateT1(
          from,
          sessionSets(state.stage, passed),
          "gym",
          input.equipment,
          input.liftType
        );
        return { weight: result.t1Weight, stage: result.t1Stage };
      };
      found = { pass: after(true), miss: after(false) };
      transitions.set(key, found);
    }
    return found;
  };

  const errorsAt = times.map((t) => outlook.levelErrors.map((error) => error(t)));
  for (const cell of errorGrid(outlook.levelErrors.length)) {
    let paths = new Map<string, { state: WalkState; mass: number }>([
      [stateKey(liftStateToWalk(liftState)), { state: liftStateToWalk(liftState), mass: 1 }],
    ]);
    for (let n = 0; n < sessions && paths.size > 0; n++) {
      const shift = errorsAt[n].reduce((sum, size, i) => sum + size * cell.zs[i], 0);
      const after = new Map<string, { state: WalkState; mass: number }>();
      const move = (state: WalkState, mass: number) => {
        if (mass < TINY) return;
        const key = stateKey(state);
        const held = after.get(key);
        if (held) held.mass += mass;
        else after.set(key, { state, mass });
      };
      for (const { state, mass } of paths.values()) {
        if (input.target !== undefined && state.weight >= input.target) {
          reached[n] += cell.weight * mass;
          continue;
        }
        const { reps } = T1_STAGE_SCHEME[state.stage];
        const pass = chanceOfAtLeast(reps, state.weight, {
          level: outlook.levelAt(times[n], state.weight) + shift,
          scatter: outlook.daySd,
        });
        const { pass: onPass, miss: onMiss } = next(state);
        move(onPass, mass * pass);
        if (input.stopAtMiss) firstMiss[n] += cell.weight * mass * (1 - pass);
        else move(onMiss, mass * (1 - pass));
      }
      paths = after;
    }
  }
  return { firstMiss, reached };
}

function liftStateToWalk(state: LiftState): WalkState {
  return { weight: state.t1Weight, stage: state.t1Stage };
}

// ---------------------------------------------------------------------------
// What both forecasts start from
// ---------------------------------------------------------------------------

/** Everything a forecast for a lift's next sessions stands on. */
export interface LiftOutlook {
  exerciseId: string;
  liftState: LiftState;
  outlook: RepsOutlook;
  pace: LiftPace;
  liftType: "upper" | "lower";
  /** The step a pass adds at the gym. */
  increment: number;
  targetReps: number;
}

/**
 * The reps model for a T1 lift's next sessions, as things stand at `source.now`:
 * the lift state's T1 weight and stage, the lift's last sets done as itself, its pace,
 * the track-record widening of the reps model and today's training phase. No
 * readiness: it is about later sessions. Null for a lift with no lift state, a deload
 * under way, no last set of its own, too few recent sessions for a pace, or a level
 * resting on anything but a trend or one to three results at the current stage (a
 * stage change, reset or break since the last session).
 */
export function liftOutlook(source: ForecastSource, exerciseId: string): LiftOutlook | null {
  const liftState = source.liftStates.find((state) => state.exerciseId === exerciseId);
  const equipment = source.settings?.equipment;
  if (!liftState || !equipment || liftState.deloadActive || !(liftState.t1Weight > 0)) return null;
  if (!T1_STAGE_SCHEME[liftState.t1Stage] || !EXERCISES[exerciseId]) return null;
  const history = lastT1Sets(source.workouts, exerciseId, source.now);
  if (!history.some((point) => point.performedExerciseId === exerciseId)) return null;
  const pace = liftPace(source.workouts, exerciseId, source.now);
  if (!pace) return null;

  const targetReps = T1_STAGE_SCHEME[liftState.t1Stage].reps;
  const outlook = repsOutlook({
    history,
    performedExerciseId: exerciseId,
    weight: liftState.t1Weight,
    targetReps,
    phase: source.settings?.trainingPhase?.mode ?? null,
    sdScale: source.sdScale?.amrapReps,
    now: source.now,
  });
  // Right after a stage change, a reset or a break the level is the last stretch's
  // mean, held flat; read over two or more sessions it ran far too gloomy on the
  // simulated lifters, so these wait for the lift's first result since the change.
  if (outlook.basis !== "trend" && outlook.basis !== "persistence") return null;
  const liftType = progressionLiftType(exerciseId);
  return {
    exerciseId,
    liftState,
    outlook,
    pace,
    liftType,
    increment: getIncrement(liftType, "gym", equipment),
    targetReps,
  };
}

/** The keys every stored row carries, from the reps model's view of the lift. */
function commonInputs(lift: LiftOutlook, source: ForecastSource): Record<string, number | string | null> {
  return {
    level: lift.outlook.level,
    scatter: lift.outlook.scatter,
    sampleSize: lift.outlook.sampleSize,
    readinessShift: null,
    phase: source.settings?.trainingPhase?.mode ?? null,
    daySd: lift.outlook.daySd,
    weight: lift.liftState.t1Weight,
    stage: lift.liftState.t1Stage,
    targetReps: lift.targetReps,
    increment: lift.increment,
    gapDays: lift.pace.gapDays,
    gapSdDays: lift.pace.gapSdDays,
    paceSessions: lift.pace.sessions,
    regimeChange: lift.outlook.regimeChange,
    cuttingShift: lift.outlook.cuttingShift,
  };
}

// ---------------------------------------------------------------------------
// Stall risk
// ---------------------------------------------------------------------------

export interface StallForecast {
  exerciseId: string;
  /** Today's working weight: the first of the sessions. */
  weight: number;
  stage: T1Stage;
  targetReps: number;
  /** Chance the lift misses within the next STALL_MODEL.sessions sessions. */
  chance: number;
  /** Chance the first of them passes. */
  passFirst: number;
  /** When the last of them is expected, epoch milliseconds. */
  dueAt: number;
  basis: ForecastBasis;
  inputs: Record<string, number | string | null>;
}

/**
 * The chance a T1 lift misses at its current stage within its next
 * STALL_MODEL.sessions sessions: the first at today's working weight, each later one
 * a program step heavier after a pass. Null when the lift has no outlook
 * (`liftOutlook`).
 *
 * @evidence forecast-stall
 */
export function forecastStall(source: ForecastSource, exerciseId: string): StallForecast | null {
  const lift = liftOutlook(source, exerciseId);
  if (!lift || !source.settings) return null;
  const times = nextSessionTimes(lift.pace, source.now, STALL_MODEL.sessions);
  const walk = walkProgram({
    outlook: lift.outlook,
    liftState: lift.liftState,
    times,
    liftType: lift.liftType,
    equipment: source.settings.equipment,
    stopAtMiss: true,
  });
  const chance = clamp(
    walk.firstMiss.reduce((sum, p) => sum + p, 0),
    0,
    1
  );
  return {
    exerciseId,
    weight: lift.liftState.t1Weight,
    stage: lift.liftState.t1Stage,
    targetReps: lift.targetReps,
    chance,
    passFirst: clamp(1 - walk.firstMiss[0], 0, 1),
    dueAt: times[times.length - 1],
    basis: lift.outlook.basis,
    inputs: {
      ...commonInputs(lift, source),
      sdScale: lift.outlook.sdScale,
      passFirst: clamp(1 - walk.firstMiss[0], 0, 1),
      sessions: STALL_MODEL.sessions,
    },
  };
}

// ---------------------------------------------------------------------------
// Milestone
// ---------------------------------------------------------------------------

/** The next multiple of MILESTONE_MODEL.roundToLbs above a weight. */
export function nextRoundWeight(weight: number): number {
  const step = MILESTONE_MODEL.roundToLbs;
  return Math.floor(weight / step + 1e-9) * step + step;
}

export interface MilestoneForecast {
  exerciseId: string;
  /** The round number, lbs. */
  target: number;
  /** Median, low and high of the date, epoch milliseconds (about an 80% range). */
  point: number;
  low: number;
  high: number;
  /** Chance the walk reaches the weight within MILESTONE_MODEL.maxWeeks. */
  reachChance: number;
  basis: ForecastBasis;
  inputs: Record<string, number | string | null>;
}

/**
 * The dates of a milestone from the walk's chance of each session being the first at
 * the weight. The weight is reached at a session, so the outcome is one of a few
 * dates about a gap apart, like a whole number of reps: the range is the run of
 * sessions whose chance is closest to CALIBRATION.targetCoverage (`repsRange`, the
 * same rule as for reps), reaching half a gap past its first and last session, or as
 * far as those sessions' dates can drift when that is further (rangeZ times the pace's
 * scatter times the square root of how many sessions ahead). The point is the middle
 * session (`typicalReps`). The chance left over after the horizon is a last bucket,
 * so a run never ends inside the walk when the walk may not get there.
 */
function milestoneDates(
  reached: number[],
  times: readonly number[],
  pace: LiftPace
): { point: number; low: number; high: number; rangeChance: number } {
  const leftOver = Math.max(0, 1 - reached.reduce((sum, p) => sum + p, 0));
  const pmf = [...reached, leftOver];
  const range = repsRange(pmf);
  const middle = Math.min(typicalReps(pmf), times.length - 1);
  const gapMs = pace.gapDays * DAY_MS;
  const reach = (i: number) =>
    Math.max(gapMs / 2, CALIBRATION.rangeZ * pace.gapSdDays * DAY_MS * Math.sqrt(i + 1));
  const first = Math.min(range.low, times.length - 1);
  const last = Math.min(range.high, times.length - 1);
  return {
    point: times[middle],
    low: times[first] - reach(first),
    high: times[last] + reach(last),
    rangeChance: range.chance,
  };
}

/**
 * When a T1 lift's working weight is first at or above its next round number
 * (`nextRoundWeight`): the program walked forward over the lift's sessions at its pace
 * for up to MILESTONE_MODEL.maxWeeks, the median date and about an 80% range, widened
 * by the milestone's own track-record factor. Null when the lift has no outlook or
 * the weight is reached within the horizon with less than minReachChance.
 *
 * @evidence forecast-milestone
 */
export function forecastMilestone(
  source: ForecastSource,
  exerciseId: string
): MilestoneForecast | null {
  const lift = liftOutlook(source, exerciseId);
  if (!lift || !source.settings) return null;
  const nowMs = source.now.getTime();
  const target = nextRoundWeight(lift.liftState.t1Weight);
  const first = nextSessionTimes(lift.pace, source.now, 1)[0];
  const horizon = nowMs + MILESTONE_MODEL.maxWeeks * WEEK_MS;
  const count = Math.max(2, Math.floor((horizon - first) / (lift.pace.gapDays * DAY_MS)) + 1);
  const times = nextSessionTimes(lift.pace, source.now, count);
  const walk = walkProgram({
    outlook: lift.outlook,
    liftState: lift.liftState,
    times,
    liftType: lift.liftType,
    equipment: source.settings.equipment,
    target,
  });
  const reachChance = walk.reached.reduce((sum, p) => sum + p, 0);
  if (!(reachChance >= MILESTONE_MODEL.minReachChance)) return null;

  const dates = milestoneDates(walk.reached, times, lift.pace);
  const scale = clamp(
    source.sdScale?.milestone ?? 1,
    CALIBRATION.sdScaleMin,
    CALIBRATION.sdScaleMax
  );
  const point = Math.max(nowMs, dates.point);
  const low = Math.max(nowMs, point - (point - dates.low) * scale);
  const high = Math.max(point, point + (dates.high - point) * scale);
  return {
    exerciseId,
    target,
    point,
    low,
    high,
    reachChance,
    basis: lift.outlook.basis,
    inputs: {
      ...commonInputs(lift, source),
      sdScale: scale,
      repsSdScale: lift.outlook.sdScale,
      target,
      reachChance,
      rangeChance: dates.rangeChance,
      sessionsWalked: count,
    },
  };
}
