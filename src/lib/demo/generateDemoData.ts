// A deterministic sample LOG for tests, screenshots and local development: workouts
// (with their sets), starting-weight adjustments (the demo lifter's, src/lib/demo/demoLifter.ts), runs, bodyweight, readiness and pain
// entries. Lift states and e1RM rows are not hand-built: they come from `rebuildDerived`
// on the log, so they are by construction what the app shows. Each session is created
// the way the live app creates one: the plan from the running lift states, the stored
// prescription, sets through `createSetLog`. Pure: no clock, no randomness, no database.
import { DEFAULT_USER_PROFILE, startAdjustments } from "@/db/seed";
import { DEMO_LIFT_STATES } from "./demoLifter";
import { roundToStep } from "@/lib/dbConversion";
import { E1RM_MAX_REPS } from "@/lib/e1rm";
import { rebuildDerived } from "@/lib/rebuild";
import { externalLoad, priorFor } from "@/lib/strength";
import { createSetLog } from "@/lib/workout/logSet";
import { planWorkoutStart } from "@/lib/workout/startPlan";
import { strengthSetsOf } from "@/lib/workout/strength";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { isPerHandExercise } from "@/lib/workout/variant";
import { WORKOUT_ROTATION, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  BodyweightLog,
  Estimated1RM,
  LiftAdjustment,
  LiftState,
  PainSorenessEntry,
  ReadinessLog,
  RepsInReserve,
  RunLog,
  SetLog,
  SleepHours,
  StressLevel,
  VariantState,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";

export interface DemoData {
  workouts: WorkoutSession[];
  /** The `start` adjustments: the starting weights of every lift. */
  liftAdjustments: LiftAdjustment[];
  bodyweight: BodyweightLog[];
  runs: RunLog[];
  readinessLogs: ReadinessLog[];
  painEntries: PainSorenessEntry[];
  /** Derived: `rebuildDerived` of the log above. */
  liftStates: LiftState[];
  /** Derived: `rebuildDerived` of the log above. */
  estimated1RMs: Estimated1RM[];
  /** Derived: the home exercises' states, `rebuildDerived` of the log above. */
  variantStates: VariantState[];
}

const WORKOUT_COUNT = 24;
/**
 * The workouts (0-based, inclusive) done at home: the first eight, about two and a half
 * weeks with every day of the rotation twice. Each home exercise starts at its starting
 * ratio to the lift (the split squat at 0.5 of the 190 squat, 50 a hand; later ones from
 * the strength estimate, H3) and progresses by its own passes. The barbell weights do
 * not move at home: the first gym session of each lift after the block takes its
 * re-entry weight (the squat 190 plus the two steps the split squat earned, 210; H6).
 */
export const DEMO_HOME_BLOCK = { first: 0, last: 7 } as const;
/** The workout (0-based) whose last T2 set is followed by one drop set, and the drop. */
export const DEMO_DROP_SET = { workout: 21, lighterBy: 0.2, reps: 7 } as const;
/** Days between consecutive workouts, cycled. */
const GAP_DAYS = [2, 3, 2];
const BODYWEIGHT_DAYS = 56;
const BODYWEIGHT_START = 232.5;
const BODYWEIGHT_END = 226;
/** Days (before `now`) with no weigh-in. */
const MISSED_WEIGH_INS = new Set([47, 38, 30, 19, 9]);

/**
 * The demo lifter's strength. Reps on the last set of a T1 lift are what this allows
 * at the weight on the bar, so they fall when the bar gets heavier faster than the
 * lifter gets stronger. (They used to be drawn at random whatever the weight, which
 * made the lifter's strength leap about and rise with any weight the program asked for.)
 *
 * The starting weights are light, as the program advises, and the lifter gains a
 * little slower than the bar does. The lifter stops a last set at E1RM_MAX_REPS reps,
 * because a longer set does not count toward the estimated max. With these numbers
 * and the days as drawn, every T1 lift passes for the whole demo (the generator's
 * tests check it).
 */
export const DEMO_LIFTER = {
  /** Reps the lifter can do on the last set at each lift's starting weight on an average day. */
  startReps: 9,
  /** Strength gained per week, as a fraction of the starting level. */
  weeklyGain: 0.02,
  /**
   * Day-to-day variation of strength: the standard deviation of a bell-shaped scatter,
   * as a fraction of the level. The middle of what retest studies of trained lifters report.
   */
  dailyVariation: 0.025,
} as const;

/**
 * Whole reps the demo lifter has on the last set at `weight`, `weeks` after the first
 * workout. Strength is a level in the app's own rep-max terms (weight x (1 + reps / 30),
 * see src/lib/e1rm.ts): it starts where `DEMO_LIFTER.startReps` reps at the lift's
 * starting weight puts it, grows a little every week, and is `swing` (a fraction)
 * above or below on the day. Never more than E1RM_MAX_REPS: the lifter stops there.
 */
export function demoRepsInHand(
  startWeight: number,
  weight: number,
  weeks: number,
  swing: number
): number {
  const startLevel = startWeight * (1 + DEMO_LIFTER.startReps / 30);
  const today = startLevel * (1 + DEMO_LIFTER.weeklyGain * weeks) * (1 + swing);
  return Math.min(E1RM_MAX_REPS, Math.max(0, Math.floor(30 * (today / weight - 1))));
}

/**
 * The barbell weight a planned entry is as hard as for the demo lifter: the weight itself
 * for the lift, and for a home exercise its total load divided by the exercise's
 * starting ratio to the lift (the strength model's own assumption, so the demo's home
 * sets say what the model expects them to). A home exercise with no ratio stands for the
 * barbell weight the program asked for.
 */
export function demoBarbellEquivalent(
  entry: Pick<WorkoutExerciseState, "exerciseId" | "substituteExerciseId" | "weight" | "originalWeight">
): number {
  const performed = entry.substituteExerciseId;
  if (!performed) return entry.weight;
  const ratio = priorFor(entry.exerciseId, performed)?.ratio;
  if (!ratio) return entry.originalWeight ?? entry.weight;
  return externalLoad({ exerciseId: performed, weight: entry.weight, perHand: isPerHandExercise(performed) }) / ratio;
}

const SLEEP_CYCLE: SleepHours[] = ["7+", "7+", "5-7", "7+", "5-7", "7+", "<5"];
const STRESS_CYCLE: StressLevel[] = ["normal", "good", "normal", "low", "good"];

const RUNS: Array<
  Pick<RunLog, "durationMinutes" | "distanceMiles" | "type" | "category" | "notes" | "perceivedEffort"> & {
    daysAgo: number;
  }
> = [
  { daysAgo: 50, durationMinutes: 28, distanceMiles: 2.6, type: "outdoor", category: "easy", notes: "", perceivedEffort: 2 },
  { daysAgo: 41, durationMinutes: 24, distanceMiles: 2.5, type: "outdoor", category: "tempo", notes: "Felt strong", perceivedEffort: 4 },
  { daysAgo: 33, durationMinutes: 20, distanceMiles: null, type: "treadmill", category: "intervals", notes: "6 x 1 min hard", perceivedEffort: 5 },
  { daysAgo: 24, durationMinutes: 52, distanceMiles: 4.8, type: "trail", category: "long", notes: "", perceivedEffort: 3 },
  { daysAgo: 15, durationMinutes: 30, distanceMiles: 3.0, type: "outdoor", category: "easy", notes: "", perceivedEffort: 2 },
  { daysAgo: 6, durationMinutes: 26, distanceMiles: 2.9, type: "treadmill", category: "tempo", notes: "", perceivedEffort: 4 },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** A repeatable pseudo-random number in [0, 1) for an integer seed (mulberry32 step). */
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A repeatable draw from a standard bell curve for an integer seed (Box-Muller). */
function bellDraw(seed: number): number {
  const u = Math.max(rand(seed), 1e-12);
  const v = rand(seed + 104729);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Local wall-clock time `daysAgo` calendar days before `now`. */
function at(now: Date, daysAgo: number, hours: number, minutes = 0): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hours, minutes, 0, 0);
}

const stamp = (date: Date) => ({ updatedAt: date.getTime(), deletedAt: null });

/**
 * About eight weeks of plausible training ending at `now`: workouts rotating
 * A1/B1/A2/B2 every two to three days with steady progression (last-set reps start
 * high and fall as the weights climb, see `DEMO_LIFTER`) and an occasional failed T2,
 * a block of home sessions first (`DEMO_HOME_BLOCK`), one drop set (`DEMO_DROP_SET`),
 * near-daily morning weigh-ins trending down
 * about 1 lb a week, six runs, readiness logs for most workouts and one recent
 * soreness entry. The same `now` always produces the same data (ids included), so
 * tests and screenshots are stable.
 */
export function generateDemoData(now: Date): DemoData {
  const settings = DEFAULT_USER_PROFILE.settings;
  const equipment = settings.equipment;
  // The demo lifter's own starting weights, not a new account's empty-bar defaults.
  const liftAdjustments = startAdjustments(DEMO_LIFT_STATES);

  // Day offsets, oldest workout first; the last one is yesterday.
  const daysAgo: number[] = new Array(WORKOUT_COUNT);
  daysAgo[WORKOUT_COUNT - 1] = 1;
  for (let i = WORKOUT_COUNT - 2; i >= 0; i--) {
    daysAgo[i] = daysAgo[i + 1] + GAP_DAYS[i % GAP_DAYS.length];
  }

  const workouts: WorkoutSession[] = [];
  const readinessLogs: ReadinessLog[] = [];
  /** The barbell weight each T1 lift was first prescribed at. */
  const startWeights = new Map<string, number>();

  for (let i = 0; i < WORKOUT_COUNT; i++) {
    const workoutId = `demo-workout-${pad(i + 1)}`;
    const template = WORKOUT_TEMPLATES[WORKOUT_ROTATION[i % WORKOUT_ROTATION.length]];
    const location: WorkoutLocation =
      i >= DEMO_HOME_BLOCK.first && i <= DEMO_HOME_BLOCK.last ? "home" : "gym";
    const failT2 = i % 6 === 4;
    const startedAt = at(now, daysAgo[i], 17, 30);

    // What the app would show when this session starts (`planWorkoutStart`, as the
    // Ready screen plans): at home each lift is planned from its home exercise's own
    // state, a first one seeded from the strength estimate of the sets so far (H3); the
    // first session back at the gym takes its re-entry weight (H6). That prescription is
    // stored too.
    const { liftStates, variantStates } = rebuildDerived({
      workouts,
      adjustments: liftAdjustments,
      settings,
    });
    const { plan, prescribed } = planWorkoutStart({
      template,
      liftStates,
      location,
      equipment,
      includeWarmUps: true,
      selectedAccessories: [],
      variantStates,
      strengthSets: strengthSetsOf(workouts),
    });

    const sessionSets: SetLog[] = [];
    let clock = startedAt.getTime();

    for (const entry of plan) {
      for (let s = 1; s <= entry.targetSets; s++) {
        const isLast = s === entry.targetSets;
        let actualReps = entry.targetReps;
        let repsInReserve: RepsInReserve | null = null;

        if (entry.tier === "T1") {
          if (entry.isAMRAP && isLast) {
            // The lifter's level is set by the barbell weight the program first asked for;
            // at home it meets what is on the dumbbells (`demoBarbellEquivalent`).
            const programWeight = entry.originalWeight ?? entry.weight;
            if (!startWeights.has(entry.exerciseId)) startWeights.set(entry.exerciseId, programWeight);
            actualReps = demoRepsInHand(
              startWeights.get(entry.exerciseId)!,
              demoBarbellEquivalent(entry),
              (daysAgo[0] - daysAgo[i]) / 7,
              bellDraw(i * 31 + 7) * DEMO_LIFTER.dailyVariation
            );
            repsInReserve = "1-2";
          } else {
            repsInReserve = s <= 2 ? "3+" : "1-2";
          }
        } else if (entry.tier === "T2") {
          repsInReserve = s <= 2 && !failT2 ? "3+" : "1-2"; // easy early sets; all hard on a bad day
          if (failT2 && isLast) {
            actualReps = entry.targetReps - 3;
            repsInReserve = "0";
          }
        } else if (entry.tier === "T3" && entry.isAMRAP && isLast) {
          actualReps = 18 + Math.floor(rand(i * 17 + 3) * 9); // 18 to 26
        }

        clock += (entry.tier === "T1" ? 3 : entry.tier === "T2" ? 2.5 : entry.isWarmUp ? 2 : 1.5) * 60_000;
        const id = `${workoutId}-set-${pad(sessionSets.length + 1)}`;
        sessionSets.push(
          createSetLog({
            exercise: { ...entry, completedSets: s - 1 },
            actualReps,
            repsInReserve,
            location,
            autoRegulated: false,
            now: new Date(clock),
            id,
            clientId: `c-${id}`,
          })
        );

        // One drop set straight after the last T2 set: lighter, no rest, a few reps
        // short of the target. It is extra volume and does not decide the pass.
        if (i === DEMO_DROP_SET.workout && entry.tier === "T2" && isLast) {
          clock += 30_000;
          const dropId = `${workoutId}-set-${pad(sessionSets.length + 1)}`;
          sessionSets.push({
            ...createSetLog({
              exercise: {
                ...entry,
                weight: roundToStep(entry.weight * (1 - DEMO_DROP_SET.lighterBy), equipment.gymBarbellIncrementLbs),
                completedSets: s,
              },
              actualReps: DEMO_DROP_SET.reps,
              repsInReserve: "1-2",
              location,
              autoRegulated: false,
              now: new Date(clock),
              id: dropId,
              clientId: `c-${dropId}`,
            }),
            role: "drop",
            dropOf: id,
          });
        }
      }
    }

    const completedAt = new Date(clock + 60_000);
    workouts.push({
      id: workoutId,
      clientId: `c-${workoutId}`,
      templateId: template.id,
      location,
      startedAt,
      completedAt,
      totalDurationSeconds: Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
      includeWarmUps: true,
      selectedAccessories: [],
      sets: sessionSets,
      preWorkoutPainEntries: [],
      modifications: [],
      prescribed,
      completionContext: {
        phaseMode: settings.trainingPhase.mode,
        gymBarbellIncrementLbs: equipment.gymBarbellIncrementLbs,
        dumbbellIncrementLbs: equipment.dumbbellIncrementLbs,
        maxDumbbellWeight: equipment.maxDumbbellWeight,
      },
      ...stamp(completedAt),
      synced: false,
    });

    if (i % 6 !== 5) {
      const id = `demo-readiness-${pad(i + 1)}`;
      readinessLogs.push({
        id,
        clientId: `c-${id}`,
        sessionId: workoutId,
        sleepHours: SLEEP_CYCLE[i % SLEEP_CYCLE.length],
        stressLevel: STRESS_CYCLE[i % STRESS_CYCLE.length],
        date: startedAt,
        ...stamp(startedAt),
        synced: false,
      });
    }
  }

  const derived = rebuildDerived({ workouts, adjustments: liftAdjustments, settings });

  const notFuture = <T extends { date: Date }>(row: T) => row.date.getTime() <= now.getTime();

  const bodyweight: BodyweightLog[] = [];
  for (let k = BODYWEIGHT_DAYS - 1; k >= 0; k--) {
    if (MISSED_WEIGH_INS.has(k)) continue;
    const progress = (BODYWEIGHT_DAYS - 1 - k) / (BODYWEIGHT_DAYS - 1);
    const trend = BODYWEIGHT_START + (BODYWEIGHT_END - BODYWEIGHT_START) * progress;
    const noise = (rand(k * 13 + 1) - 0.5) * 1.2;
    const id = `demo-bodyweight-${pad(BODYWEIGHT_DAYS - k)}`;
    bodyweight.push({
      id,
      clientId: `c-${id}`,
      date: at(now, k, 7, (k % 4) * 5),
      weight: Math.round((trend + noise) * 10) / 10,
      timeOfDay: "morning",
      ...stamp(at(now, k, 7, (k % 4) * 5)),
      synced: false,
    });
  }

  const runs: RunLog[] = RUNS.map(({ daysAgo: runDaysAgo, ...run }, r) => {
    const id = `demo-run-${pad(r + 1)}`;
    return { id, clientId: `c-${id}`, date: at(now, runDaysAgo, 7, 30), ...run, ...stamp(at(now, runDaysAgo, 7, 30)), synced: false };
  });

  const painEntries: PainSorenessEntry[] = [
    {
      id: "demo-pain-01",
      clientId: "c-demo-pain-01",
      date: at(now, 2, now.getHours(), now.getMinutes()),
      region: "left_quad",
      sensation: "soreness",
      severity: 2,
      notes: "Tight after squats",
      ...stamp(at(now, 2, now.getHours(), now.getMinutes())),
      synced: false,
    },
  ];

  return {
    workouts,
    liftAdjustments,
    bodyweight: bodyweight.filter(notFuture),
    runs: runs.filter(notFuture),
    readinessLogs,
    painEntries,
    liftStates: derived.liftStates,
    estimated1RMs: derived.e1rms,
    variantStates: derived.variantStates,
  };
}
