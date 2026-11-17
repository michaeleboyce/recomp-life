// One interpretation of a saved workout (F3): resume (`planForSession`) and the history
// rebuild (`rebuildDerived`, rule 4) read a saved session through `resolveSavedSession`.
// A saved session keeps the weight it recorded, even after the equipment changed.
// Made-up data only.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { strengthSetsFrom } from "@/lib/data/forecasts";
import { rebuildDerived } from "@/lib/rebuild";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  EquipmentProfile,
  LiftAdjustment,
  PrescribedEntry,
  SetLog,
  UserSettings,
  WorkoutSession,
} from "@/types";
import { createSetLog } from "./logSet";
import { planForSession } from "./planForSession";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "./prescription";
import { dueTemplateId } from "./rotation";
import { resolveSavedSession } from "./savedSession";
import { planWorkoutStart } from "./startPlan";
import { planningCases, type PlanningCase } from "./testPlanningCases";
import type { WorkoutPlan } from "./types";

const PROGRAM_TIERS = new Set(["T1", "T2", "T3"]);
const HOUR = 3_600_000;

/** The session a case would save at start, with `prescribed` changed by `tweak`. */
function savedSession(c: PlanningCase, tweak: (p: PrescribedEntry[]) => PrescribedEntry[] = (p) => p) {
  const template = WORKOUT_TEMPLATES[dueTemplateId(c.records.workouts)];
  const start = planWorkoutStart({
    template,
    liftStates: c.records.liftStates,
    location: c.location,
    equipment: c.settings.equipment,
    includeWarmUps: false,
    selectedAccessories: [],
    variantStates: c.records.variantStates ?? [],
    strengthSets: strengthSetsFrom(c.records),
  });
  const startedAt = c.records.readAt;
  const session: WorkoutSession = {
    id: `saved-${c.index}-${c.location}`,
    clientId: `saved-${c.index}-${c.location}`,
    templateId: template.id,
    location: c.location,
    startedAt,
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: [],
    prescribed: tweak(start.prescribed),
    synced: false,
  };
  return { template, session, start };
}

/** Each program lift of a plan: what it is done as, at what weight and scheme. */
function planView(plan: WorkoutPlan) {
  return plan
    .filter((e) => !e.isWarmUp && PROGRAM_TIERS.has(e.tier))
    .map((e) => ({
      lift: `${e.exerciseId}|${e.tier}`,
      exerciseId: e.substituteExerciseId ?? e.exerciseId,
      weight: e.weight,
      sets: e.targetSets,
      reps: e.targetReps,
    }));
}

/** Every working set of a plan logged as planned, an hour after `startedAt`. */
function logged(plan: WorkoutPlan, session: WorkoutSession): SetLog[] {
  const now = new Date(new Date(session.startedAt).getTime() + HOUR);
  return plan
    .filter((e) => !e.isWarmUp && PROGRAM_TIERS.has(e.tier))
    .flatMap((entry) =>
      Array.from({ length: entry.targetSets }, (_, done) => {
        const id = `${session.id}-${entry.exerciseId}-${entry.tier}-${done}`;
        return createSetLog({
          exercise: { ...entry, completedSets: done },
          actualReps: entry.targetReps,
          rpe: null,
          location: session.location,
          autoRegulated: false,
          now,
          id,
          clientId: id,
        });
      })
    );
}

const schemeOf = (tier: string, stage: string | undefined, t3: { sets: number; reps: number }) =>
  tier === "T1"
    ? T1_STAGE_SCHEME[stage as keyof typeof T1_STAGE_SCHEME]
    : tier === "T2"
      ? T2_STAGE_SCHEME[stage as keyof typeof T2_STAGE_SCHEME]
      : t3;

/**
 * What the rebuild credited each program lift against: the home exercise's outcome
 * (exercise, weight, scheme) when one was done, else the lift's own.
 */
