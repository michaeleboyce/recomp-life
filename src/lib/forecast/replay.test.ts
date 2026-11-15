// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Forecast, WorkoutSession } from "@/types";
import { CALIBRATION } from "./coefficients";
import { toMs } from "./log";
import { replayForecasts, type ReplayInput } from "./replay";
import { sdScaleChanges, sdScaleOf, summarize } from "./score";
import { demoReplayInput, simulateLifter } from "./testHelpers";
import type { ScoredForecast } from "./types";

const NOW = new Date(2026, 10, 14, 12, 0, 0);
const demo = demoReplayInput(NOW);
const replay = replayForecasts(demo);

const byStart = (workouts: WorkoutSession[]) =>
  [...workouts].sort((a, b) => toMs(a.startedAt) - toMs(b.startedAt));
const madeBy = (forecasts: Forecast[], ms: number) =>
  forecasts.filter((forecast) => toMs(forecast.madeAt) <= ms);

describe("replay of the demo history", () => {
  it("forecasts every workout and resolves every session forecast", () => {
    const session = replay.scored.filter((item) => item.forecast.workoutId);
    expect(new Set(session.map((item) => item.forecast.workoutId)).size).toBe(demo.workouts.length);
    expect(session.every((item) => item.status.state === "resolved")).toBe(true);
    expect(replay.record.byKind.amrapReps!.resolved).toBe(demo.workouts.length);
    expect(replay.record.byKind.sessionLength!.resolved).toBe(demo.workouts.length);
    expect(replay.record.overall.void).toBe(0);
  });

  it("puts the 80% ranges between 70% and 90%", () => {
    const { ranges } = replay.record.overall;
    expect(ranges.n).toBeGreaterThanOrEqual(2 * demo.workouts.length);
    expect(ranges.share!).toBeGreaterThanOrEqual(0.7);
    expect(ranges.share!).toBeLessThanOrEqual(0.9);
  });

  it("gives the same figure whatever day the demo ends on", () => {
    for (const now of [new Date(2026, 6, 1, 9), new Date(2026, 2, 3, 20)]) {
      const { ranges } = replayForecasts(demoReplayInput(now)).record.overall;
      expect(ranges.share!).toBeGreaterThanOrEqual(0.7);
      expect(ranges.share!).toBeLessThanOrEqual(0.9);
    }
  });

  it("states chances that beat a coin flip", () => {
    // Always saying 50% scores a mean squared gap of 0.25.
    expect(replay.record.byKind.liftPass!.chances.brier!).toBeLessThan(0.25);
    expect(replay.record.byKind.newBest!.chances.brier!).toBeLessThan(0.25);
    expect(Math.abs(replay.record.byKind.amrapReps!.miss.bias!)).toBeLessThan(1);
  });

  it("uses the ids the live writer would, and the weight that was lifted", () => {
    for (const { forecast } of replay.scored) {
      if (!forecast.workoutId) continue;
      expect(forecast.id.startsWith(`fc:${forecast.workoutId}:${forecast.kind}`)).toBe(true);
      expect(forecast.slot).toBe(forecast.id);
      const workout = demo.workouts.find((w) => w.id === forecast.workoutId)!;
      expect(toMs(forecast.madeAt)).toBe(toMs(workout.startedAt));
    }
    // No forecast was void, so every forecast weight is the weight on the bar.
    expect(replay.scored.some((item) => item.status.state === "void")).toBe(false);
  });

  it("makes each forecast from the workouts finished before it", () => {
    const ordered = byStart(demo.workouts);
    for (const { forecast } of replay.scored) {
      if (forecast.kind !== "amrapReps") continue;
      const index = ordered.findIndex((w) => w.id === forecast.workoutId);
      const earlier = ordered
        .slice(0, index)
        .filter((w) => w.sets.some((s) => s.tier === "T1" && s.exerciseId === forecast.exerciseId));
      expect(forecast.inputs.sampleSize as number).toBeLessThanOrEqual(earlier.length);
      if (earlier.length === 0) expect(forecast.basis).toBe("prior");
    }
    // The first workout of all has nothing behind it.
    const first = replay.forecasts.filter((f) => f.workoutId === ordered[0].id);
    expect(first.every((f) => f.basis === "prior")).toBe(true);
    expect(first.some((f) => f.kind === "newBest")).toBe(false);
  });

  it("keeps one horizon forecast per slot", () => {
    const horizon = replay.forecasts.filter((f) => !f.workoutId);
    expect(horizon.length).toBeGreaterThan(0);
    expect(new Set(horizon.map((f) => f.slot)).size).toBe(horizon.length);
    for (const forecast of horizon) {
      expect(forecast.id).toBe(`replay:${forecast.slot}`);
      expect(forecast.clientId).toBe(forecast.id);
    }
    expect(horizon.some((f) => f.kind === "bodyweight4w")).toBe(true);
    expect(horizon.some((f) => f.kind === "e1rm4w")).toBe(true);
    expect(replayForecasts(demo, { horizon: false }).forecasts.some((f) => !f.workoutId)).toBe(false);
  });

  it("is the same every time", () => {
    expect(replayForecasts(demoReplayInput(NOW))).toEqual(replay);
    const shuffled: ReplayInput = {
      ...demo,
      workouts: [...demo.workouts].reverse(),
      bodyweight: [...demo.bodyweight].reverse(),
    };
    expect(replayForecasts(shuffled).forecasts).toEqual(replay.forecasts);
  });
});

