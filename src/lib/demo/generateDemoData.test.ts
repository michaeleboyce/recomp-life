import { describe, expect, it } from "vitest";
import {
  DEMO_DROP_SET,
  DEMO_HOME_BLOCK,
  DEMO_LIFTER,
  demoBarbellEquivalent,
  demoRepsInHand,
  generateDemoData,
} from "./generateDemoData";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { DEMO_LIFT_STATES } from "./demoLifter";
import { roundToStep } from "@/lib/dbConversion";
import { E1RM_MAX_REPS, toRecentE1RMSeries } from "@/lib/e1rm";
import { rebuildDerived } from "@/lib/rebuild";
import { runSession, sortedVariants, startSim, type SessionOptions } from "@/lib/rebuild/testHelpers";
import { barbellReentryWeight, pooledLiftEstimate } from "@/lib/strength";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import { strengthSetsOf } from "@/lib/workout/strength";
import { homeStepsEarned } from "@/lib/workout/variant";
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
    // One row per T1 AMRAP set of the lift itself: the eight home sessions give none
    // (five scattered home sessions before 2026-11-15, so 19 rows then).
    expect(data.estimated1RMs).toHaveLength(16);
    expect(data.liftStates).toHaveLength(Object.keys(DEMO_LIFT_STATES).length);
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
      // Every T1 lift passes, and no last set is too long to count toward the estimated max.
      expect(t1[4].actualReps).toBeGreaterThanOrEqual(3);
      expect(t1[4].actualReps).toBeLessThanOrEqual(E1RM_MAX_REPS);
      expect(t1.every((s) => typeof s.rpe === "number")).toBe(true);
      // Working sets: the one drop set (see below) is extra.
      expect(workingSetsFor(w.sets, w.sets.find((s) => s.tier === "T2")!.exerciseId, "T2")).toHaveLength(3);
      const t3 = w.sets.filter((s) => s.tier === "T3");
      expect(t3).toHaveLength(3);
      expect(t3[2].isAMRAP).toBe(true);
      expect(w.sets.every((s) => s.location === w.location)).toBe(true);
    }
  });

  describe("the lifter's last sets follow from one strength level per lift", () => {
    /**
     * Per T1 lift, oldest first: the barbell weight the program asked for, the barbell
     * weight the set was as hard as (at home the dumbbells through the exercise's
     * starting ratio, `demoBarbellEquivalent`), the reps, the strength they imply.
     */
    type LastSet = { program: number; bar: number; reps: number; strength: number; weeks: number };
    const lastSets = new Map<string, LastSet[]>();
    const firstStart = data.workouts[0].startedAt.getTime();
    for (const w of data.workouts) {
      const last = w.sets.find((s) => s.tier === "T1" && s.isAMRAP)!;
      const bar = demoBarbellEquivalent(last);
      const list = lastSets.get(last.exerciseId) ?? [];
      list.push({
        program: last.originalWeight ?? last.weight,
        bar,
        reps: last.actualReps,
        strength: bar * (1 + last.actualReps / 30),
        // Whole days, so a clock change between two workouts does not matter.
        weeks: Math.round((w.startedAt.getTime() - firstStart) / DAY) / 7,
      });
      lastSets.set(last.exerciseId, list);
    }

    /** The reps the lifter has for a set on a day `sds` standard deviations from average. */
    const repsOnADay = (sets: LastSet[], set: LastSet, sds: number) =>
      demoRepsInHand(sets[0].program, set.bar, set.weeks, sds * DEMO_LIFTER.dailyVariation);

    it("logs the reps the lifter's strength allows at the weight on the bar", () => {
      let withinOne = 0;
      let offAverage = 0;
      let total = 0;
      for (const [id, sets] of lastSets) {
        for (const set of sets) {
          total += 1;
          // No day is more than three standard deviations from the lifter's level.
          expect(set.reps, id).toBeGreaterThanOrEqual(repsOnADay(sets, set, -3));
          expect(set.reps, id).toBeLessThanOrEqual(repsOnADay(sets, set, 3));
          if (set.reps >= repsOnADay(sets, set, -1) && set.reps <= repsOnADay(sets, set, 1)) {
            withinOne += 1;
          }
          if (set.reps !== repsOnADay(sets, set, 0)) offAverage += 1;
        }
      }
      // Most days are ordinary, and some are not: the scatter is there but bell-shaped.
      expect(total).toBe(24);
      expect(withinOne).toBeGreaterThanOrEqual(14);
      expect(offAverage).toBeGreaterThanOrEqual(5);
    });

    it("gives fewer reps for more weight on the same day, more as the weeks pass, and stops at ten", () => {
      expect(demoRepsInHand(200, 200, 0, 0)).toBe(DEMO_LIFTER.startReps);
      expect(demoRepsInHand(200, 220, 0, 0)).toBeLessThan(demoRepsInHand(200, 200, 0, 0));
      expect(demoRepsInHand(200, 200, 4, 0)).toBeGreaterThan(demoRepsInHand(200, 200, 0, 0));
      expect(demoRepsInHand(200, 200, 0, -0.05)).toBeLessThan(demoRepsInHand(200, 200, 0, 0.05));
      expect(demoRepsInHand(200, 1000, 0, 0)).toBe(0);
      expect(demoRepsInHand(200, 100, 0, 0)).toBe(E1RM_MAX_REPS);
    });

    // 2026-11-15: a home session no longer raises the barbell weight, so the bar stays
    // where it was through the home block. 2026-11-16 (H6): the first gym session takes
    // the re-entry weight, here the bar plus the steps the home passes earned, and the
    // bar climbs from there.
    it("covers the four main lifts, six sessions each; the bar stays at home and climbs at the gym", () => {
      expect([...lastSets.keys()].sort()).toEqual(["bench", "deadlift", "ohp", "squat"]);
      for (const [id, sets] of lastSets) {
        expect(sets, id).toHaveLength(6);
        // Two sessions at home, then four at the gym starting from the re-entry weight.
        expect(sets[1].program, id).toBe(sets[0].program);
        expect(sets[2].program, id).toBeGreaterThan(sets[1].program);
        for (let i = 3; i < sets.length; i++) {
          expect(sets[i].program, id).toBeGreaterThan(sets[i - 1].program);
        }
      }
    });

    it("implies a strength that grows over the weeks", () => {
      for (const [id, sets] of lastSets) {
        // About 2% a week over the seven weeks between a lift's first and last session,
        // give or take the two days' scatter.
        const growth = sets[sets.length - 1].strength / sets[0].strength - 1;
        expect(growth, id).toBeGreaterThan(0.05);
        expect(growth, id).toBeLessThan(0.25);
      }
    });

    // 2026-11-16 (H6): the bar comes back from the home block with the steps the home
    // passes earned, near what the lifter can do by then, so the gym's first last sets
    // are ordinary (none stopped at ten, as when the bar restarted below the lifter), and
    // the reps fall as the bar outruns the lifter's strength.
    it("has fewer reps as the bar outruns the lifter's strength at the gym", () => {
      for (const [id, sets] of lastSets) {
        const gym = sets.slice(2);
        expect(gym[0].reps, id).toBeLessThan(E1RM_MAX_REPS);
        // A good day after a bad one can add a rep or two on a heavier bar, never three.
        for (let i = 1; i < gym.length; i++) {
          expect(gym[i].reps - gym[i - 1].reps, id + " gym session " + i).toBeLessThanOrEqual(2);
        }
      }
      // The press takes the biggest steps for its size and loses the most reps.
      const ohp = lastSets.get("ohp")!.slice(2);
      expect(ohp[0].reps - ohp[ohp.length - 1].reps).toBeGreaterThanOrEqual(3);
    });
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

  describe("the home block and the drop set (H15)", () => {
    const home = data.workouts.filter((w) => w.location === "home");
    const workingSquat = (w: (typeof data.workouts)[number]) =>
      w.sets.filter((s) => s.exerciseId === "squat" && s.tier === "T1");

    it("is the first eight workouts, about two and a half weeks at home", () => {
      expect(home.map((w) => w.id)).toEqual(
        data.workouts.slice(DEMO_HOME_BLOCK.first, DEMO_HOME_BLOCK.last + 1).map((w) => w.id)
      );
      const days = (home.at(-1)!.startedAt.getTime() - home[0].startedAt.getTime()) / DAY;
      expect(days).toBeGreaterThanOrEqual(14);
      expect(days).toBeLessThanOrEqual(21);
      // Each home session stored its home exercises' own prescription.
      expect(home.every((w) => w.prescribed!.some((p) => p.home))).toBe(true);
    });

    // 2026-11-16 (H3): a first home weight is the exercise's starting ratio to the lift.
    // The demo starts at home, so the first split squat has no estimate to go by: 0.5 x the
    // 190 barbell squat, 47.5 a hand, rounded to 50 (it was 80% of it, 75, before).
    it("seeds the split squat from its starting ratio and progresses it by its own passes", () => {
      const squatDays = home.filter((w) => workingSquat(w).length > 0);
      expect(squatDays.map((w) => [workingSquat(w)[0].substituteExerciseId, workingSquat(w)[0].weight, workingSquat(w)[0].targetReps])).toEqual([
        ["bulgarian_split_squat", 50, 3],
        ["bulgarian_split_squat", 55, 3],
      ]);
      const split = data.variantStates.find((v) => v.id === "squat|bulgarian_split_squat|T1")!;
      expect(split).toMatchObject({ weight: 60, extraReps: 0, current: true, seed: { source: "ratio", barbellWeight: 190, ratio: 0.5 } });
      expect(split.weight).toBe(roundToStep((0.5 * DEMO_LIFT_STATES.squat.t1Weight) / 2, 5) + 2 * 5);
      // The T2 split squat comes later, after a T1 session gave an estimate: it is
      // seeded from the estimate, and the stored seed says so.
      const splitT2 = data.variantStates.find((v) => v.id === "squat|bulgarian_split_squat|T2")!;
      expect(splitT2.seed).toMatchObject({ source: "estimate", ratio: 0.5, targetReps: 10 });
      const firstT2 = home.find((w) => w.sets.some((s) => s.exerciseId === "squat" && s.tier === "T2"))!;
      expect(firstT2.prescribed!.find((p) => p.exerciseId === "squat")!.home).toMatchObject({ exerciseId: "bulgarian_split_squat", weight: 45 });
    });

    it("the first gym session after the block takes the re-entry weight (H6)", () => {
      const firstGym = data.workouts.find((w) => w.location === "gym" && workingSquat(w).length > 0)!;
      const before = data.workouts.slice(0, data.workouts.indexOf(firstGym));
      const states = rebuildDerived({ workouts: before, adjustments: data.liftAdjustments, settings });
      const squat = states.liftStates.find((s) => s.exerciseId === "squat")!;
      const expected = barbellReentryWeight({
        lastWeight: squat.t1Weight,
        stepsEarned: homeStepsEarned(states.variantStates, "squat", "T1"),
        stepLbs: settings.equipment.gymBarbellIncrementLbs * 2,
        estimate: pooledLiftEstimate("squat", strengthSetsOf(before))!.value,
        targetReps: 3,
        equipment: settings.equipment,
      })!;
      // 190 plus the two steps the split squat's passes earned; the estimate allowed more.
      expect(expected).toMatchObject({ weight: 210, rule: "steps", fromSteps: 210 });
      expect(workingSquat(firstGym)[0].weight).toBe(expected.weight);
      expect(firstGym.prescribed!.find((p) => p.exerciseId === "squat")!.weight).toBe(210);
    });

    it("progresses the dumbbell RDL by its own passes from its ratio (0.6 x 220, 65 a hand)", () => {
      const deadliftT1 = home
        .map((w) => w.sets.find((s) => s.exerciseId === "deadlift" && s.tier === "T1"))
        .filter((s) => s != null);
      expect(deadliftT1.map((s) => [s!.substituteExerciseId, s!.weight])).toEqual([
        ["db_rdl", 65],
        ["db_rdl", 70],
      ]);
    });

    it("has one drop set: lighter than the set it continues, logged straight after it, with fewer reps", () => {
      const drops = data.workouts.flatMap((w) => w.sets.filter((s) => s.role === "drop"));
      expect(drops).toHaveLength(1);
      const workout = data.workouts[DEMO_DROP_SET.workout];
      const drop = drops[0];
      const parent = workout.sets.find((s) => s.id === drop.dropOf)!;
      expect(drop.weight).toBeLessThan(parent.weight);
      expect(drop.actualReps).toBe(DEMO_DROP_SET.reps);
      expect(workout.sets.indexOf(drop)).toBe(workout.sets.indexOf(parent) + 1);
      // A missed drop does not fail the lift: that session's T2 lift passed.
      const rebuilt = rebuildDerived({ workouts: data.workouts, adjustments: data.liftAdjustments, settings });
      const t2 = rebuilt.outcomes.get(workout.id)!.find((o) => o.tier === "T2")!;
      expect(t2.kind).toBe("passed");
    });
  });

  it("has no stored derived rows of its own: they are a rebuild of the log", () => {
    const rebuilt = rebuildDerived({
      workouts: data.workouts,
      adjustments: data.liftAdjustments,
      settings,
    });
    expect(data.liftStates).toEqual(rebuilt.liftStates);
    expect(data.estimated1RMs).toEqual(rebuilt.e1rms);
    expect(data.variantStates).toEqual(rebuilt.variantStates);
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
        // Planned as the Ready screen plans, re-entry included, as the demo is.
        live: true,
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
    // And the home exercises' own states.
    const variants = (states: typeof data.variantStates) =>
      states.map((v) => [v.id, v.weight, v.stage, v.extraReps, v.current, v.passesSinceGym]);
    expect(variants(data.variantStates)).toEqual(variants(sortedVariants(sim.variants)));
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
      const init = DEMO_LIFT_STATES[id];
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
      // Only the barbell sessions feed the lift's effort history since 2026-11-15: the
      // home sessions feed their home exercise's own (`recentLastSetReps`).
      const gymT1 = t1Workouts.filter((w) => w.location === "gym");
      expect(state.recentAMRAPReps).toEqual(
        gymT1
          .map((w) => w.sets.find((s) => s.exerciseId === id && s.isAMRAP)!.actualReps)
          .slice(-5)
      );
      expect(state.recentAvgRPEs).toHaveLength(gymT1.length);
      // The next T1 weight is above the last one lifted.
      const lastSet = lastT1.sets.find((s) => s.exerciseId === id && s.tier === "T1")!;
      expect(state.t1Weight).toBeGreaterThan(lastSet.originalWeight ?? lastSet.weight);
    }
    expect(["3x8", "3x6"]).toContain(byId.bench.t2Stage);
    expect(byId.lat_pulldown.t3Weight).toBeGreaterThanOrEqual(90);
  });
});
