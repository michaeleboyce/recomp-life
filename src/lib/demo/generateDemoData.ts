// A deterministic sample LOG for tests, screenshots and local development: workouts
// (with their sets), starting-weight adjustments, runs, bodyweight, readiness and pain
// entries. Lift states and e1RM rows are not hand-built: they come from `rebuildDerived`
// on the log, so they are by construction what the app shows. Each session is created
// the way the live app creates one: the plan from the running lift states, the stored
// prescription, sets through `createSetLog`. Pure: no clock, no randomness, no database.
import { DEFAULT_USER_PROFILE, startAdjustments } from "@/db/seed";
import { rebuildDerived } from "@/lib/rebuild";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { createSetLog } from "@/lib/workout/logSet";
import { getPrescription } from "@/lib/workout/prescription";
import { WORKOUT_ROTATION, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  BodyweightLog,
  Estimated1RM,
  LiftAdjustment,
  LiftState,
  PainSorenessEntry,
  PrescribedEntry,
  ReadinessLog,
  RunLog,
  SetLog,
  SleepHours,
  StressLevel,
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
}

/** Same as `prescribedFor` in src/lib/data/workouts.ts, which cannot be imported without the database. */
function prescribedFor(templateId: string, liftStates: LiftState[]): PrescribedEntry[] {
  const entries: PrescribedEntry[] = [];
  for (const exercise of WORKOUT_TEMPLATES[templateId]?.exercises ?? []) {
    if (exercise.tier !== "T1" && exercise.tier !== "T2" && exercise.tier !== "T3") continue;
    const state = liftStates.find((ls) => ls.exerciseId === exercise.exerciseId);
    const entry: PrescribedEntry = {
      exerciseId: exercise.exerciseId,
      tier: exercise.tier,
      ...getPrescription(exercise, state),
    };
    if (state && exercise.tier === "T1") entry.stage = state.t1Stage;
    if (state && exercise.tier === "T2") entry.stage = state.t2Stage;
    entries.push(entry);
  }
  return entries;
}

const WORKOUT_COUNT = 24;
/** Days between consecutive workouts, cycled. */
const GAP_DAYS = [2, 3, 2];
const BODYWEIGHT_DAYS = 56;
const BODYWEIGHT_START = 232.5;
const BODYWEIGHT_END = 226;
/** Days (before `now`) with no weigh-in. */
const MISSED_WEIGH_INS = new Set([47, 38, 30, 19, 9]);

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

const stamp = (date: Date) => ({ updatedAt: date.getTime(), deletedAt: null });

/**
 * About eight weeks of plausible training ending at `now`: workouts rotating
 * A1/B1/A2/B2 every two to three days with steady progression and an occasional
 * failed T2, one home session in five, near-daily morning weigh-ins trending down
 * about 1 lb a week, six runs, readiness logs for most workouts and one recent
 * soreness entry. The same `now` always produces the same data (ids included), so
 * tests and screenshots are stable.
 */
export function generateDemoData(now: Date): DemoData {
  const settings = DEFAULT_USER_PROFILE.settings;
  const equipment = settings.equipment;
  const liftAdjustments = startAdjustments();

  // Day offsets, oldest workout first; the last one is yesterday.
  const daysAgo: number[] = new Array(WORKOUT_COUNT);
  daysAgo[WORKOUT_COUNT - 1] = 1;
  for (let i = WORKOUT_COUNT - 2; i >= 0; i--) {
    daysAgo[i] = daysAgo[i + 1] + GAP_DAYS[i % GAP_DAYS.length];
  }

  const workouts: WorkoutSession[] = [];
  const readinessLogs: ReadinessLog[] = [];

  for (let i = 0; i < WORKOUT_COUNT; i++) {
    const workoutId = `demo-workout-${pad(i + 1)}`;
    const template = WORKOUT_TEMPLATES[WORKOUT_ROTATION[i % WORKOUT_ROTATION.length]];
    const location: WorkoutLocation = i % 5 === 3 ? "home" : "gym";
    const failT2 = i % 6 === 4;
    const startedAt = at(now, daysAgo[i], 17, 30);

    // What the app would show when this session starts.
    const liftStates = rebuildDerived({ workouts, adjustments: liftAdjustments, settings }).liftStates;
    const prescribed = prescribedFor(template.id, liftStates);
    const plan = buildWorkoutPlan({
      template,
      liftStates,
      location,
      equipment,
      includeWarmUps: true,
      selectedAccessories: [],
    });

    const sessionSets: SetLog[] = [];
    let clock = startedAt.getTime();

    for (const entry of plan) {
      for (let s = 1; s <= entry.targetSets; s++) {
        const isLast = s === entry.targetSets;
        let actualReps = entry.targetReps;
        let rpe: number | null = null;

        if (entry.tier === "T1") {
          if (entry.isAMRAP && isLast) {
            actualReps = entry.targetReps + Math.floor(rand(i * 31 + 7) * 4); // 3 to 6 at 5x3
            rpe = actualReps <= 4 ? 9.5 : 9;
          } else {
            rpe = s <= 2 ? 7.5 : 8;
          }
        } else if (entry.tier === "T2") {
          rpe = 6.5 + s * 0.5 + (failT2 ? 1 : 0); // 7, 7.5, 8 (8, 8.5, 9 on a bad day)
          if (failT2 && isLast) {
            actualReps = entry.targetReps - 3;
            rpe = 10;
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
            rpe,
            location,
            autoRegulated: false,
            now: new Date(clock),
            id,
            clientId: `c-${id}`,
          })
        );
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
  };
}
