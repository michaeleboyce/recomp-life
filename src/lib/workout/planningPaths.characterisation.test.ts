// Characterisation of every planning path, pinned before the planning-path refactor
// (R1, R2, F3 in docs/plans/2026-11-17-imported-history-and-planning-paths.md). For
// every session start of the demo log, at the gym and at home, plain and with made-up
// imported sessions, hand-set home and barbell weights, next-session set plans, a home
// substitute picked on Configure and Edit-workout edits, it records what each path plans:
// the start (`planWorkoutStart`: plan, prescription with `.home`, `nextSetPlanEdits`),
// Today's forecast plan (`nextWorkoutFrom`), the next workout as Today's rows plan it
// (`describeNextWorkout` with the hooks' inputs), the coming workouts
// (`projectUpcomingWorkouts`) and the resumed session (`planForSession`).
//
// A difference means a planning number moved. The refactor must not move any. If the
// first home weights are changed on purpose (F6, seeding from the exercise's own
// history), regenerate the file at that change, not in the refactor:
//   npx vitest run src/lib/workout/planningPaths.characterisation.test.ts -u
// Made-up data only.
import "fake-indexeddb/auto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { nextWorkoutFrom, strengthSetsFrom, type LedgerRecords } from "@/lib/data/forecasts";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { rebuildDerived } from "@/lib/rebuild";
import { describeNextWorkout, substituteModification } from "@/lib/workout/buildPlan";
import { planForSession } from "@/lib/workout/planForSession";
import { planWorkoutStart } from "@/lib/workout/startPlan";
import { projectUpcomingWorkouts } from "@/lib/workout/upcoming";
import type { WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
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

const NOW = new Date(2026, 10, 14, 12, 0, 0);
const DAY = 86_400_000;
const SNAPSHOT = path.resolve(__dirname, "__fixtures__/planning-paths.characterisation.json");

const demo = generateDemoData(NOW);
const workouts = [...demo.workouts].sort(
  (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
);
const firstStart = new Date(workouts[0].startedAt).getTime();
const daysBefore = (days: number) => new Date(firstStart - days * DAY);
const between = (i: number) =>
  new Date((new Date(workouts[i].completedAt!).getTime() + new Date(workouts[i + 1].startedAt).getTime()) / 2);

/** One made-up imported session: three working sets of one exercise. */
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

/** Barbell sessions three months before the demo log, dumbbell sessions just before it. */
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

function adjustment(id: string, at: Date, rest: Partial<LiftAdjustment> & Pick<LiftAdjustment, "exerciseId" | "set">): LiftAdjustment {
  return { id, clientId: id, at, source: "manual", synced: true, updatedAt: at.getTime(), deletedAt: null, ...rest };
}

/** Weights set by hand: a home exercise during the home block, a barbell tier and a home exercise after it. */
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

/** Next-session set plans for lifts done as themselves and as home exercises. */
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

/** Edit-workout edits for a day: a weight on its T1, a scheme on its T2, a T3 swap and an accessory. */
function editsFor(template: WorkoutTemplate): PlanEdit[] {
  const of = (tier: string) => template.exercises.find((ex) => ex.tier === tier)!;
  return [
    { kind: "weight", exerciseId: of("T1").exerciseId, tier: "T1", weight: 95 },
    { kind: "scheme", exerciseId: of("T2").exerciseId, tier: "T2", sets: 4, reps: 8 },
    { kind: "swap", exerciseId: of("T3").exerciseId, tier: "T3", replacementId: "face_pulls" },
    { kind: "add", exerciseId: "bicep_curls", sets: 3, reps: 12, weight: 25, isAMRAP: false },
  ];
}

/** A home substitute picked on Configure. */
const OVERRIDES: Record<string, string> = { deadlift: "single_leg_db_rdl" };

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Plain JSON: dates as local stamps, maps as objects, undefined fields dropped. */
function plain(value: unknown): unknown {
  if (value instanceof Date) return localStamp(value);
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, plain(v)])
    );
  }
  return value;
}

