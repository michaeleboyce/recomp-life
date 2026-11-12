// A deterministic sample dataset for tests, screenshots and local development.
// Pure: no clock, no randomness, no database. Everything derives from `now`.
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { barbellToDumbbell } from "@/lib/dbConversion";
import { calculateE1RM, isE1RMEligibleSet, toRecentE1RMSeries } from "@/lib/e1rm";
import { EXERCISES } from "@/lib/exercises";
import {
  evaluateT1Progression,
  evaluateT2Progression,
  evaluateT3Progression,
} from "@/lib/progression";
import { generateWarmUpSets } from "@/lib/warmups";
import { WORKOUT_ROTATION, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  BodyweightLog,
  Estimated1RM,
  LiftState,
  PainSorenessEntry,
  ReadinessLog,
  RunLog,
  SetLog,
  SleepHours,
  StressLevel,
  Tier,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";

export interface DemoData {
  workouts: WorkoutSession[];
  sets: SetLog[];
  estimated1RMs: Estimated1RM[];
  bodyweight: BodyweightLog[];
  runs: RunLog[];
  readinessLogs: ReadinessLog[];
  painEntries: PainSorenessEntry[];
  /** The seeded lift states advanced to match the generated history. */
  liftStates: LiftState[];
}

const WORKOUT_COUNT = 24;
/** Days between consecutive workouts, cycled. */
const GAP_DAYS = [2, 3, 2];
const BODYWEIGHT_DAYS = 56;
const BODYWEIGHT_START = 232.5;
const BODYWEIGHT_END = 226;
/** Days (before `now`) with no weigh-in. */
const MISSED_WEIGH_INS = new Set([47, 38, 30, 19, 9]);
const LOWER_BODY = new Set(["squat", "deadlift"]);

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

/** Local wall-clock time `daysAgo` calendar days before `now`. */
function at(now: Date, daysAgo: number, hours: number, minutes = 0): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hours, minutes, 0, 0);
}

function stageShape(stage: string): { sets: number; reps: number } {
  const [sets, reps] = stage.split("x").map(Number);
  return { sets, reps };
}

/**
 * About eight weeks of plausible training ending at `now`: workouts rotating
 * A1/B1/A2/B2 every two to three days with steady progression and an occasional
 * failed T2, one home session in five, e1RM rows for each T1 AMRAP set, near-daily
 * morning weigh-ins trending down about 1 lb a week, six runs, readiness logs for
 * most workouts and one recent soreness entry. The same `now` always produces the
 * same data (ids included), so tests and screenshots are stable.
 */
