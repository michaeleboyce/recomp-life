// Every path that plans the next workout reads the same strength evidence (the app's
// sets and the imported sessions', names read through the remembered choices), so with
// imported history they give the same weights and schemes for every lift: Today's rows
// (`useNextWorkout`), the forecast's plan (`nextWorkoutFrom` over the ledger records),
// the Configure plan and its prescription (`useWorkoutSetup`), the prescription
// recorded at start (`startWorkout`), the plan its forecasts and decisions are made from
// (`sessionStartInputs`) and the active workout's plan. At home and at the gym.
// Made-up sessions only.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { useActiveWorkout } from "@/components/ActiveWorkout/useActiveWorkout";
import { useWorkoutSetup } from "@/components/PreWorkout/useWorkoutSetup";
import { nextWorkoutFrom, readLedgerRecords, sessionStartInputs } from "@/lib/data/forecasts";
import { clearDb, runSession, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { discardWorkout, startWorkout } from "@/lib/data/workouts";
import { MAPPINGS_KEY, saveMappingOverrides } from "@/lib/import/remembered";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { strengthSetsOf } from "@/lib/workout/strength";
import type { WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { ImportedSessionRecord, PrescribedEntry, WorkoutLocation } from "@/types";
import { useNextWorkout, useTodayWorkout } from "./index";

const DAY = 86_400_000;
const NOW = new Date("2026-06-15T09:00:00Z");
const PROGRAM_TIERS = new Set(["T1", "T2", "T3"]);

/** One imported session of one exercise: three sets at `weight` (per dumbbell where it is per hand). */
function imp(name: string, exerciseId: string | null, daysAgo: number, weight: number, reps: number): ImportedSessionRecord {
  const sets = [0, 1, 2].map((i) =>
    importedSet({ exerciseName: name, mappedExerciseId: exerciseId, weightPerImplementLb: weight, reps: i === 2 ? reps - 1 : reps })
  );
  return importedSession(sets, { startedAt: new Date(NOW.getTime() - daysAgo * DAY) });
}

/** Barbell sessions two to three months back, dumbbell sessions in the last month. */
function history(): ImportedSessionRecord[] {
  return [
    ...[95, 85, 75].flatMap((d) => [
      imp("Back Squat", "squat", d, 225, 5),
      imp("Bench Press", "bench", d + 1, 175, 5),
      imp("Deadlift", "deadlift", d + 2, 275, 5),
      imp("Overhead Press", "ohp", d + 3, 115, 5),
    ]),
    ...[35, 28, 21].flatMap((d) => [
      imp("Dumbbell Bench Press", "db_bench", d, 55, 10),
      imp("Goblet Squat", "goblet_squat", d + 1, 70, 12),
      imp("Dumbbell Romanian Deadlift", "db_rdl", d + 2, 60, 10),
      imp("Dumbbell Shoulder Press", "db_shoulder_press", d + 3, 40, 10),
      imp("Dumbbell Row", "db_row", d + 4, 60, 10),
    ]),
    // The newest dumbbell bench session, under a name the import did not know: it counts
    // only through the choice remembered since.
    imp("Mystery Press", null, 10, 70, 8),
  ];
}

const line = (tier: string, exerciseId: string, as: string, weight: number, sets: number, reps: number) =>
  `${tier}:${exerciseId} as ${as} ${weight} ${sets}x${reps}`;

/** The program lifts of a plan: what each is done as, at what weight and scheme. */
function fromPlan(plan: WorkoutPlan): string[] {
  return plan
    .filter((e) => !e.isWarmUp && PROGRAM_TIERS.has(e.tier))
    .map((e) => line(e.tier, e.exerciseId, e.substituteExerciseId ?? e.exerciseId, e.weight, e.targetSets, e.targetReps))
    .sort();
}

/** The same from a stored prescription (the home exercise's own when there is one). */
function fromPrescribed(prescribed: readonly PrescribedEntry[]): string[] {
  return prescribed
    .filter((e) => PROGRAM_TIERS.has(e.tier))
    .map((e) =>
      line(e.tier, e.exerciseId, e.home?.exerciseId ?? e.exerciseId, e.home?.weight ?? e.weight, e.home?.sets ?? e.sets, e.home?.reps ?? e.reps)
    )
    .sort();
}

interface Paths {
  today: WorkoutPlan;
  rows: string[];
}

/** Plans the next workout at `location` on every path and checks they agree. */
async function expectPathsAgree(location: WorkoutLocation): Promise<Paths> {
  const today = renderHook(() => useNextWorkout(location));
  await waitFor(() => expect(today.result.current).toBeDefined(), { timeout: 15_000 });
  const next = today.result.current!;
  const rows = fromPlan(next.plan);
  expect(rows.length).toBeGreaterThanOrEqual(3);

  const records = await readLedgerRecords();
  const ledger = nextWorkoutFrom(records, location);
  expect(ledger.templateId).toBe(next.templateId);
  expect(fromPlan(ledger.plan)).toEqual(rows);

  // Today's hero resolves it once for its rows, tiles and readiness (R1).
  const hero = renderHook(() => useTodayWorkout(location));
  await waitFor(() => expect(hero.result.current).toBeDefined(), { timeout: 15_000 });
  expect(hero.result.current!.next.plan).toEqual(next.plan);
  hero.unmount();

  nav.params = `location=${location}`;
  const setup = renderHook(() => useWorkoutSetup());
  await waitFor(() => expect(setup.result.current.isLoading).toBe(false), { timeout: 15_000 });
  await waitFor(() => expect(setup.result.current.location).toBe(location));
  expect(setup.result.current.templateId).toBe(next.templateId);
  expect(fromPlan(setup.result.current.plan)).toEqual(rows);
  expect(fromPrescribed(setup.result.current.prescribed)).toEqual(rows);
  setup.unmount();

  // Started without a prescription, the data layer works it out from the ledger.
  const before = await readLedgerRecords();
  const id = await startWorkout({ templateId: next.templateId, location, includeWarmUps: false, selectedAccessories: [] });
  const session = (await db.workouts.get(id))!;
  expect(fromPrescribed(session.prescribed ?? [])).toEqual(rows);
  expect(fromPlan(sessionStartInputs(before, session)!.plan)).toEqual(rows);
  expect((await db.forecasts.where("workoutId").equals(id).count()) > 0).toBe(true);

  useWorkoutStore.getState().reset();
  const active = renderHook(() => useActiveWorkout(id, { tapGuardMs: 0 }));
  await waitFor(() => expect(active.result.current.status).toBe("active"), { timeout: 15_000 });
  expect(fromPlan(active.result.current.plan)).toEqual(rows);
  active.unmount();
  today.unmount();

  await discardWorkout(id);
  useWorkoutStore.getState().reset();
  return { today: next.plan, rows };
}

/** The same next workout planned from the app's log alone, as before imported history counted. */
async function logOnly(location: WorkoutLocation): Promise<string[]> {
  const records = await readLedgerRecords();
  const completed = records.workouts.filter((w) => w.completedAt != null && w.deletedAt == null);
  return fromPlan(
    describeNextWorkout({
      completedWorkouts: completed,
      templates: WORKOUT_TEMPLATES,
      liftStates: records.liftStates,
      plan: {
        location,
        equipment: records.settings.equipment,
        includeWarmUps: false,
        selectedAccessories: [],
        variantStates: records.variantStates ?? [],
        strengthSets: strengthSetsOf(completed),
      },
      reentry: true,
    }).plan
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  nav.params = "";
  localStorage.removeItem(MAPPINGS_KEY);
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  await db.importedSessions.bulkPut(history());
  saveMappingOverrides({ "Mystery Press": { kind: "exercise", exerciseId: "db_bench" } });
  useWorkoutStore.getState().reset();
});

afterEach(() => {
  localStorage.removeItem(MAPPINGS_KEY);
  vi.useRealTimers();
});

describe("with imported history and no app workouts", () => {
  it("plans the same home weights on every path, seeded from the imported history", async () => {
    const { today, rows } = await expectPathsAgree("home");
    // The first home weights rest on imported sessions, and say which (not "First time").
    const seeded = today.filter((e) => !e.isWarmUp && e.seed?.source === "estimate");
    expect(seeded.length).toBeGreaterThan(0);
    // Each names the exercise's own last imported session; one never done anywhere does not.
    for (const entry of seeded) {
      const done = history().some((s) => s.sets[0].mappedExerciseId === entry.substituteExerciseId);
      expect(entry.seed?.history != null, entry.substituteExerciseId).toBe(done || entry.substituteExerciseId === "db_bench");
    }
    const bench = today.find((e) => !e.isWarmUp && e.exerciseId === "bench");
    // The remembered choice made "Mystery Press" the newest dumbbell bench session.
    expect(bench?.seed?.history).toMatchObject({ weight: 70, reps: 8, perHand: true });
    // Without the imported history the plan would differ.
    expect(await logOnly("home")).not.toEqual(rows);
  });

  it("plans the same gym weights on every path, from the lift states", async () => {
    const { rows } = await expectPathsAgree("gym");
    // Barbell weights move only by progression or a confirmed starting weight.
    expect(await logOnly("gym")).toEqual(rows);
  });
});

describe("with imported history and a home block in the app", () => {
  beforeEach(async () => {
    // The home block is done first and the history imported after it, so the scripted
    // sessions log exactly what was prescribed (the script plans without the evidence).
    const imported = await db.importedSessions.toArray();
    await db.importedSessions.clear();
    const setNow = (date: Date) => vi.setSystemTime(date);
    const start = NOW.getTime() - 9 * DAY;
    for (const [i, templateId] of ["A1", "B1", "A2", "B2"].entries()) {
      await runSession({ templateId, location: "home", startedAt: new Date(start + i * 2 * DAY) }, setNow);
    }
    vi.setSystemTime(NOW);
    await db.importedSessions.bulkPut(imported);
  });

  it("plans the same re-entry weights back at the gym on every path", async () => {
    const { today, rows } = await expectPathsAgree("gym");
    expect(today.some((e) => !e.isWarmUp && e.reentry?.location === "gym")).toBe(true);
    // The re-entry estimate reads the imported history too.
    expect(await logOnly("gym")).not.toEqual(rows);
  });

  it("plans the same home weights on every path", async () => {
    await expectPathsAgree("home");
  });
});
