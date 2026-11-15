// @vitest-environment node
import { describe, expect, it } from "vitest";
import { estimateLoggedSeconds, estimateWorkoutSeconds } from "@/lib/workout/duration";
import { makeEntry, makeSets } from "@/lib/workout/testFixtures";
import type { WorkoutSession } from "@/types";
import { CALIBRATION, SESSION_LENGTH_MODEL } from "./coefficients";
import { forecastSessionLength, sessionPaceRatios } from "./sessionLength";
import { DAY, t1Session } from "./testHelpers";

const NOW = new Date("2026-11-14T17:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const plan = [
  makeEntry({}),
  makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, isAMRAP: false }),
  makeEntry({ exerciseId: "lat_pulldown", tier: "T3", targetSets: 3, targetReps: 15 }),
];
const planned = estimateWorkoutSeconds(plan, { mode: "maintaining" });

/** A finished session whose real length is `pace` x its length on paper. */
function paced(id: string, days: number, pace: number, overrides: Partial<WorkoutSession> = {}) {
  const session = t1Session({ id, at: daysAgo(days), weight: 200, lastReps: 5, phase: "maintaining" });
  session.sets = [...session.sets, ...makeSets("bench", "T2", 3, 10)];
  const onPaper = estimateLoggedSeconds(session.sets, { mode: "maintaining" });
  return { ...session, totalDurationSeconds: Math.round(onPaper * pace), ...overrides };
}

describe("sessionPaceRatios", () => {
  it("is real length over length on paper, oldest first", () => {
    const ratios = sessionPaceRatios([paced("b", 3, 1.2), paced("a", 9, 0.9)], NOW);
    expect(ratios[0]).toBeCloseTo(0.9, 2);
    expect(ratios[1]).toBeCloseTo(1.2, 2);
  });

  it("leaves out sessions that say nothing about pace", () => {
    const workouts = [
      paced("early", 9, 0.5, { endedEarly: true }),
      paced("open", 8, 1, { completedAt: null }),
      paced("gone", 7, 1, { deletedAt: 5 }),
      paced("noLength", 6, 1, { totalDurationSeconds: 0 }),
      paced("noSets", 5, 1, { sets: [] }),
      paced("later", -2, 1),
    ];
    expect(sessionPaceRatios(workouts, NOW)).toEqual([]);
  });

  it("uses the rest lengths of the phase the session was finished in", () => {
    const session = paced("a", 3, 1);
    const cut = {
      ...session,
      completionContext: { ...session.completionContext!, phaseMode: "cutting" as const },
    };
    // Same real length, longer on paper in a cut, so the ratio is lower.
    expect(sessionPaceRatios([cut], NOW)[0]).toBeLessThan(sessionPaceRatios([session], NOW)[0]);
  });
});