/** One line per plan entry with everything a weight, a scheme or its reason depends on. */
function lines(plan: WorkoutPlan): string[] {
  return plan.map((e) => {
    const parts = [
      `${e.isWarmUp ? "warmup" : e.tier} ${e.exerciseId}${e.substituteExerciseId ? `>${e.substituteExerciseId}` : ""}`,
      `${e.weight}${e.originalWeight != null ? `(${e.originalWeight})` : ""} ${e.targetSets}x${e.targetReps}${e.isAMRAP ? "+" : ""}`,
    ];
    if (e.perSet) parts.push(`sets=${e.perSet.map((s) => `${s.weight}x${s.reps}${s.role ? `:${s.role}` : ""}`).join(",")}`);
    if (e.variantId) parts.push(`variant=${e.variantId}${e.perHand ? " perHand" : ""}`);
    if (e.cappedFrom != null) parts.push(`cappedFrom=${e.cappedFrom}`);
    if (e.seed) parts.push(`seed=${JSON.stringify(plain(e.seed))}`);
    if (e.reentry) parts.push(`reentry=${JSON.stringify(plain(e.reentry))}`);
    return parts.join(" | ");
  });
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
    overrides: OVERRIDES,
  },
];

/** What every path plans for the session start before workout `index` of the demo log. */
function startAt(scenario: Scenario, index: number, location: WorkoutLocation) {
  const done = workouts.slice(0, index);
  const startedAt = new Date(workouts[index].startedAt);
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
  const records: LedgerRecords = {
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
  };
  const strengthSets = strengthSetsFrom(records);
  const equipment = settings.equipment;

  // Today's forecast plan (the ledger) and Today's rows (the hooks' inputs).
  const ledger = nextWorkoutFrom(records, location);
  const rows = describeNextWorkout({
    completedWorkouts: done,
    templates: WORKOUT_TEMPLATES,
    liftStates,
    plan: {
      location,
      equipment,
      includeWarmUps: settings.showWarmUps,
      selectedAccessories: [],
      variantStates,
      strengthSets,
      nextSetPlans: settings.nextSetPlans,
    },
    reentry: true,
  });
  const upcoming = projectUpcomingWorkouts({
    completedWorkouts: done,
    templates: WORKOUT_TEMPLATES,
    liftStates,
    location,
    equipment,
    includeWarmUps: settings.showWarmUps,
    count: 4,
    settings,
    now: new Date(0),
    variantStates,
    strengthSets,
    reentry: true,
    nextSetPlans: settings.nextSetPlans,
  });

  // Configure and the start.
  const template = WORKOUT_TEMPLATES[ledger.templateId];
  const edits = scenario.edits(template);
  const overrides = location === "home" ? scenario.overrides : undefined;
  const start = planWorkoutStart({
    template,
    liftStates,
    location,
    equipment,
    includeWarmUps: settings.showWarmUps,
    selectedAccessories: [],
    ...(overrides ? { overrides } : {}),
    edits,
    variantStates,
    strengthSets,
    ...(settings.nextSetPlans ? { nextSetPlans: settings.nextSetPlans } : {}),
  });

  // The started session, resumed.
  const session: WorkoutSession = {
    id: `start-${index}`,
    clientId: `start-${index}`,
    templateId: template.id,
    location,
    startedAt,
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: settings.showWarmUps,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: start.plan
      .filter((e) => !e.isWarmUp && e.substituteExerciseId && overrides?.[e.exerciseId] === e.substituteExerciseId)
      .map((e) => substituteModification(e.exerciseId, e.substituteExerciseId!, e.originalWeight ?? 0, e.weight)),
    prescribed: start.prescribed,
    planEdits: [...start.nextSetPlanEdits, ...edits],
    synced: false,
  };
  const resumed = planForSession({ session, template, liftStates, equipment, variantStates, strengthSets });

  return {
    workout: workouts[index].id,
    due: ledger.templateId,
    today: lines(rows.plan),
    forecast: lines(ledger.plan),
    upcoming: upcoming.map((w) => `${w.templateId}: ${w.entries.map((e) => `${e.tier} ${e.substituteExerciseId ?? e.exerciseId} ${e.weight} ${e.sets}x${e.reps}${e.assumed ? "*" : ""}`).join("; ")}`),
    start: {
      plan: lines(start.plan),
      prescribed: plain(start.prescribed),
      nextSetPlanEdits: plain(start.nextSetPlanEdits),
      reentries: plain(start.reentries),
    },
    resumed: lines(resumed),
  };
}

describe("planning paths: characterisation over the demo log", () => {
  it("plans every session start as recorded", async () => {
    const out: Record<string, unknown> = {};
    for (const scenario of SCENARIOS) {
      for (const location of ["gym", "home"] as const) {
        out[`${scenario.name} @ ${location}`] = workouts.map((_, i) => startAt(scenario, i, location));
      }
    }
    await expect(`${JSON.stringify(out, null, 1)}\n`).toMatchFileSnapshot(SNAPSHOT);
  });
});
