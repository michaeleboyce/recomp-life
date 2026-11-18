/**
 * Times what Today computes on a long history (F6): the starting-weight suggestions
 * (`suggestStartingWeights`, via `useStartingWeightsToConfirm`) and the next three
 * workouts with their accessories (`projectUpcomingWorkouts`, via `ComingUpLine` ->
 * `useUpcomingWorkouts(…, 3)`). Made-up data only: about 850 imported sessions and 50
 * app workouts. Slow and machine-dependent, so it only runs when asked:
 * `BENCH=1 npx vitest run src/lib/workout/todayCost.bench.test.ts`.
 *
 * "cold" calls get fresh copies of every input array, as the hooks do when a Dexie
 * result changes (the per-array caches start empty); "warm" calls repeat the same arrays.
 */
import { expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { EXERCISES } from "@/lib/exercises";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { suggestStartingWeights } from "@/lib/import/startingWeights";
import { runSession, startSim } from "@/lib/rebuild/testHelpers";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { projectUpcomingWorkouts } from "@/lib/workout/upcoming";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { ImportedSessionRecord } from "@/types";

const enabled = process.env.BENCH === "1";
const RUNS = 7;

/** A made-up long history: `count` sessions every other day back from `end`, five exercises each. */
function importedHistory(count: number, end: Date): ImportedSessionRecord[] {
  const ids = [
    "squat", "bench", "deadlift", "ohp", "db_bench", "bulgarian_split_squat", "db_row", "lat_pulldown",
    "leg_curls", "bicep_curls", "hack_squat", "db_shoulder_press", "db_rdl", "goblet_squat", "machine_row",
  ].filter((id) => EXERCISES[id]);
  const sessions: ImportedSessionRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const startedAt = new Date(end);
    startedAt.setDate(startedAt.getDate() - 2 * (count - i));
    startedAt.setHours(18, 0, 0, 0);
    const sets = [0, 1, 2, 3, 4].flatMap((k) => {
      const id = ids[(i + k * 3) % ids.length];
      const weight = 40 + ((i * 7 + k * 13) % 120);
      return [1, 2, 3, 4].map((order) =>
        importedSet({ exerciseName: `Made-up ${id}`, mappedExerciseId: id, setOrder: order, weightPerImplementLb: weight, reps: 5 + ((i + order) % 8) })
      );
    });
    sessions.push(importedSession(sets, { id: `bench-imp-${i}`, startedAt }));
  }
  return sessions;
}

function time(label: string, run: () => unknown): number {
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now();
    run();
    ms.push(performance.now() - start);
  }
  ms.sort((a, b) => a - b);
  const median = ms[Math.floor(ms.length / 2)];
  console.log(`[bench] ${label}: median ${median.toFixed(1)} ms (min ${ms[0].toFixed(1)}, max ${ms.at(-1)!.toFixed(1)})`);
  return median;
}

it.runIf(enabled)("times Today's starting weights and the next three workouts on a long history", () => {
  const sim = startSim();
  for (let i = 0; i < 50; i += 1) runSession(sim, { location: i % 3 === 2 ? "home" : "gym" });
  const now = new Date(sim.workouts.at(-1)!.completedAt!);
  now.setDate(now.getDate() + 2);
  const imported = importedHistory(850, sim.workouts[0].startedAt as Date);
  const settings = { ...DEFAULT_USER_PROFILE.settings, accessories: "auto" as const };

  const sets = strengthEvidenceOf(sim.workouts, imported);
  console.log(`[bench] ${imported.length} imported sessions, ${sim.workouts.length} app workouts, ${sets.length} sets`);
  time("strengthEvidenceOf", () => strengthEvidenceOf(sim.workouts, imported));

  const suggest = (fresh: boolean) => {
    const s = fresh ? [...sets] : sets;
    return suggestStartingWeights({
      sets: s,
      planStrengthSets: s,
      liftStates: fresh ? sim.states.map((x) => ({ ...x })) : sim.states,
      variantStates: fresh ? sim.variants.map((x) => ({ ...x })) : sim.variants,
      equipment: settings.equipment,
      phase: settings.trainingPhase,
      now,
      importedSessionIds: new Set(imported.map((x) => x.id)),
    });
  };
  const project = (fresh: boolean) =>
    projectUpcomingWorkouts({
      completedWorkouts: fresh ? [...sim.workouts] : sim.workouts,
      templates: WORKOUT_TEMPLATES,
      liftStates: fresh ? sim.states.map((x) => ({ ...x })) : sim.states,
      location: "gym",
      equipment: settings.equipment,
      includeWarmUps: settings.showWarmUps,
      settings,
      now: new Date(0),
      variantStates: fresh ? sim.variants.map((x) => ({ ...x })) : sim.variants,
      strengthSets: fresh ? [...sets] : sets,
      reentry: true,
      nextSetPlans: settings.nextSetPlans,
      accessoriesNow: now,
      count: 3,
    });

  const upcoming = project(false);
  const accessories = upcoming.reduce((n, w) => n + w.plan.filter((e) => e.tier === "accessory").length, 0);
  console.log(`[bench] ${suggest(false).length} suggestions; ${upcoming.length} workouts with ${accessories} accessories`);
  time("suggestStartingWeights cold", () => suggest(true));
  time("suggestStartingWeights warm", () => suggest(false));
  time("projectUpcomingWorkouts(3) cold", () => project(true));
  time("projectUpcomingWorkouts(3) warm", () => project(false));
  expect(upcoming).toHaveLength(3);
  // The same answers from fresh copies of the inputs as from the cached ones.
  expect(project(true)).toEqual(upcoming);
  expect(suggest(true)).toEqual(suggest(false));
});