function replayView(
  rebuilt: ReturnType<typeof rebuildDerived>,
  session: WorkoutSession,
  template: (typeof WORKOUT_TEMPLATES)[string]
) {
  const outcomes = rebuilt.outcomes.get(session.id) ?? [];
  const variantOutcomes = rebuilt.variantOutcomes.get(session.id) ?? [];
  return template.exercises.map((slot) => {
    const t3 = { sets: slot.sets, reps: slot.reps };
    const home = variantOutcomes.find((o) => o.liftId === slot.exerciseId && o.tier === slot.tier);
    if (home) {
      const scheme = schemeOf(slot.tier, home.from.stage, t3);
      return {
        lift: `${slot.exerciseId}|${slot.tier}`,
        exerciseId: home.exerciseId,
        weight: home.from.weight,
        sets: scheme.sets,
        reps: home.from.reps,
      };
    }
    const own = outcomes.find((o) => o.exerciseId === slot.exerciseId && o.tier === slot.tier)!;
    const scheme = schemeOf(slot.tier, own.from.stage, t3);
    return {
      lift: `${slot.exerciseId}|${slot.tier}`,
      exerciseId: slot.exerciseId,
      weight: own.from.weight,
      sets: scheme.sets,
      reps: scheme.reps,
    };
  });
}

/**
 * Resumes the saved session with `settings` and the adjustments `extra` made since it
 * started, logs every set as resumed, finishes it, rebuilds the log with the same
 * settings, and returns both readings.
 */
function resumeAndReplay(
  c: PlanningCase,
  saved: ReturnType<typeof savedSession>,
  settings: UserSettings,
  extra: LiftAdjustment[] = []
) {
  const { template, session } = saved;
  const adjustments = [...c.records.liftAdjustments, ...extra];
  // The states the app holds when the workout is resumed: the rebuild of the log so far.
  const now = rebuildDerived({ workouts: c.records.workouts, adjustments, settings });
  const resumed = planForSession({
    session,
    template,
    liftStates: now.liftStates,
    equipment: settings.equipment,
    variantStates: now.variantStates,
    strengthSets: strengthSetsFrom({ ...c.records, variantStates: now.variantStates }),
  });
  const finished: WorkoutSession = {
    ...session,
    sets: logged(resumed, session),
    completedAt: new Date(new Date(session.startedAt).getTime() + 2 * HOUR),
  };
  const rebuilt = rebuildDerived({ workouts: [...c.records.workouts, finished], adjustments, settings });
  return { resumed: planView(resumed), replayed: replayView(rebuilt, finished, template) };
}

const cases = planningCases();
const homeCases = cases.filter((c) => c.location === "home");

function withEquipment(c: PlanningCase, equipment: Partial<EquipmentProfile>): UserSettings {
  return { ...c.settings, equipment: { ...c.settings.equipment, ...equipment } };
}

/** The stored home prescription of the day's T1 lift at `weight`. */
const t1HomeAt = (weight: number) => (prescribed: PrescribedEntry[]) =>
  prescribed.map((p) => (p.tier === "T1" && p.home ? { ...p, home: { ...p.home, weight } } : p));

describe("resolveSavedSession: a saved session keeps the weight it recorded", () => {
  const c = homeCases.find((x) => x.index === 3 && x.name.startsWith("plain"))!;

  it("resumes a stored 70 lb home weight at 70 after the heaviest dumbbell drops to 50", () => {
    const saved = savedSession(c, t1HomeAt(70));
    const t1 = saved.session.prescribed!.find((p) => p.tier === "T1")!;
    expect(t1.home?.weight).toBe(70);
    for (const equipment of [{ maxDumbbellWeight: 50 }, { dumbbellIncrementLbs: 20 }, { maxDumbbellWeight: 45, dumbbellIncrementLbs: 10 }]) {
      const settings = withEquipment(c, equipment);
      const plan = planForSession({
        session: saved.session,
        template: saved.template,
        liftStates: c.records.liftStates,
        equipment: settings.equipment,
        variantStates: c.records.variantStates,
        strengthSets: strengthSetsFrom(c.records),
      });
      const entry = plan.find((e) => !e.isWarmUp && e.tier === "T1")!;
      expect(entry.substituteExerciseId).toBe(t1.home!.exerciseId);
      expect(entry.weight).toBe(70);
      expect(entry.cappedFrom).toBeUndefined();
      expect([entry.targetSets, entry.targetReps]).toEqual([t1.home!.sets, t1.home!.reps]);
    }
  });

  it("gives the lifts and the anchored states in one reading", () => {
    const saved = savedSession(c, t1HomeAt(70));
    const read = resolveSavedSession({
      session: saved.session,
      template: saved.template,
      liftStates: c.records.liftStates,
      variantStates: c.records.variantStates ?? [],
      equipment: withEquipment(c, { maxDumbbellWeight: 50 }).equipment,
    });
    const t1 = read.lifts.find((l) => l.tier === "T1")!;
    expect(t1.weight).toBe(70);
    expect(read.anchored.get(t1.home!.variantId)?.weight).toBe(70);
    const current = read.variantStates.filter((v) => v.liftId === t1.liftId && v.tier === "T1" && v.current);
    expect(current.map((v) => v.id)).toEqual([t1.home!.variantId]);
  });

  it("plans from the states given when the session stored no prescription", () => {
    const saved = savedSession(c);
    const read = resolveSavedSession({
      session: { ...saved.session, prescribed: undefined },
      template: saved.template,
      liftStates: c.records.liftStates,
      variantStates: c.records.variantStates ?? [],
      equipment: c.settings.equipment,
      strengthSets: strengthSetsFrom(c.records),
    });
    expect(read.lifts).toEqual(saved.start.lifts.map((lift) => {
      const rest = { ...lift };
      delete rest.reentry;
      return rest;
    }));
  });
});

