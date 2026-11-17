// MADE-UP planning cases for tests only (not used by app code): every session start of
// the demo log, at the gym and at home, plain and with made-up imported sessions,
// hand-set home and barbell weights, next-session set plans, a Configure substitute and
// Edit-workout edits. The same cases as planningPaths.characterisation.test.ts.
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import type { LedgerRecords } from "@/lib/data/forecasts";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { rebuildDerived } from "@/lib/rebuild";
import type {
  ImportedSessionRecord,
  LiftAdjustment,
  NextSetPlan,
  PlanEdit,
  UserSettings,
  WorkoutLocation,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";

export const CASES_NOW = new Date(2026, 10, 14, 12, 0, 0);
const DAY = 86_400_000;

const demo = generateDemoData(CASES_NOW);
export const DEMO_WORKOUTS: WorkoutSession[] = [...demo.workouts].sort(
  (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
);
const firstStart = new Date(DEMO_WORKOUTS[0].startedAt).getTime();
const daysBefore = (days: number) => new Date(firstStart - days * DAY);
const between = (i: number) =>
  new Date(
    (new Date(DEMO_WORKOUTS[i].completedAt!).getTime() + new Date(DEMO_WORKOUTS[i + 1].startedAt).getTime()) / 2
  );

function imp(id: string, exerciseId: string, at: Date, weight: number, reps: number): ImportedSessionRecord {
  const sets = [0, 1, 2].map((i) =>
    importedSet({
      id: `${id}-set-${i}`,
      exerciseName: exerciseId,
      mappedExerciseId: exerciseId,
      setOrder: i + 1,
      weightPerImplementLb: weight,
      reps: i === 2 ? reps - 1 : reps,
    })
  );
  return importedSession(sets, { id, clientId: id, startedAt: at });
}

const IMPORTED: ImportedSessionRecord[] = [
  ...[95, 85, 75].flatMap((d) => [
    imp(`imp-squat-${d}`, "squat", daysBefore(d), 205, 5),
    imp(`imp-bench-${d}`, "bench", daysBefore(d + 1), 165, 5),
    imp(`imp-deadlift-${d}`, "deadlift", daysBefore(d + 2), 255, 5),
    imp(`imp-ohp-${d}`, "ohp", daysBefore(d + 3), 105, 5),
  ]),
  ...[20, 13, 6].flatMap((d) => [
    imp(`imp-bss-${d}`, "bulgarian_split_squat", daysBefore(d), 45, 8),
    imp(`imp-dbbench-${d}`, "db_bench", daysBefore(d + 1), 55, 10),
    imp(`imp-dbrdl-${d}`, "db_rdl", daysBefore(d + 2), 60, 10),
    imp(`imp-dbsp-${d}`, "db_shoulder_press", daysBefore(d + 3), 40, 10),
  ]),
];

function adjustment(
  id: string,
  at: Date,
  rest: Partial<LiftAdjustment> & Pick<LiftAdjustment, "exerciseId" | "set">
): LiftAdjustment {
  return { id, clientId: id, at, source: "manual", synced: true, updatedAt: at.getTime(), deletedAt: null, ...rest };
}

const HAND_SET: LiftAdjustment[] = [
  adjustment("hand-bss", between(2), {
    exerciseId: "squat",
    set: { t1Weight: 60 },
    variant: { exerciseId: "bulgarian_split_squat", tier: "T1" },
  }),
  adjustment("hand-bench", between(11), { exerciseId: "bench", set: { t2Weight: 120 } }),
  adjustment("hand-dbbench", between(17), {
    exerciseId: "bench",
    set: { t1Weight: 60 },
    variant: { exerciseId: "db_bench", tier: "T1" },
  }),
];

function setPlan(exerciseId: string, liftId: string, tier: "T1" | "T2" | "T3", sets: NextSetPlan["sets"]): NextSetPlan {
  return { exerciseId, liftId, tier, sets, planSets: [], createdAt: "2026-01-01T00:00:00.000Z" };
}

const SET_PLANS: Record<string, NextSetPlan> = {
  "squat|T1": setPlan("squat", "squat", "T1", [
    { weight: 135, reps: 5, role: "ramp" },
    { weight: 185, reps: 3 },
    { weight: 185, reps: 3 },
    { weight: 185, reps: 3 },
  ]),
  "deadlift|T2": setPlan("deadlift", "deadlift", "T2", [
    { weight: 185, reps: 10 },
    { weight: 185, reps: 10 },
    { weight: 165, reps: 12, role: "backoff" },
  ]),
  "db_bench|T2": setPlan("db_bench", "bench", "T2", [
    { weight: 40, reps: 10 },
    { weight: 45, reps: 10 },
    { weight: 45, reps: 10 },
  ]),
  "db_shoulder_press|T1": setPlan("db_shoulder_press", "ohp", "T1", [
    { weight: 30, reps: 4 },
    { weight: 30, reps: 4 },
  ]),
};

function editsFor(template: WorkoutTemplate): PlanEdit[] {
  const of = (tier: string) => template.exercises.find((ex) => ex.tier === tier)!;
  return [
    { kind: "weight", exerciseId: of("T1").exerciseId, tier: "T1", weight: 95 },
    { kind: "scheme", exerciseId: of("T2").exerciseId, tier: "T2", sets: 4, reps: 8 },
    { kind: "swap", exerciseId: of("T3").exerciseId, tier: "T3", replacementId: "face_pulls" },
    { kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 12, weight: 25, isAMRAP: false },
  ];
}

interface Scenario {
  name: string;
  imported: ImportedSessionRecord[];
  adjustments: LiftAdjustment[];
  nextSetPlans?: Record<string, NextSetPlan>;
  edits: (template: WorkoutTemplate) => PlanEdit[];
  overrides?: Record<string, string>;
}

const SCENARIOS: Scenario[] = [
  { name: "plain", imported: [], adjustments: [], edits: () => [] },
  {
    name: "imported, hand-set, set plans, edits",
    imported: IMPORTED,
    adjustments: HAND_SET,
    nextSetPlans: SET_PLANS,
    edits: editsFor,
    overrides: { deadlift: "single_leg_db_rdl" },
  },
];

export interface PlanningCase {
  name: string;
  /** Index of the demo workout about to start. */
  index: number;
  location: WorkoutLocation;
  /** The ledger records as they stood before it started (settings with the set plans). */
  records: LedgerRecords;
  settings: UserSettings;
  /** The Edit-workout edits for a given day. */
  editsFor: (template: WorkoutTemplate) => PlanEdit[];
  /** The Configure substitutes (home only). */
  overrides?: Record<string, string>;
}

/** Every case: each scenario, each location, each session start of the demo log. */
export function planningCases(): PlanningCase[] {
  const out: PlanningCase[] = [];
  for (const scenario of SCENARIOS) {
    for (const location of ["gym", "home"] as const) {
      DEMO_WORKOUTS.forEach((workout, index) => {
        const done = DEMO_WORKOUTS.slice(0, index);
        const startedAt = new Date(workout.startedAt);
        const adjustments = [
          ...demo.liftAdjustments,
          ...scenario.adjustments.filter((a) => a.at.getTime() <= startedAt.getTime()),
        ];
        const settings: UserSettings = {
          ...DEFAULT_USER_PROFILE.settings,
          showWarmUps: true,
          ...(scenario.nextSetPlans ? { nextSetPlans: scenario.nextSetPlans } : {}),
        };
        const { liftStates, variantStates } = rebuildDerived({ workouts: done, adjustments, settings });
        out.push({
          name: `${scenario.name} @ ${location} before ${workout.id}`,
          index,
          location,
          settings,
          editsFor: scenario.edits,
          ...(location === "home" && scenario.overrides ? { overrides: scenario.overrides } : {}),
          records: {
            readAt: startedAt,
            workouts: done,
            bodyweight: [],
            liftStates,
            liftAdjustments: adjustments,
            forecasts: [],
            readinessLogs: [],
            runs: [],
            activities: [],
            painEntries: [],
            variantStates,
            importedSessions: scenario.imported.filter((s) => s.startedAt.getTime() < startedAt.getTime()),
            mappingOverrides: {},
            settings,
          },
        });
      });
    }
  }
  return out;
}
