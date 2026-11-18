import { describe, expect, it } from "vitest";
import { SLEEP_FULL_HOURS } from "@/lib/health/sleep";
import { PERSONAL_MIN_GROUP_SIZE } from "./constants";
import { checkInFor, sleepEvidence } from "./sleep";
import { DAY, makeCheckIn, constructedHistory, emptyLog, makeT1Workout } from "./testHelpers";

const NOW = new Date("2026-11-15T12:00:00Z");

describe("checkInFor", () => {
  it("finds the live check-in of a workout, the latest when there are several", () => {
    const at = new Date("2026-11-10T17:00:00Z");
    const logs = [
      { ...makeCheckIn("a", "w1", at, "7+"), updatedAt: 1 },
      { ...makeCheckIn("b", "w1", at, "<5"), updatedAt: 2 },
      { ...makeCheckIn("c", "w1", at, "5-7"), updatedAt: 3, deletedAt: 4 },
      makeCheckIn("d", "w2", at, "7+"),
    ];
    expect(checkInFor(logs).get("w1")?.id).toBe("b");
    expect(checkInFor(logs).get("w2")?.id).toBe("d");
  });
});

describe("sleepEvidence", () => {
  it("compares sessions after under 5 or 5 to 7 hours with those after 7 or more, against expected", () => {
    const out = sleepEvidence(constructedHistory(NOW), NOW);
    // 48 sessions, every fourth round of both lifts after short sleep.
    expect(out.exposed.count).toBe(12);
    expect(out.reference.count).toBe(36);
    expect(out.result!.verdict).toBe("agrees");
    expect(out.result!.difference).toBeLessThan(-1);
  });

  it("leaves out sessions with no check-in", () => {
    const log = constructedHistory(NOW);
    const out = sleepEvidence({ ...log, readinessLogs: [] }, NOW);
    expect(out.exposed.count + out.reference.count).toBe(0);
    expect(out.result).toBeNull();
    expect(out.needed).toEqual({ exposed: PERSONAL_MIN_GROUP_SIZE, reference: PERSONAL_MIN_GROUP_SIZE });
  });

  it("counts both short answers as short sleep", () => {
    const log = emptyLog();
    const answers = ["<5", "5-7", "7+", "<5", "5-7", "7+"] as const;
    answers.forEach((answer, i) => {
      const at = new Date(NOW.getTime() - (20 - 2 * i) * DAY);
      const { workout, forecast } = makeT1Workout({ id: `w${i}`, at, weight: 200, lastReps: 5, expected: 5 });
      log.workouts.push(workout);
      log.forecasts.push(forecast!);
      log.readinessLogs.push(makeCheckIn(`c${i}`, `w${i}`, at, answer));
    });
    const out = sleepEvidence(log, NOW);
    expect(out.exposed.count).toBe(4);
    expect(out.reference.count).toBe(2);
    expect(out.result).toBeNull();
  });

  it("names the groups with the app's own sleep thresholds", () => {
    const out = sleepEvidence(emptyLog(), NOW);
    expect(out.exposed.name).toContain(`under ${SLEEP_FULL_HOURS} hours`);
    expect(out.reference.name).toContain(`${SLEEP_FULL_HOURS} hours or more`);
  });
});
