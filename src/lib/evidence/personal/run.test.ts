import { describe, expect, it } from "vitest";
import {
  HARD_ACTIVITY_EFFORT,
  HARD_RUN_EFFORT,
  HARD_SESSION_WINDOW_HOURS,
  PERSONAL_MIN_GROUP_SIZE,
} from "./constants";
import { hardSessionBefore, isLowerBodyLift, runEvidence } from "./run";
import { DAY, HOUR, makeActivity, constructedHistory, emptyLog, makeRun, makeT1Workout } from "./testHelpers";
import type { RunLog } from "@/types";
import type { PersonalLog } from "./types";

const NOW = new Date("2026-11-15T12:00:00Z");
const START = new Date("2026-11-10T17:00:00Z").getTime();
const before = (hours: number) => new Date(START - hours * HOUR);

describe("isLowerBodyLift", () => {
  it("is the leg lifts and the deadlift", () => {
    expect(isLowerBodyLift("squat")).toBe(true);
    expect(isLowerBodyLift("deadlift")).toBe(true);
    expect(isLowerBodyLift("bench")).toBe(false);
    expect(isLowerBodyLift("ohp")).toBe(false);
    expect(isLowerBodyLift("no-such-lift")).toBe(false);
  });
});

describe("hardSessionBefore", () => {
  it("counts a run rated hard in the window before the workout", () => {
    expect(hardSessionBefore(START, [makeRun("r", before(10), HARD_RUN_EFFORT)], [])).toBe("hard");
    expect(hardSessionBefore(START, [makeRun("r", before(10), 5)], [])).toBe("hard");
  });

  it("counts another hard session too", () => {
    expect(
      hardSessionBefore(START, [], [makeActivity("a", before(20), HARD_ACTIVITY_EFFORT, "yoga")])
    ).toBe("hard");
  });

  it("is none for an easier run, one outside the window or one after the start", () => {
    expect(hardSessionBefore(START, [makeRun("r", before(10), (HARD_RUN_EFFORT - 1) as RunLog["perceivedEffort"])], [])).toBe("none");
    expect(
      hardSessionBefore(START, [makeRun("r", before(HARD_SESSION_WINDOW_HOURS + 1), 5)], [])
    ).toBe("none");
    expect(hardSessionBefore(START, [makeRun("r", before(-1), 5)], [])).toBe("none");
    expect(hardSessionBefore(START, [], [])).toBe("none");
  });

  it("is unknown after a run or session with no rating, except a walk", () => {
    expect(hardSessionBefore(START, [makeRun("r", before(10), null)], [])).toBe("unknown");
    expect(hardSessionBefore(START, [], [makeActivity("a", before(5), null, "cycling")])).toBe("unknown");
    expect(hardSessionBefore(START, [], [makeActivity("a", before(5), null, "walking")])).toBe("none");
  });

  it("a rated hard run wins over an unrated one", () => {
    expect(
      hardSessionBefore(START, [makeRun("r1", before(10), null), makeRun("r2", before(4), 5)], [])
    ).toBe("hard");
  });

  it("ignores deleted rows", () => {
    expect(hardSessionBefore(START, [{ ...makeRun("r", before(10), 5), deletedAt: 1 }], [])).toBe("none");
  });
});

describe("runEvidence", () => {
  it("compares leg sessions after a hard run or session with those without, against expected", () => {
    const out = runEvidence(constructedHistory(NOW), NOW);
    // 24 squat sessions, every third after a hard run; the first squat has no forecast
    // basis problem because every session has a stored forecast.
    expect(out.exposed.count).toBe(8);
    expect(out.reference.count).toBe(16);
    expect(out.result).not.toBeNull();
    expect(out.result!.verdict).toBe("agrees");
    expect(out.result!.difference).toBeLessThan(-1);
  });

  it("reads only lower-body lifts", () => {
    const log = constructedHistory(NOW);
    const benchOnly: PersonalLog = {
      ...log,
      workouts: log.workouts.filter((w) => w.id.startsWith("bench")),
    };
    const out = runEvidence(benchOnly, NOW);
    expect(out.exposed.count + out.reference.count).toBe(0);
  });

  it("hides the numbers below the minimum and says how many more are needed", () => {
    const log = emptyLog();
    for (let i = 0; i < 8; i++) {
      const at = new Date(NOW.getTime() - (20 - 2 * i) * DAY);
      const { workout, forecast } = makeT1Workout({ id: `w${i}`, at, weight: 200, lastReps: 5, expected: 5 });
      log.workouts.push(workout);
      log.forecasts.push(forecast!);
      if (i < 2) log.runs.push(makeRun(`r${i}`, new Date(at.getTime() - 3 * HOUR), 5));
    }
    const out = runEvidence(log, NOW);
    expect(out.result).toBeNull();
    expect(out.exposed.count).toBe(2);
    expect(out.reference.count).toBe(6);
    expect(out.needed).toEqual({ exposed: PERSONAL_MIN_GROUP_SIZE - 2, reference: 0 });
  });

  it("says how a hard session is defined and how results are measured", () => {
    const text = runEvidence(emptyLog(), NOW).method.join(" ");
    expect(text).toContain(`${HARD_SESSION_WINDOW_HOURS} hours`);
    expect(text).toContain(`${HARD_RUN_EFFORT} or more out of 5`);
    expect(text).toMatch(/expected/);
  });
});