describe("forecastSessionLength", () => {
  const phase = { mode: "maintaining" as const };

  it("is the length on paper with a default range before there is history", () => {
    const few = [paced("a", 9, 1.3), paced("b", 3, 1.3)];
    expect(few.length).toBeLessThan(SESSION_LENGTH_MODEL.minSessionsForCorrection);
    const forecast = forecastSessionLength({ plan, workouts: few, phase, now: NOW });
    expect(forecast.basis).toBe("prior");
    expect(forecast.sampleSize).toBe(0);
    expect(forecast.correction).toBe(1);
    expect(forecast.seconds).toBe(planned);
    expect(forecast.low).toBeCloseTo(planned * (1 - SESSION_LENGTH_MODEL.defaultRangeFraction), 6);
    expect(forecast.high).toBeCloseTo(planned * (1 + SESSION_LENGTH_MODEL.defaultRangeFraction), 6);
  });

  it("scales the plan by the lifter's usual pace once there is history", () => {
    const workouts = [paced("a", 12, 1.2), paced("b", 9, 1.25), paced("c", 6, 1.15), paced("d", 3, 1.2)];
    const forecast = forecastSessionLength({ plan, workouts, phase, now: NOW });
    expect(forecast.basis).toBe("persistence");
    expect(forecast.sampleSize).toBe(4);
    expect(forecast.correction).toBeCloseTo(1.2, 2);
    expect(forecast.seconds).toBeCloseTo(planned * forecast.correction, 6);
    expect(forecast.low).toBeLessThan(forecast.seconds);
    expect(forecast.high).toBeGreaterThan(forecast.seconds);
    expect(forecast.high - forecast.seconds).toBeCloseTo(
      CALIBRATION.rangeZ * forecast.relativeSd * forecast.seconds,
      6
    );
  });

  it("never has a scatter under the floor, however steady the history", () => {
    const steady = [1, 2, 3, 4, 5, 6].map((n) => paced(`w${n}`, n * 3, 1.1));
    const forecast = forecastSessionLength({ plan, workouts: steady, phase, now: NOW });
    expect(forecast.relativeSd).toBeCloseTo(
      SESSION_LENGTH_MODEL.sdFloorFraction * Math.sqrt(1 + 1 / 6),
      3
    );
  });

  it("is wider for a lifter whose sessions vary more", () => {
    const steady = [1.1, 1.12, 1.08, 1.1, 1.11, 1.09].map((pace, n) => paced(`s${n}`, (n + 1) * 3, pace));
    const varied = [0.8, 1.4, 1.0, 1.3, 0.9, 1.2].map((pace, n) => paced(`v${n}`, (n + 1) * 3, pace));
    const a = forecastSessionLength({ plan, workouts: steady, phase, now: NOW });
    const b = forecastSessionLength({ plan, workouts: varied, phase, now: NOW });
    expect(b.relativeSd).toBeGreaterThan(a.relativeSd * 2);
  });

  it("is not thrown by one session left open overnight", () => {
    const usual = [1, 2, 3, 4, 5, 6, 7].map((n) => paced(`w${n}`, n * 3, 1.1 + (n % 3) * 0.02));
    const withOutlier = [...usual, paced("overnight", 2, 14)];
    const a = forecastSessionLength({ plan, workouts: usual, phase, now: NOW });
    const b = forecastSessionLength({ plan, workouts: withOutlier, phase, now: NOW });
    expect(b.correction).toBeCloseTo(a.correction, 1);
    expect(b.relativeSd).toBeLessThan(0.1);
  });

  it("reads only the latest sessions", () => {
    const old = Array.from({ length: 10 }, (_, n) => paced(`old${n}`, 200 + n, 2));
    const recent = Array.from({ length: SESSION_LENGTH_MODEL.recentSessions }, (_, n) =>
      paced(`new${n}`, 1 + n, 1)
    );
    const forecast = forecastSessionLength({ plan, workouts: [...old, ...recent], phase, now: NOW });
    expect(forecast.sampleSize).toBe(SESSION_LENGTH_MODEL.recentSessions);
    expect(forecast.correction).toBeCloseTo(1, 2);
  });

  it("widens with the track-record factor and ignores sessions after now", () => {
    const workouts = [paced("a", 12, 1.2), paced("b", 9, 1.25), paced("c", 6, 1.15)];
    const base = forecastSessionLength({ plan, workouts, phase, now: NOW });
    const wide = forecastSessionLength({ plan, workouts, phase, sdScale: 1.5, now: NOW });
    expect(wide.seconds).toBe(base.seconds);
    expect(wide.high - wide.seconds).toBeCloseTo((base.high - base.seconds) * 1.5, 6);
    expect(wide.sdScale).toBe(1.5);
    expect(
      forecastSessionLength({ plan, workouts, phase, sdScale: 7, now: NOW }).sdScale
    ).toBe(CALIBRATION.sdScaleMax);

    const withLater = [...workouts, paced("later", -1, 3)];
    expect(forecastSessionLength({ plan, workouts: withLater, phase, now: NOW })).toEqual(base);
  });
});
