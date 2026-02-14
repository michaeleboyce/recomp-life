import { describe, it, expect } from "vitest";
import {
  calculateRecoveryStatus,
  getRecoveryState,
  shouldSuggestRampUp,
  generateRampUpSuggestion,
  adjustRecoveryForRun,
  getMostRecent,
} from "./recovery";
import type { TrainingPhase, RecoveryStatus, RunLog } from "@/types";

// Helpers for creating dates relative to "now"
function hoursAgo(hours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

const maintainingPhase: TrainingPhase = { mode: "maintaining" };
const cuttingPhase: TrainingPhase = { mode: "cutting" };
const bulkingPhase: TrainingPhase = { mode: "bulking" };

const NOW = new Date("2026-02-14T12:00:00Z");

describe("getMostRecent", () => {
  it("returns the more recent of two dates", () => {
    const older = new Date("2026-02-10");
    const newer = new Date("2026-02-12");
    expect(getMostRecent(older, newer)).toEqual(newer);
  });

  it("returns the non-null date when one is null", () => {
    const d = new Date("2026-02-10");
    expect(getMostRecent(d, null)).toEqual(d);
    expect(getMostRecent(null, d)).toEqual(d);
  });

  it("returns null when both are null", () => {
    expect(getMostRecent(null, null)).toBeNull();
  });
});

describe("calculateRecoveryStatus", () => {
  describe("maintaining/bulking phase (standard thresholds)", () => {
    it("returns 'recovering' when lift trained <48h ago", () => {
      const lastT1 = hoursAgo(24, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "recovering"
      );
    });

    it("returns 'recovering' at exactly 0 hours", () => {
      expect(
        calculateRecoveryStatus(NOW, null, NOW, maintainingPhase)
      ).toBe("recovering");
    });

    it("returns 'ready' when lift trained 48-72h ago", () => {
      const lastT1 = hoursAgo(60, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "ready"
      );
    });

    it("returns 'ready' at exactly 48h", () => {
      const lastT1 = hoursAgo(48, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "ready"
      );
    });

    it("returns 'primed' when lift trained 72-120h ago", () => {
      const lastT1 = hoursAgo(96, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "primed"
      );
    });

    it("returns 'primed' at exactly 72h", () => {
      const lastT1 = hoursAgo(72, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "primed"
      );
    });

    it("returns 'ready' when lift trained 120-168h ago (past peak but not detraining)", () => {
      const lastT1 = hoursAgo(140, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "ready"
      );
    });

    it("returns 'ready' at exactly 120h", () => {
      const lastT1 = hoursAgo(120, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "ready"
      );
    });

    it("returns 'detraining' when lift not trained in 7+ days (168h+)", () => {
      const lastT1 = hoursAgo(200, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "detraining"
      );
    });

    it("returns 'detraining' at exactly 168h", () => {
      const lastT1 = hoursAgo(168, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, maintainingPhase)).toBe(
        "detraining"
      );
    });

    it("returns 'detraining' when lift never trained (null dates)", () => {
      expect(
        calculateRecoveryStatus(null, null, NOW, maintainingPhase)
      ).toBe("detraining");
    });
  });

  describe("cutting phase (+12h bonus to all thresholds)", () => {
    it("returns 'recovering' when <60h in cutting (48+12)", () => {
      const lastT1 = hoursAgo(55, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, cuttingPhase)).toBe(
        "recovering"
      );
    });

    it("returns 'ready' at 60h in cutting (48+12)", () => {
      const lastT1 = hoursAgo(60, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, cuttingPhase)).toBe(
        "ready"
      );
    });

    it("returns 'primed' at 84h in cutting (72+12)", () => {
      const lastT1 = hoursAgo(84, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, cuttingPhase)).toBe(
        "primed"
      );
    });

    it("returns 'ready' at 132h in cutting (120+12)", () => {
      const lastT1 = hoursAgo(132, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, cuttingPhase)).toBe(
        "ready"
      );
    });

    it("returns 'detraining' at 180h in cutting (168+12)", () => {
      const lastT1 = hoursAgo(180, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, cuttingPhase)).toBe(
        "detraining"
      );
    });

    it("still returns 'recovering' at 48h when cutting (would be 'ready' in maintaining)", () => {
      const lastT1 = hoursAgo(48, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, cuttingPhase)).toBe(
        "recovering"
      );
    });
  });

  describe("bulking phase uses standard thresholds", () => {
    it("returns 'ready' at 48h in bulking (same as maintaining)", () => {
      const lastT1 = hoursAgo(48, NOW);
      expect(calculateRecoveryStatus(lastT1, null, NOW, bulkingPhase)).toBe(
        "ready"
      );
    });
  });

  describe("uses most recent of T1 and T2 dates", () => {
    it("uses T2 date when it is more recent than T1", () => {
      const oldT1 = hoursAgo(200, NOW); // detraining range
      const recentT2 = hoursAgo(24, NOW); // recovering range
      expect(
        calculateRecoveryStatus(oldT1, recentT2, NOW, maintainingPhase)
      ).toBe("recovering");
    });

    it("uses T1 date when it is more recent than T2", () => {
      const recentT1 = hoursAgo(50, NOW); // ready range
      const oldT2 = hoursAgo(200, NOW); // detraining range
      expect(
        calculateRecoveryStatus(recentT1, oldT2, NOW, maintainingPhase)
      ).toBe("ready");
    });
  });
});