describe("no forecast sees what came after it", () => {
  const ordered = byStart(demo.workouts);
  const cut = ordered[11];
  const cutMs = toMs(cut.startedAt);
  const early = madeBy(replay.forecasts, cutMs);

  it("has forecasts on both sides of the cut", () => {
    expect(early.length).toBeGreaterThan(20);
    expect(replay.forecasts.length - early.length).toBeGreaterThan(20);
    expect(early.some((f) => f.workoutId === cut.id)).toBe(true);
  });

  it("leaves earlier forecasts identical when later results change", () => {
    const changed: ReplayInput = {
      ...demo,
      workouts: demo.workouts.map((workout) => {
        if (toMs(workout.startedAt) < cutMs) return workout;
        // From the cut workout on: every set comes out differently, and longer.
        return {
          ...workout,
          totalDurationSeconds: workout.totalDurationSeconds * 3,
          sets: workout.sets.map((set) => ({ ...set, actualReps: 1, rpe: 10 })),
        };
      }),
      bodyweight: demo.bodyweight.map((log) =>
        toMs(log.date) > cutMs ? { ...log, weight: log.weight + 25 } : log
      ),
    };
    const after = replayForecasts(changed);
    expect(madeBy(after.forecasts, cutMs)).toEqual(early);
    // The change did reach the later forecasts and the scores.
    expect(after.forecasts).not.toEqual(replay.forecasts);
    expect(after.record.overall.ranges.share).not.toBe(replay.record.overall.ranges.share);
  });

  it("leaves earlier forecasts identical when later workouts are deleted or never happened", () => {
    const deleted: ReplayInput = {
      ...demo,
      workouts: demo.workouts.map((workout) =>
        toMs(workout.startedAt) > cutMs ? { ...workout, deletedAt: 1 } : workout
      ),
    };
    expect(madeBy(replayForecasts(deleted).forecasts, cutMs)).toEqual(early);

    const truncated: ReplayInput = {
      ...demo,
      workouts: demo.workouts.filter((workout) => toMs(workout.startedAt) <= cutMs),
      bodyweight: demo.bodyweight.filter((log) => toMs(log.date) <= cutMs),
    };
    expect(replayForecasts(truncated).forecasts).toEqual(early);
  });

  it("does not replay workouts that are unfinished, deleted or finished after now", () => {
    const last = ordered[ordered.length - 1];
    const variants: Array<Partial<WorkoutSession>> = [{ completedAt: null }, { deletedAt: 1 }];
    for (const patch of variants) {
      const input: ReplayInput = {
        ...demo,
        workouts: demo.workouts.map((w) => (w.id === last.id ? { ...w, ...patch } : w)),
      };
      expect(replayForecasts(input).forecasts.some((f) => f.workoutId === last.id)).toBe(false);
    }
    const before = replayForecasts({ ...demo, now: new Date(toMs(last.startedAt)) });
    expect(before.forecasts.some((f) => f.workoutId === last.id)).toBe(false);
  });
});