export function generateDemoData(now: Date): DemoData {
  const settings = DEFAULT_USER_PROFILE.settings;
  const equipment = settings.equipment;

  const states: Record<string, LiftState> = {};
  for (const [id, state] of Object.entries(INITIAL_LIFT_STATES)) {
    states[id] = {
      ...state,
      clientId: `demo-lift-${id}`,
      recentE1RMs: [],
      recentAvgRPEs: [],
      recentAMRAPReps: [],
    };
  }

  // Day offsets, oldest workout first; the last one is yesterday.
  const daysAgo: number[] = new Array(WORKOUT_COUNT);
  daysAgo[WORKOUT_COUNT - 1] = 1;
  for (let i = WORKOUT_COUNT - 2; i >= 0; i--) {
    daysAgo[i] = daysAgo[i + 1] + GAP_DAYS[i % GAP_DAYS.length];
  }

  const workouts: WorkoutSession[] = [];
  const sets: SetLog[] = [];
  const estimated1RMs: Estimated1RM[] = [];
  const readinessLogs: ReadinessLog[] = [];

  for (let i = 0; i < WORKOUT_COUNT; i++) {
    const workoutId = `demo-workout-${pad(i + 1)}`;
    const template = WORKOUT_TEMPLATES[WORKOUT_ROTATION[i % WORKOUT_ROTATION.length]];
    const location: WorkoutLocation = i % 5 === 3 ? "home" : "gym";
    const failT2 = i % 6 === 4;
    const startedAt = at(now, daysAgo[i], 17, 30);
    const sessionSets: SetLog[] = [];
    let clock = startedAt.getTime();

    const pushSet = (
      minutesLater: number,
      fields: Pick<SetLog, "exerciseId" | "tier" | "setNumber" | "targetReps" | "actualReps" | "weight" | "isAMRAP"> &
        Partial<SetLog>
    ): SetLog => {
      clock += minutesLater * 60_000;
      const id = `${workoutId}-set-${pad(sessionSets.length + 1)}`;
      const set: SetLog = {
        id,
        clientId: `c-${id}`,
        completedAt: new Date(clock),
        restAfterSeconds: 0,
        status: fields.actualReps >= fields.targetReps ? "completed" : "failed",
        isSubstituted: false,
        location,
        synced: false,
        ...fields,
      };
      sessionSets.push(set);
      return set;
    };

    for (const entry of template.exercises) {
      const state = states[entry.exerciseId];
      const tier: Tier = entry.tier;
      const barbellWeight =
        tier === "T1" ? state.t1Weight : tier === "T2" ? state.t2Weight : state.t3Weight;

      // At home the dumbbell alternative is performed; the barbell weight is kept
      // as `originalWeight`.
      const alternative = location === "home" ? EXERCISES[entry.exerciseId]?.dumbbellAlternative : undefined;
      const substitution: Partial<SetLog> = alternative
        ? { isSubstituted: true, substituteExerciseId: alternative, originalWeight: barbellWeight }
        : {};
      const weight = alternative
        ? tier === "T3"
          ? states[alternative]?.t3Weight || barbellToDumbbell(barbellWeight)
          : Math.min(barbellToDumbbell(barbellWeight), equipment.maxDumbbellWeight)
        : barbellWeight;

      const shape =
        tier === "T1"
          ? stageShape(state.t1Stage)
          : tier === "T2"
            ? stageShape(state.t2Stage)
            : { sets: entry.sets, reps: entry.reps };
      const logged: SetLog[] = [];

      if (tier === "T1") {
        generateWarmUpSets(weight, location, equipment).forEach((warmUp, w) => {
          pushSet(2, {
            exerciseId: entry.exerciseId,
            tier: "warmup",
            setNumber: w + 1,
            targetReps: warmUp.reps,
            actualReps: warmUp.reps,
            weight: warmUp.weight,
            isAMRAP: false,
            ...substitution,
          });
        });
      }

      for (let s = 1; s <= shape.sets; s++) {
        const isLast = s === shape.sets;
        const isAMRAP = entry.isAMRAP && isLast;
        let actualReps = shape.reps;
        let rpe: number | undefined;

        if (tier === "T1") {
          if (isAMRAP) {
            actualReps = 3 + Math.floor(rand(i * 31 + 7) * 4); // 3 to 6
            rpe = actualReps <= 4 ? 9.5 : 9;
          } else {
            rpe = s <= 2 ? 7.5 : 8;
          }
        } else if (tier === "T2") {
          rpe = 6.5 + s * 0.5 + (failT2 ? 1 : 0); // 7, 7.5, 8 (8, 8.5, 9 on a bad day)
          if (failT2 && isLast) {
            actualReps = shape.reps - 3;
            rpe = 10;
          }
        } else if (isAMRAP) {
          actualReps = 18 + Math.floor(rand(i * 17 + 3) * 9); // 18 to 26
        }

        logged.push(
          pushSet(tier === "T1" ? 3 : tier === "T2" ? 2.5 : 1.5, {
            exerciseId: entry.exerciseId,
            tier,
            setNumber: s,
            targetReps: shape.reps,
            actualReps,
            weight,
            isAMRAP,
            ...(rpe !== undefined ? { rpe } : {}),
            ...substitution,
          })
        );
      }

      // e1RM rows, as the workout screen stores them. A substituted set is recorded
      // at its barbell equivalent so the lift's history stays on one scale.
      for (const set of logged) {
        if (!isE1RMEligibleSet(set.tier, set.isAMRAP, set.actualReps)) continue;
        const e1rmWeight = set.originalWeight ?? set.weight;
        const value = calculateE1RM(e1rmWeight, set.actualReps, set.rpe);
        if (value === null) continue;
        const id = `${workoutId}-e1rm-${set.exerciseId}`;
        estimated1RMs.push({
          id,
          clientId: `c-${id}`,
          date: set.completedAt,
          exerciseId: set.exerciseId,
          workingWeight: e1rmWeight,
          repsCompleted: set.actualReps,
          estimated1RM: value,
          workoutSessionId: workoutId,
          synced: false,
        });
      }

      // Advance the lift state the way finishing a workout does.
      const liftType = LOWER_BODY.has(entry.exerciseId) ? "lower" : "upper";
      const rpes = logged.flatMap((s) => (s.rpe != null ? [s.rpe] : []));
      const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
      let next = state;
      if (tier === "T1") {
        next = evaluateT1Progression(state, logged, location, equipment, liftType);
        const amrap = logged.find((s) => s.isAMRAP);
        if (amrap) next.recentAMRAPReps = [...state.recentAMRAPReps, amrap.actualReps].slice(-5);
      } else if (tier === "T2") {
        next = evaluateT2Progression(state, logged, location, equipment, liftType);
      } else if (!alternative) {
        const total = logged.reduce((sum, s) => sum + s.actualReps, 0);
        const amrapReps = logged[logged.length - 1].actualReps;
        const result = evaluateT3Progression(total, amrapReps, state.t3Weight, settings.trainingPhase);
        next = { ...state, t3Weight: result.newWeight };
      } else {
        next = { ...state };
      }
      if (avgRpe !== null && tier !== "T3") {
        next.recentAvgRPEs = [...state.recentAvgRPEs, avgRpe].slice(-5);
      }
      states[entry.exerciseId] = next;
    }

    const completedAt = new Date(clock + 60_000);
    for (const entry of template.exercises) {
      if (entry.tier === "T1") states[entry.exerciseId].t1LastWorkoutDate = completedAt;
      if (entry.tier === "T2") states[entry.exerciseId].t2LastWorkoutDate = completedAt;
    }

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
      synced: false,
    });
    sets.push(...sessionSets);

    if (i % 6 !== 5) {
      const id = `demo-readiness-${pad(i + 1)}`;
      readinessLogs.push({
        id,
        clientId: `c-${id}`,
        sessionId: workoutId,
        sleepHours: SLEEP_CYCLE[i % SLEEP_CYCLE.length],
        stressLevel: STRESS_CYCLE[i % STRESS_CYCLE.length],
        date: startedAt,
        synced: false,
      });
    }
  }

  const liftStates = Object.values(states).map((state) => ({
    ...state,
    recentE1RMs: toRecentE1RMSeries(
      estimated1RMs.filter((e) => e.exerciseId === state.exerciseId)
    ),
  }));

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
      synced: false,
    });
  }

  const runs: RunLog[] = RUNS.map(({ daysAgo: runDaysAgo, ...run }, r) => {
    const id = `demo-run-${pad(r + 1)}`;
    return { id, clientId: `c-${id}`, date: at(now, runDaysAgo, 7, 30), ...run, synced: false };
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
      synced: false,
    },
  ];

  return {
    workouts,
    sets,
    estimated1RMs,
    bodyweight: bodyweight.filter(notFuture),
    runs: runs.filter(notFuture),
    readinessLogs,
    painEntries,
    liftStates,
  };
}