describe("getRecoveryState", () => {
  it("returns a full RecoveryState object with correct fields", () => {
    const t1Date = daysAgo(3, NOW);
    const t2Date = daysAgo(1, NOW);
    const result = getRecoveryState("squat", t1Date, t2Date, NOW, maintainingPhase);

    expect(result.exerciseId).toBe("squat");
    expect(result.lastTrainedAsT1).toEqual(t1Date);
    expect(result.lastTrainedAsT2).toEqual(t2Date);
    expect(result.daysSinceLastT1).toBeCloseTo(3, 0);
    expect(result.daysSinceLastT2).toBeCloseTo(1, 0);
    // Most recent is T2 at 1 day ago = 24h => recovering
    expect(result.recoveryStatus).toBe("recovering");
  });

  it("handles null T1 date", () => {
    const t2Date = hoursAgo(96, NOW);
    const result = getRecoveryState("bench", null, t2Date, NOW, maintainingPhase);

    expect(result.lastTrainedAsT1).toBeNull();
    expect(result.daysSinceLastT1).toBe(Infinity);
    expect(result.recoveryStatus).toBe("primed");
  });

  it("handles null T2 date", () => {
    const t1Date = hoursAgo(60, NOW);
    const result = getRecoveryState("ohp", t1Date, null, NOW, maintainingPhase);

    expect(result.lastTrainedAsT2).toBeNull();
    expect(result.daysSinceLastT2).toBe(Infinity);
    expect(result.recoveryStatus).toBe("ready");
  });

  it("handles both dates null (never trained)", () => {
    const result = getRecoveryState("deadlift", null, null, NOW, maintainingPhase);

    expect(result.daysSinceLastT1).toBe(Infinity);
    expect(result.daysSinceLastT2).toBe(Infinity);
    expect(result.recoveryStatus).toBe("detraining");
  });
});

describe("shouldSuggestRampUp", () => {
  it("returns true when lift not trained in 14+ days", () => {
    expect(shouldSuggestRampUp(14)).toBe(true);
    expect(shouldSuggestRampUp(21)).toBe(true);
  });

  it("returns false when lift trained within 14 days", () => {
    expect(shouldSuggestRampUp(10)).toBe(false);
    expect(shouldSuggestRampUp(13)).toBe(false);
  });

  it("returns true at exactly 14 days", () => {
    expect(shouldSuggestRampUp(14)).toBe(true);
  });
});

describe("generateRampUpSuggestion", () => {
  it("calculates 85% and rounds to nearest 5 (190 -> 160)", () => {
    const result = generateRampUpSuggestion(190);
    // 190 * 0.85 = 161.5 -> rounds to 160
    expect(result.rampUpWeight).toBe(160);
    expect(result.message).toContain("160");
  });

  it("calculates 85% and rounds to nearest 5 (200 -> 170)", () => {
    const result = generateRampUpSuggestion(200);
    // 200 * 0.85 = 170 -> exactly 170
    expect(result.rampUpWeight).toBe(170);
  });

  it("calculates 85% and rounds to nearest 5 (135 -> 115)", () => {
    const result = generateRampUpSuggestion(135);
    // 135 * 0.85 = 114.75 -> rounds to 115
    expect(result.rampUpWeight).toBe(115);
  });

  it("handles small weights (45 -> 40)", () => {
    const result = generateRampUpSuggestion(45);
    // 45 * 0.85 = 38.25 -> rounds to 40
    expect(result.rampUpWeight).toBe(40);
  });

  it("returns a descriptive message", () => {
    const result = generateRampUpSuggestion(190);
    expect(result.message).toBeTruthy();
    expect(typeof result.message).toBe("string");
  });
});

describe("adjustRecoveryForRun", () => {
  function makeRunLog(
    hoursAgoValue: number,
    effort: 1 | 2 | 3 | 4 | 5
  ): RunLog {
    return {
      id: "run-1",
      clientId: "client-1",
      date: hoursAgo(hoursAgoValue, NOW),
      durationMinutes: 30,
      distanceMiles: 3,
      type: "outdoor",
      category: "easy",
      notes: "",
      perceivedEffort: effort,
      synced: false,
    };
  }

  it("downgrades 'primed' to 'ready' when run with effort >= 3 within 24h", () => {
    const runs = [makeRunLog(12, 3)];
    expect(adjustRecoveryForRun("primed", runs, NOW)).toBe("ready");
  });

  it("downgrades 'ready' to 'recovering' when run with effort >= 3 within 24h", () => {
    const runs = [makeRunLog(12, 4)];
    expect(adjustRecoveryForRun("ready", runs, NOW)).toBe("recovering");
  });

  it("does not downgrade 'recovering' (already lowest active state)", () => {
    const runs = [makeRunLog(12, 5)];
    expect(adjustRecoveryForRun("recovering", runs, NOW)).toBe("recovering");
  });

  it("does not downgrade 'detraining' (separate concern)", () => {
    const runs = [makeRunLog(12, 5)];
    expect(adjustRecoveryForRun("detraining", runs, NOW)).toBe("detraining");
  });

  it("does not affect recovery when run effort is < 3", () => {
    const runs = [makeRunLog(12, 2)];
    expect(adjustRecoveryForRun("primed", runs, NOW)).toBe("primed");
  });

  it("does not affect recovery when run effort is 1", () => {
    const runs = [makeRunLog(12, 1)];
    expect(adjustRecoveryForRun("ready", runs, NOW)).toBe("ready");
  });

  it("does not affect recovery when run is older than 24h", () => {
    const runs = [makeRunLog(30, 5)];
    expect(adjustRecoveryForRun("primed", runs, NOW)).toBe("primed");
  });

  it("considers the most impactful run within 24h", () => {
    const runs = [
      makeRunLog(30, 5), // older than 24h - ignored
      makeRunLog(12, 3), // within 24h, effort >= 3 - triggers downgrade
    ];
    expect(adjustRecoveryForRun("primed", runs, NOW)).toBe("ready");
  });

  it("handles empty run array", () => {
    expect(adjustRecoveryForRun("primed", [], NOW)).toBe("primed");
  });
});