describe("resume and replay read a saved session the same way", () => {
  it("for every planning case, as saved", () => {
    for (const c of cases) {
      const { resumed, replayed } = resumeAndReplay(c, savedSession(c), c.settings);
      expect(replayed, c.name).toEqual(resumed);
    }
  });

  it("after the equipment changed since it started", () => {
    for (const c of homeCases) {
      const saved = savedSession(c, t1HomeAt(70));
      for (const equipment of [{ maxDumbbellWeight: 50 }, { dumbbellIncrementLbs: 20 }]) {
        const { resumed, replayed } = resumeAndReplay(c, saved, withEquipment(c, equipment));
        expect(replayed, `${c.name} ${JSON.stringify(equipment)}`).toEqual(resumed);
        expect(resumed.find((l) => l.lift.endsWith("|T1"))?.weight, c.name).toBe(70);
      }
    }
  });

  it("after a weight was set by hand since it started", () => {
    for (const c of homeCases.filter((x) => x.index % 4 === 1)) {
      const saved = savedSession(c);
      const t1 = saved.session.prescribed!.find((p) => p.tier === "T1")!;
      const at = new Date(new Date(saved.session.startedAt).getTime() + HOUR / 2);
      const hand: LiftAdjustment = {
        id: `hand-${c.index}`,
        clientId: `hand-${c.index}`,
        exerciseId: t1.exerciseId,
        at,
        source: "manual",
        set: { t1Weight: (t1.home?.weight ?? t1.weight) + 10 },
        ...(t1.home ? { variant: { exerciseId: t1.home.exerciseId, tier: "T1" as const } } : {}),
        synced: true,
        updatedAt: at.getTime(),
        deletedAt: null,
      };
      const { resumed, replayed } = resumeAndReplay(c, saved, c.settings, [hand]);
      expect(replayed, c.name).toEqual(resumed);
      // The hand-set weight is for the next session; this one keeps what it recorded.
      expect(resumed.find((l) => l.lift.endsWith("|T1"))?.weight, c.name).toBe(t1.home?.weight ?? t1.weight);
    }
  });

  it("when the stored home exercise is no longer offered for its lift", () => {
    // The lift is then done as another home exercise, which the session did not record:
    // one never used is seeded, and the rebuild seeds from the app's own sets only
    // (imported history is never read by the rebuild), so this runs on the plain cases.
    for (const c of homeCases.filter((x) => x.index % 4 === 2 && x.name.startsWith("plain"))) {
      // A home exercise that is not one of the T1 lift's options (another lift's).
      const saved = savedSession(c, (prescribed) =>
        prescribed.map((p) =>
          p.tier === "T1" && p.home
            ? { ...p, home: { ...p.home, exerciseId: p.exerciseId === "bench" ? "db_rdl" : "db_bench" } }
            : p
        )
      );
      const { resumed, replayed } = resumeAndReplay(c, saved, c.settings);
      expect(replayed, c.name).toEqual(resumed);
    }
  });
});
