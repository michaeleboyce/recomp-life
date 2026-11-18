// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CUTTING_RECOVERY_BONUS_HOURS, RECOVERY_HOURS } from "@/lib/recovery";
import { makeSet } from "@/lib/workout/testFixtures";
import { muscleReadyTimes } from "./muscleReady";
import { settingsIn, makeT1Session } from "./testHelpers";

const HOUR = 60 * 60 * 1000;
const AT = new Date("2026-11-12T17:00:00Z");
const NOW = new Date(AT.getTime() + 30 * HOUR);
const maintaining = settingsIn("maintaining").trainingPhase;
const cutting = settingsIn("cutting").trainingPhase;

describe("when the muscles of the last workout are ready again", () => {
  const squatDay = makeT1Session({ id: "w1", at: AT, weight: 200, lastReps: 5 });

  it("reads the recovery windows from when each was last trained", () => {
    const explanation = muscleReadyTimes([squatDay], maintaining, NOW)!;
    expect(explanation.workoutId).toBe("w1");
    expect(explanation.bonusHours).toBe(0);
    const quads = explanation.muscles.find((m) => m.muscle === "quads")!;
    expect(quads.label).toBeTruthy();
    expect(quads.trainedAt).toBe(AT.getTime());
    expect(quads.readyAt).toBe(AT.getTime() + RECOVERY_HOURS.ready * HOUR);
    expect(quads.primedAt).toBe(AT.getTime() + RECOVERY_HOURS.primed * HOUR);
    expect(quads.status).toBe("recovering");
  });

  it("adds the cutting hours while cutting", () => {
    const explanation = muscleReadyTimes([squatDay], cutting, NOW)!;
    expect(explanation.bonusHours).toBe(CUTTING_RECOVERY_BONUS_HOURS);
    const quads = explanation.muscles.find((m) => m.muscle === "quads")!;
    expect(quads.readyAt).toBe(AT.getTime() + (RECOVERY_HOURS.ready + CUTTING_RECOVERY_BONUS_HOURS) * HOUR);
  });

  it("lists only the main muscles of the main lifts, soonest first", () => {
    const withAccessory = {
      ...squatDay,
      sets: [...squatDay.sets, makeSet("lat_pulldown", "T3", { actualReps: 15, weight: 90 })],
    };
    const explanation = muscleReadyTimes([withAccessory], maintaining, NOW)!;
    expect(explanation.muscles.some((m) => m.muscle === "lats")).toBe(false);
    const ready = explanation.muscles.map((m) => m.readyAt);
    expect(ready).toEqual([...ready].sort((a, b) => a - b));
  });

  it("has nothing to say without a finished workout with a main lift", () => {
    expect(muscleReadyTimes([], maintaining, NOW)).toBeNull();
    expect(muscleReadyTimes([{ ...squatDay, completedAt: null }], maintaining, NOW)).toBeNull();
    expect(muscleReadyTimes([squatDay], maintaining, new Date(AT.getTime() - HOUR))).toBeNull();
  });
});
