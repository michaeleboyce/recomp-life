import { describe, expect, it } from "vitest";
import { generateDemoData } from "./generateDemoData";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import { toRecentE1RMSeries } from "@/lib/e1rm";
import { rebuildDerived } from "@/lib/rebuild";
import { runSession, startSim, type SessionOptions } from "@/lib/rebuild/testHelpers";
import { WORKOUT_ROTATION } from "@/lib/workoutTemplates";

const settings = DEFAULT_USER_PROFILE.settings;
const NOW = new Date(2026, 10, 11, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe("generateDemoData", () => {
  const data = generateDemoData(NOW);

  it("is deterministic for a given now", () => {
    expect(generateDemoData(new Date(NOW))).toEqual(data);
  });

  it("does not read the clock: a different now shifts every date", () => {
    const earlier = generateDemoData(new Date(NOW.getTime() - 7 * DAY));
    expect(earlier.workouts.length).toBe(data.workouts.length);
    expect(earlier.workouts[0].startedAt.getTime()).toBe(
      data.workouts[0].startedAt.getTime() - 7 * DAY
    );
  });

  it("produces about eight weeks of each record type", () => {
    expect(data.workouts).toHaveLength(24);
    expect(data.runs).toHaveLength(6);
    expect(data.painEntries).toHaveLength(1);
    expect(data.bodyweight.length).toBeGreaterThanOrEqual(48);
    expect(data.bodyweight.length).toBeLessThan(56);
    expect(data.readinessLogs.length).toBeGreaterThanOrEqual(18);
    expect(data.readinessLogs.length).toBeLessThan(24);
    // One row per T1 AMRAP set of the lift itself: the five home sessions give none.
    expect(data.estimated1RMs).toHaveLength(19);
    expect(data.liftStates).toHaveLength(Object.keys(INITIAL_LIFT_STATES).length);
  });

  it("spans roughly 8 weeks with 2-3 days between workouts", () => {
    const starts = data.workouts.map((w) => w.startedAt.getTime());
    for (let i = 1; i < starts.length; i++) {
      const gap = Math.round((starts[i] - starts[i - 1]) / DAY);
      expect([2, 3]).toContain(gap);
    }
    const span = (NOW.getTime() - starts[0]) / DAY;
    expect(span).toBeGreaterThan(50);
    expect(span).toBeLessThan(60);
  });

  it("rotates A1, B1, A2, B2 and has unique ids", () => {
    data.workouts.forEach((w, i) => expect(w.templateId).toBe(WORKOUT_ROTATION[i % 4]));
    const ids = [
      ...data.workouts,
      ...data.workouts.flatMap((w) => w.sets),
      ...data.liftAdjustments,
      ...data.estimated1RMs,
      ...data.bodyweight,
      ...data.runs,
      ...data.readinessLogs,
      ...data.painEntries,
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.workouts[6].id).toBe("demo-workout-07");
  });

  it("every workout carries its sets, prescription and completion context", () => {
    for (const w of data.workouts) {
      expect(w.completedAt).not.toBeNull();
      expect(w.prescribed?.length).toBeGreaterThan(0);
      expect(w.completionContext?.phaseMode).toBe(settings.trainingPhase.mode);
      expect(typeof w.updatedAt).toBe("number");
      expect(w.deletedAt).toBeNull();
      expect(w.sets.some((s) => s.tier === "warmup")).toBe(true);
      const t1 = w.sets.filter((s) => s.tier === "T1");
      expect(t1).toHaveLength(5);
      expect(t1.filter((s) => s.isAMRAP)).toHaveLength(1);
      expect(t1[4].isAMRAP).toBe(true);
      expect(t1[4].actualReps).toBeGreaterThanOrEqual(3);
      expect(t1[4].actualReps).toBeLessThanOrEqual(6);
      expect(t1.every((s) => typeof s.rpe === "number")).toBe(true);
      expect(w.sets.filter((s) => s.tier === "T2")).toHaveLength(3);
      const t3 = w.sets.filter((s) => s.tier === "T3");
      expect(t3).toHaveLength(3);
      expect(t3[2].isAMRAP).toBe(true);
      expect(w.sets.every((s) => s.location === w.location)).toBe(true);
    }
  });

  it("includes home sessions with substituted sets and failed T2 sessions", () => {
    const home = data.workouts.filter((w) => w.location === "home");
    expect(home.length).toBeGreaterThanOrEqual(4);
    const sub = home[0].sets.find((s) => s.tier === "T1")!;
    expect(sub.isSubstituted).toBe(true);
    expect(sub.substituteExerciseId).toBeTruthy();
    expect(sub.originalWeight).toBeGreaterThan(sub.weight);

    const failed = data.workouts.filter((w) => w.sets.some((s) => s.status === "failed"));
    expect(failed.length).toBeGreaterThanOrEqual(3);
    expect(failed.length).toBeLessThanOrEqual(5);
    const allSets = data.workouts.flatMap((w) => w.sets);
    expect(allSets.filter((s) => s.status === "failed").every((s) => s.tier === "T2")).toBe(true);
    // A stage change shows up in the history.
    expect(allSets.some((s) => s.tier === "T2" && s.targetReps === 8)).toBe(true);
  });

  it("has no stored derived rows of its own: they are a rebuild of the log", () => {
    const rebuilt = rebuildDerived({
      workouts: data.workouts,
      adjustments: data.liftAdjustments,
      settings,
    });
    expect(data.liftStates).toEqual(rebuilt.liftStates);
    expect(data.estimated1RMs).toEqual(rebuilt.e1rms);
    expect(data.liftAdjustments.every((a) => a.source === "start")).toBe(true);
    expect(data.estimated1RMs.length).toBeGreaterThan(0);
    // A home (substituted) set gives no e1RM row; the rest are T1 AMRAP sets.
    expect(
      data.estimated1RMs.every((e) => {
        const set = data.workouts.flatMap((w) => w.sets).find((s) => s.id === e.setId)!;
        return set.tier === "T1" && set.isAMRAP && !set.isSubstituted;
      })
    ).toBe(true);
  });

  it("matches folding the same sessions one by one through the live completion path", () => {
    const sim = startSim(settings);
    for (const w of data.workouts) {
      const t1AmrapReps = (id: string) =>
        w.sets.find((s) => s.exerciseId === id && s.tier === "T1" && s.isAMRAP)?.actualReps;
      const t1 = w.sets.filter((s) => s.tier === "T1");
      const options: SessionOptions = {
        templateId: w.templateId,
        location: w.location,
        startedAt: w.startedAt,
        t1: { lastReps: t1AmrapReps(t1[0].exerciseId), rpe: null },
        t2: { reps: w.sets.filter((s) => s.tier === "T2").map((s) => s.actualReps) },
        t3: { lastReps: w.sets.filter((s) => s.tier === "T3").at(-1)!.actualReps },
      };
      runSession(sim, options);
    }
    const weights = (states: typeof data.liftStates) =>
      states.map((l) => [l.exerciseId, l.t1Weight, l.t1Stage, l.t2Weight, l.t2Stage, l.t3Weight]);
    const sorted = [...sim.states].sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1));
    expect(weights(data.liftStates)).toEqual(weights(sorted));
  });

  it("uses Date objects, none in the future", () => {
    const dates: unknown[] = [
      ...data.workouts.flatMap((w) => [w.startedAt, w.completedAt]),
      ...data.workouts.flatMap((w) => w.sets.map((s) => s.completedAt)),
      ...data.estimated1RMs.map((e) => e.date),
      ...data.bodyweight.map((b) => b.date),
      ...data.runs.map((r) => r.date),
      ...data.readinessLogs.map((r) => r.date),
      ...data.painEntries.map((p) => p.date),
    ];
    for (const d of dates) {
      expect(d).toBeInstanceOf(Date);
      expect((d as Date).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it("drops entries that would fall after an early-morning now", () => {
    const early = new Date(2026, 10, 11, 3, 0, 0);
    const d = generateDemoData(early);
    expect(d.bodyweight.every((b) => b.date <= early)).toBe(true);
    expect(d.runs.every((r) => r.date <= early)).toBe(true);
    expect(d.workouts.every((w) => w.completedAt! <= early)).toBe(true);
  });

  it("bodyweight trends from about 232.5 to about 226", () => {
    const first = data.bodyweight[0];
    const last = data.bodyweight[data.bodyweight.length - 1];
    expect(first.weight).toBeGreaterThan(231.5);
    expect(first.weight).toBeLessThan(233.5);
    expect(last.weight).toBeGreaterThan(225);
    expect(last.weight).toBeLessThan(227);
    expect(data.bodyweight.every((b) => b.timeOfDay === "morning")).toBe(true);
  });

  it("varies runs and readiness, and has soreness two days ago", () => {
    expect(new Set(data.runs.map((r) => r.category)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(data.runs.map((r) => r.perceivedEffort)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(data.readinessLogs.map((r) => r.sleepHours)).size).toBe(3);
    expect(new Set(data.readinessLogs.map((r) => r.stressLevel)).size).toBe(3);
    const workoutIds = new Set(data.workouts.map((w) => w.id));
    expect(data.readinessLogs.every((r) => workoutIds.has(r.sessionId))).toBe(true);
    const pain = data.painEntries[0];
    expect(pain.sensation).toBe("soreness");
    expect(Math.round((NOW.getTime() - pain.date.getTime()) / DAY)).toBe(2);
  });

  it("ends with lift states consistent with the history", () => {
    const byId = Object.fromEntries(data.liftStates.map((l) => [l.exerciseId, l]));
    for (const id of ["squat", "bench", "deadlift", "ohp"]) {
      const state = byId[id];
      const init = INITIAL_LIFT_STATES[id];
      expect(state.t1Weight).toBeGreaterThan(init.t1Weight);
      const t1Workouts = data.workouts.filter((w) =>
        w.sets.some((s) => s.exerciseId === id && s.tier === "T1")
      );
      const lastT1 = t1Workouts[t1Workouts.length - 1];
      expect(state.t1LastWorkoutDate).toEqual(lastT1.completedAt);
      expect(state.t2LastWorkoutDate).toBeInstanceOf(Date);
      expect(state.recentE1RMs).toEqual(
        toRecentE1RMSeries(data.estimated1RMs.filter((e) => e.exerciseId === id))
      );
      expect(state.recentE1RMs.length).toBeGreaterThanOrEqual(4);
      expect(state.recentAMRAPReps).toEqual(
        t1Workouts
          .map((w) => w.sets.find((s) => s.exerciseId === id && s.isAMRAP)!.actualReps)
          .slice(-5)
      );
      expect(state.recentAvgRPEs).toHaveLength(5);
      // The next T1 weight is above the last one lifted.
      const lastSet = lastT1.sets.find((s) => s.exerciseId === id && s.tier === "T1")!;
      expect(state.t1Weight).toBeGreaterThan(lastSet.originalWeight ?? lastSet.weight);
    }
    expect(["3x8", "3x6"]).toContain(byId.bench.t2Stage);
    expect(byId.lat_pulldown.t3Weight).toBeGreaterThanOrEqual(90);
  });
});