describe("replay of simulated lifters", () => {
  const scoredFor = (noise: number, seeds: number, options = {}) => {
    const all: ScoredForecast[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const input = simulateLifter({ seed, sessions: 64, noise, weeklyGain: 0.01, headroomReps: 5 });
      all.push(...replayForecasts(input, { horizon: false, ...options }).scored);
    }
    return all;
  };

  // A lifter whose strength behaves as the model assumes: steady growth, bell-shaped scatter.
  const typical = scoredFor(0.03, 12);
  const of = (kind: string, basis?: string) =>
    summarize(
      typical.filter(
        (item) => item.forecast.kind === kind && (!basis || item.forecast.basis === basis)
      )
    );

  it("goes through stage changes and resets, not only passes", () => {
    const bases = new Set(typical.map((item) => item.forecast.basis));
    expect([...bases].sort()).toEqual(["persistence", "prior", "regime-change", "trend"]);
    expect(of("liftPass").chances.observed!).toBeLessThan(0.95);
  });

  it("holds about the stated share of results in its rep ranges", () => {
    const reps = of("amrapReps");
    expect(reps.resolved).toBeGreaterThan(500);
    expect(reps.ranges.share!).toBeGreaterThan(0.75);
    expect(reps.ranges.share!).toBeLessThan(0.95);
    expect(of("amrapReps", "trend").ranges.share!).toBeGreaterThan(0.75);
  });

  it("is not biased once it has a trend", () => {
    expect(Math.abs(of("amrapReps", "trend").miss.bias!)).toBeLessThan(0.5);
    expect(Math.abs(of("amrapReps").miss.bias!)).toBeLessThan(0.5);
  });

  it("states pass chances that match how often the lift passes", () => {
    for (const basis of ["trend", "persistence"]) {
      const { chances } = of("liftPass", basis);
      expect(Math.abs(chances.meanStated! - chances.observed!)).toBeLessThan(0.1);
    }
    // In the top band the lift passes nearly every time; in the middle band it is a toss-up.
    const bins = of("liftPass").chances.bins;
    expect(bins[4].observed!).toBeGreaterThan(0.85);
    expect(bins[2].observed!).toBeLessThan(bins[4].observed!);
    expect(of("liftPass").chances.brier!).toBeLessThan(0.15);
  });

  it("widens its ranges when results keep landing outside them, and says when", () => {
    // Far more day-to-day scatter than the model's floors allow for.
    const input = simulateLifter({ seed: 3, sessions: 240, noise: 0.14, weeklyGain: 0.01, headroomReps: 5 });
    const corrected = replayForecasts(input, { horizon: false });
    const fixed = replayForecasts(input, { horizon: false, selfCorrect: false });

    expect(fixed.forecasts.every((f) => sdScaleOf(f) === 1)).toBe(true);
    expect(sdScaleChanges(fixed.forecasts)).toEqual([]);

    const changes = sdScaleChanges(corrected.forecasts).filter((c) => c.kind === "amrapReps");
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].from).toBe(1);
    expect(changes[0].to).toBeCloseTo(1 + CALIBRATION.sdScaleStep, 10);
    for (const forecast of corrected.forecasts) {
      expect(sdScaleOf(forecast)).toBeGreaterThanOrEqual(CALIBRATION.sdScaleMin);
      expect(sdScaleOf(forecast)).toBeLessThanOrEqual(CALIBRATION.sdScaleMax);
    }
    // Not before enough forecasts had resolved.
    const repsBefore = corrected.forecasts.filter(
      (f) => f.kind === "amrapReps" && toMs(f.madeAt) < changes[0].at.getTime()
    );
    expect(repsBefore.length).toBeGreaterThanOrEqual(CALIBRATION.minResolvedForCorrection);
    // The wider ranges catch more.
    const share = (result: typeof corrected) => result.record.byKind.amrapReps!.ranges.share!;
    expect(share(corrected)).toBeGreaterThan(share(fixed));
  });
});
