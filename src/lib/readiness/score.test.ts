import { describe, it, expect } from "vitest";
import type { ReadinessScore, SleepHours, StressLevel } from "@/types";
import { getRule, isRuleId } from "@/lib/evidence";
import { REPS_MODEL } from "@/lib/forecast/coefficients";
import { workoutHasLowerBody } from "@/lib/runRecovery";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import {
  mainLiftIsLowerBody,
  readinessLevelShift,
  readinessScore,
  shouldSuggestSkippingAccessories,
  type ReadinessInputs,
} from "./score";
import { READINESS_WEIGHTS as W, formatPoints } from "./weights";
import {
  NOW,
  daysBefore,
  hoursBefore,
  makeActivity,
  makeEntry,
  makeRun,
  makeWorkout,
  templateExerciseIds,
} from "./testUtils";

const A1 = templateExerciseIds("A1"); // squat, bench, lat pulldown
const B1 = templateExerciseIds("B1"); // overhead press, deadlift, dumbbell row
const A2 = templateExerciseIds("A2"); // bench, squat, lat pulldown

const points = (result: ReadinessScore, id: string) =>
  result.contributions.find((c) => c.id === id)?.points;
const row = (result: ReadinessScore, id: string) => {
  const found = result.contributions.find((c) => c.id === id);
  if (!found) throw new Error(`no "${id}" contribution`);
  return found;
};
const sum = (result: ReadinessScore) => result.contributions.reduce((n, c) => n + c.points, 0);
const clamp = (n: number) => Math.min(W.maxScore, Math.max(W.minScore, n));

/** The contract: `usual` plus the points is the score before clamping. */
function expectAddsUp(result: ReadinessScore) {
  expect(result.score).toBe(clamp(result.usual + sum(result)));
  expect(result.score).toBeGreaterThanOrEqual(W.minScore);
  expect(result.score).toBeLessThanOrEqual(W.maxScore);
  for (const c of result.contributions) {
    expect(Number.isInteger(c.points), `${c.id} points`).toBe(true);
    expect(c.label.trim().length, `${c.id} label`).toBeGreaterThan(0);
    expect(c.detail.trim().length, `${c.id} detail`).toBeGreaterThan(0);
    expect(isRuleId(c.ruleId), `${c.id} -> ${c.ruleId}`).toBe(true);
  }
  const ids = result.contributions.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe("readinessScore: nothing known", () => {
  it("with no inputs the score is the usual and nothing moved it", () => {
    const result = readinessScore({}, NOW);
    expect(result).toEqual({
      score: W.defaultUsual,
      usual: W.defaultUsual,
      contributions: [],
      suggestSkippingAccessories: false,
    });
  });

  it("with only past scores the score is their median", () => {
    const result = readinessScore({ pastScores: [60, 64, 66, 70, 90] }, NOW);
    expect(result.usual).toBe(66);
    expect(result.score).toBe(66);
    expect(result.contributions).toEqual([]);
  });
});

describe("readinessScore: the usual", () => {
  it("stays at the default until there are enough past scores", () => {
    const few = Array.from({ length: W.minPastScores - 1 }, () => 50);
    expect(readinessScore({ pastScores: few }, NOW).usual).toBe(W.defaultUsual);
    expect(readinessScore({ pastScores: [...few, 50] }, NOW).usual).toBe(50);
  });

  it("is the median of past scores, as a whole number", () => {
    expect(readinessScore({ pastScores: [70, 60, 80, 62, 75] }, NOW).usual).toBe(70);
    expect(readinessScore({ pastScores: [60, 62, 65, 70, 75, 80] }, NOW).usual).toBe(68); // 67.5
  });

  it("is the baseline the contributions move", () => {
    const result = readinessScore(
      { pastScores: [60, 60, 60, 60, 60], log: { sleepHours: "5-7", stressLevel: "good" } },
      NOW
    );
    expect(result.usual).toBe(60);
    expect(result.score).toBe(60 + W.sleep["5-7"] + W.stress.good);
    expectAddsUp(result);
  });

  it("clamps the score to the range, and the points still explain the unclamped total", () => {
    const high = readinessScore(
      { pastScores: [100, 100, 100, 100, 100], log: { sleepHours: "7+", stressLevel: "good" } },
      NOW
    );
    expect(high.usual + sum(high)).toBe(100 + W.stress.good);
    expect(high.score).toBe(W.maxScore);

    const low = readinessScore(
      { pastScores: [1, 1, 1, 1, 1], log: { sleepHours: "<5", stressLevel: "low" } },
      NOW
    );
    expect(low.usual + sum(low)).toBe(1 + W.sleep["<5"] + W.stress.low);
    expect(low.score).toBe(W.minScore);
  });
});

describe("readinessScore: sleep and energy answers", () => {
  it.each<[SleepHours, string]>([
    ["7+", "Sleep: 7 hours or more"],
    ["5-7", "Sleep: 5 to 7 hours"],
    ["<5", "Sleep: under 5 hours"],
  ])("scores the %s sleep answer", (sleepHours, label) => {
    const result = readinessScore({ log: { sleepHours, stressLevel: "normal" } }, NOW);
    expect(row(result, "sleep")).toMatchObject({
      label,
      points: W.sleep[sleepHours],
      ruleId: "readiness",
    });
    expectAddsUp(result);
  });

  it.each<[StressLevel, string]>([
    ["good", "Energy: good"],
    ["normal", "Energy: normal"],
    ["low", "Energy: low"],
  ])("scores the %s energy answer", (stressLevel, label) => {
    const result = readinessScore({ log: { sleepHours: "7+", stressLevel } }, NOW);
    expect(row(result, "stress")).toMatchObject({
      label,
      points: W.stress[stressLevel],
      ruleId: "readiness",
    });
    expectAddsUp(result);
  });

  it("the low-energy answer costs points and the good one adds them", () => {
    expect(W.stress.low).toBeLessThan(0);
    expect(W.stress.good).toBeGreaterThan(0);
    expect(W.sleep["<5"]).toBeLessThan(W.sleep["5-7"]);
    expect(W.sleep["5-7"]).toBeLessThan(W.sleep["7+"]);
  });

  it("shows measured sleep when it agrees with the answer", () => {
    const result = readinessScore(
      {
        log: {
          sleepHours: "5-7",
          stressLevel: "normal",
          sleepMinutes: 383,
          sleepSource: "apple_health",
        },
      },
      NOW
    );
    expect(row(result, "sleep")).toMatchObject({
      label: "Sleep 6 h 23 m",
      detail: "From Apple Health.",
      points: W.sleep["5-7"],
    });
  });

  it("goes by the answer when the user changed it from the measured value", () => {
    const result = readinessScore(
      { log: { sleepHours: "7+", stressLevel: "normal", sleepMinutes: 383 } },
      NOW
    );
    expect(row(result, "sleep")).toMatchObject({
      label: "Sleep: 7 hours or more",
      points: W.sleep["7+"],
    });
  });

  it("ignores a missing or empty measured value", () => {
    for (const sleepMinutes of [null, undefined, 0]) {
      const result = readinessScore(
        { log: { sleepHours: "<5", stressLevel: "normal", sleepMinutes } },
        NOW
      );
      expect(row(result, "sleep").label).toBe("Sleep: under 5 hours");
    }
  });
});

describe("readinessScore: rest since the muscles were last worked", () => {
  const restFor = (lastWorkout: Date, extra: Partial<ReadinessInputs> = {}) =>
    readinessScore(
      { exerciseIds: A1, workouts: [makeWorkout("w1", lastWorkout, "B2")], ...extra },
      NOW
    );

  it("takes points while the muscles are still recovering", () => {
    const result = restFor(daysBefore(1));
    expect(row(result, "rest-days")).toMatchObject({
      label: "No rest day",
      points: W.rest.recovering,
      ruleId: "recovery-windows",
    });
    expect(row(result, "rest-days").detail).toMatch(/last worked yesterday; still recovering\.$/);
    expectAddsUp(result);
  });

  it("is neutral once they have recovered", () => {
    const result = restFor(daysBefore(2));
    expect(row(result, "rest-days")).toMatchObject({ label: "One rest day", points: W.rest.ready });
    expect(row(result, "rest-days").detail).toMatch(/last worked 2 days ago; recovered\.$/);
  });

  it("adds points when they are fully rested", () => {
    const result = restFor(daysBefore(3));
    expect(row(result, "rest-days")).toMatchObject({
      label: "Two rest days",
      points: W.rest.primed,
    });
    expect(row(result, "rest-days").detail).toMatch(/last worked 3 days ago; fully rested\.$/);
  });

  it("uses the longer recovery times while cutting", () => {
    const maintaining = restFor(daysBefore(2), { phase: { mode: "maintaining" } });
    const cutting = restFor(daysBefore(2), { phase: { mode: "cutting" } });
    expect(points(maintaining, "rest-days")).toBe(W.rest.ready);
    expect(points(cutting, "rest-days")).toBe(W.rest.recovering);
  });

  it("gives a long break no points and says so", () => {
    const result = restFor(daysBefore(30));
    expect(row(result, "rest-days")).toMatchObject({
      label: "Long break",
      points: W.rest.detraining,
    });
    expect(row(result, "rest-days").detail).toContain("30 days ago");
    // The row says a long break counts the same as being recovered.
    expect(row(result, "rest-days").detail).toContain("counts the same as being recovered");
    expect(W.rest.detraining).toBe(W.rest.ready);
  });

  it("names the muscle worked most recently and counts from then", () => {
    // Bench and squat were both trained 2 days ago; only the row muscles 5 days ago.
    const result = readinessScore(
      {
        exerciseIds: A1,
        workouts: [makeWorkout("old", daysBefore(5), "B1"), makeWorkout("recent", daysBefore(2), "A2")],
      },
      NOW
    );
    expect(row(result, "rest-days").label).toBe("One rest day");
    expect(row(result, "rest-days").detail).toMatch(/^Quads last worked 2 days ago/);
  });

  it("says nothing when the muscles were never trained or the workout is unknown", () => {
    expect(points(readinessScore({ exerciseIds: A1, workouts: [] }, NOW), "rest-days")).toBeUndefined();
    expect(
      points(readinessScore({ workouts: [makeWorkout("w1", daysBefore(1))] }, NOW), "rest-days")
    ).toBeUndefined();
    expect(
      points(
        readinessScore({ exerciseIds: ["not-an-exercise"], workouts: [makeWorkout("w1", daysBefore(1))] }, NOW),
        "rest-days"
      )
    ).toBeUndefined();
  });

  it("ignores unfinished workouts and anything after `now`", () => {
    const unfinished = makeWorkout("open", hoursBefore(1), "A1", { completedAt: null });
    const later = makeWorkout("later", new Date(NOW.getTime() + 3_600_000), "A1");
    const result = readinessScore(
      { exerciseIds: A1, workouts: [makeWorkout("w1", daysBefore(3), "B2"), unfinished, later] },
      NOW
    );
    expect(row(result, "rest-days").label).toBe("Two rest days");
  });
});

describe("readinessScore: runs and other sessions", () => {
  it("takes the most for a hard run a few hours before a lower-body day", () => {
    const run = makeRun({ date: hoursBefore(3), perceivedEffort: 4, category: "tempo" });
    const result = readinessScore({ exerciseIds: A1, runs: [run] }, NOW);
    expect(row(result, "run")).toMatchObject({
      label: "Tempo 3 mile run",
      points: W.run.strong,
      ruleId: "run-interference",
    });
    expect(row(result, "run").detail).toMatch(/^3 hours ago, effort 4 of 5\./);
    expectAddsUp(result);
  });

  it("takes less for a run earlier in the last day", () => {
    const run = makeRun({ date: hoursBefore(18), perceivedEffort: 3, distanceMiles: null });
    const result = readinessScore({ exerciseIds: A1, runs: [run] }, NOW);
    expect(row(result, "run")).toMatchObject({
      label: "Tempo run",
      detail: "18 hours ago, effort 3 of 5.",
      points: W.run.advisory,
    });
  });

  it("follows the run check: an easy run, an upper-body day or an old run moves nothing", () => {
    const easy = makeRun({ category: "easy", perceivedEffort: 2 });
    expect(points(readinessScore({ exerciseIds: A1, runs: [easy] }, NOW), "run")).toBeUndefined();
    const hard = makeRun({ date: hoursBefore(3), perceivedEffort: 5 });
    expect(points(readinessScore({ exerciseIds: A2, runs: [hard] }, NOW), "run")).toBeUndefined();
    const old = makeRun({ date: hoursBefore(30), perceivedEffort: 5 });
    expect(points(readinessScore({ exerciseIds: A1, runs: [old] }, NOW), "run")).toBeUndefined();
  });

  it("ignores a run dated after `now`", () => {
    const future = makeRun({ date: new Date(NOW.getTime() + 2 * 3_600_000), perceivedEffort: 5 });
    expect(points(readinessScore({ exerciseIds: A1, runs: [future] }, NOW), "run")).toBeUndefined();
  });

  it("takes points for another hard session in the last day", () => {
    const result = readinessScore({ exerciseIds: A2, activities: [makeActivity()] }, NOW);
    expect(row(result, "activity")).toMatchObject({
      label: "Hard session: power yoga",
      detail: "14 hours ago, effort 4 of 5.",
      points: W.hardActivity,
      ruleId: "activity-fatigue",
    });
    expectAddsUp(result);
  });

  it("follows the activity check: leg-only sessions count only before a lower-body day", () => {
    const ride = makeActivity({ kind: "cycling", style: null, perceivedEffort: 5 });
    expect(points(readinessScore({ exerciseIds: A2, activities: [ride] }, NOW), "activity")).toBeUndefined();
    expect(points(readinessScore({ exerciseIds: A1, activities: [ride] }, NOW), "activity")).toBe(
      W.hardActivity
    );
    const gentle = makeActivity({ perceivedEffort: 3 });
    expect(points(readinessScore({ exerciseIds: A1, activities: [gentle] }, NOW), "activity")).toBeUndefined();
  });
});

describe("readinessScore: soreness and pain", () => {
  it("takes points for soreness where today's workout loads the body", () => {
    const result = readinessScore({ exerciseIds: A1, painEntries: [makeEntry()] }, NOW);
    expect(row(result, "soreness")).toMatchObject({
      label: "Sore left quad: mild",
      detail: "Body check, 20 hours ago.",
      points: 2 * W.sorenessPerSeverity,
      ruleId: "readiness-score",
    });
    expectAddsUp(result);
  });

  it("caps what soreness can take", () => {
    const result = readinessScore(
      { exerciseIds: A1, painEntries: [makeEntry({ severity: 5 })] },
      NOW
    );
    expect(points(result, "soreness")).toBe(W.sorenessFloor);
  });

  it("drops soreness once it is older than its window, and anything logged after `now`", () => {
    const old = makeEntry({ date: hoursBefore(W.sorenessWindowHours + 1) });
    expect(points(readinessScore({ exerciseIds: A1, painEntries: [old] }, NOW), "soreness")).toBeUndefined();
    const future = makeEntry({ date: new Date(NOW.getTime() + 60_000) });
    expect(points(readinessScore({ exerciseIds: A1, painEntries: [future] }, NOW), "soreness")).toBeUndefined();
  });

  it("ignores soreness in a part of the body today's workout does not use", () => {
    const hamstring = makeEntry({ region: "left_hamstring" });
    // The overhead press alone does not work the hamstrings.
    expect(
      points(readinessScore({ exerciseIds: ["ohp"], painEntries: [hamstring] }, NOW), "soreness")
    ).toBeUndefined();
    expect(points(readinessScore({ exerciseIds: B1, painEntries: [hamstring] }, NOW), "soreness")).toBe(
      2 * W.sorenessPerSeverity
    );
    expect(points(readinessScore({ painEntries: [hamstring] }, NOW), "soreness")).toBeUndefined();
  });

  it("takes points for pain, citing the pain rule", () => {
    const pain = makeEntry({ sensation: "pain", region: "lower_back", severity: 3, date: daysBefore(2) });
    const result = readinessScore({ exerciseIds: A1, painEntries: [pain] }, NOW);
    expect(row(result, "pain")).toMatchObject({
      label: "Lower back pain: moderate",
      detail: "Body check, 2 days ago.",
      points: 3 * W.painPerSeverity,
      ruleId: "training-with-pain",
    });
    expect(points(result, "soreness")).toBeUndefined();
    expectAddsUp(result);
  });

  it("counts pain at a joint the lift loads, and caps what pain can take", () => {
    const knee = makeEntry({ sensation: "pain", region: "right_knee", severity: 5 });
    const result = readinessScore({ exerciseIds: A1, painEntries: [knee] }, NOW);
    expect(points(result, "pain")).toBe(W.painFloor);
    expect(points(readinessScore({ exerciseIds: ["ohp"], painEntries: [knee] }, NOW), "pain")).toBeUndefined();
  });

  it("drops pain once it is older than its window", () => {
    const old = makeEntry({ sensation: "pain", region: "lower_back", date: daysBefore(W.painWindowDays + 1) });
    expect(points(readinessScore({ exerciseIds: A1, painEntries: [old] }, NOW), "pain")).toBeUndefined();
  });

  it("uses the worst entry of each kind, once", () => {
    const result = readinessScore(
      {
        exerciseIds: A1,
        painEntries: [
          makeEntry({ id: "s1", severity: 1 }),
          makeEntry({ id: "s2", severity: 3, region: "right_quad" }),
          makeEntry({ id: "p1", sensation: "pain", region: "lower_back", severity: 1 }),
          makeEntry({ id: "p2", sensation: "pain", region: "left_knee", severity: 2 }),
        ],
      },
      NOW
    );
    expect(row(result, "soreness")).toMatchObject({
      label: "Sore right quad: moderate",
      points: 3 * W.sorenessPerSeverity,
    });
    expect(row(result, "pain")).toMatchObject({
      label: "Left knee pain: mild",
      points: 2 * W.painPerSeverity,
    });
    expectAddsUp(result);
  });
});

describe("readinessScore: points measured against the user's own usual", () => {
  const past = [66, 66, 66, 70, 66];

  it("an ordinary day scores the usual, with every row at zero", () => {
    const result = readinessScore(
      {
        exerciseIds: A1,
        workouts: [makeWorkout("w1", daysBefore(1), "B2")],
        log: { sleepHours: "7+", stressLevel: "normal" },
        pastScores: past,
        usualPoints: { "rest-days": W.rest.recovering },
      },
      NOW
    );
    expect(result.usual).toBe(66);
    expect(result.score).toBe(66);
    expect(result.contributions.every((c) => c.points === 0)).toBe(true);
    expect(row(result, "rest-days").detail).toContain(
      `This is usually ${formatPoints(W.rest.recovering)} for you, so only the difference counts.`
    );
    expectAddsUp(result);
  });

  it("a day that differs from the usual moves by the difference", () => {
    const result = readinessScore(
      {
        exerciseIds: A1,
        workouts: [makeWorkout("w1", daysBefore(3), "B2")],
        log: { sleepHours: "5-7", stressLevel: "normal" },
        pastScores: past,
        usualPoints: { "rest-days": W.rest.recovering, sleep: W.sleep["5-7"] },
      },
      NOW
    );
    expect(points(result, "rest-days")).toBe(W.rest.primed - W.rest.recovering);
    expect(points(result, "sleep")).toBe(0);
    expect(result.score).toBe(66 + W.rest.primed - W.rest.recovering);
    expectAddsUp(result);
  });

  it("gives back the usual cost of something that did not happen today", () => {
    const result = readinessScore(
      { exerciseIds: A1, pastScores: past, usualPoints: { run: W.run.advisory, soreness: -2 } },
      NOW
    );
    expect(row(result, "run")).toMatchObject({
      label: "No recent run",
      points: -W.run.advisory,
      ruleId: "run-interference",
    });
    expect(row(result, "soreness")).toMatchObject({
      label: "No soreness logged",
      points: 2,
      ruleId: "readiness-score",
    });
    expect(result.score).toBe(66 - W.run.advisory + 2);
    expectAddsUp(result);
  });

  it("assumes the usual for an answer that was not given", () => {
    const result = readinessScore(
      { exerciseIds: A1, pastScores: past, usualPoints: { sleep: W.sleep["5-7"], stress: W.stress.good } },
      NOW
    );
    expect(result.contributions).toEqual([]);
    expect(result.score).toBe(66);
  });

  it("ignores usual points until there are enough past scores", () => {
    const result = readinessScore(
      {
        log: { sleepHours: "5-7", stressLevel: "normal" },
        pastScores: [66, 66],
        usualPoints: { sleep: W.sleep["5-7"], run: W.run.advisory },
      },
      NOW
    );
    expect(result.usual).toBe(W.defaultUsual);
    expect(points(result, "sleep")).toBe(W.sleep["5-7"]);
    expect(points(result, "run")).toBeUndefined();
    expectAddsUp(result);
  });
});

describe("readinessScore: the whole result", () => {
  const busyDay: ReadinessInputs = {
    exerciseIds: A1,
    phase: { mode: "cutting" },
    log: { sleepHours: "5-7", stressLevel: "good" },
    workouts: [makeWorkout("w1", daysBefore(4), "B2")],
    runs: [makeRun({ date: hoursBefore(19), perceivedEffort: 3 })],
    activities: [makeActivity()],
    painEntries: [makeEntry(), makeEntry({ id: "p", sensation: "pain", region: "lower_back", severity: 1 })],
  };

  it("adds every input to the usual", () => {
    const result = readinessScore(busyDay, NOW);
    const expected =
      W.rest.primed +
      W.stress.good +
      W.sleep["5-7"] +
      W.run.advisory +
      W.hardActivity +
      2 * W.sorenessPerSeverity +
      W.painPerSeverity;
    expect(result.usual).toBe(W.defaultUsual);
    expect(sum(result)).toBe(expected);
    expect(result.score).toBe(W.defaultUsual + expected);
    expect(result.contributions.map((c) => c.id).sort()).toEqual(
      ["activity", "pain", "rest-days", "run", "sleep", "soreness", "stress"].sort()
    );
    expectAddsUp(result);
  });

  it("lists the biggest movers first", () => {
    const sizes = readinessScore(busyDay, NOW).contributions.map((c) => Math.abs(c.points));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it("every contribution cites a real rule: the rule of its input, or this one where none exists", () => {
    const cited = Object.fromEntries(
      readinessScore(busyDay, NOW).contributions.map((c) => [c.id, c.ruleId])
    );
    expect(cited).toEqual({
      sleep: "readiness",
      stress: "readiness",
      "rest-days": "recovery-windows",
      run: "run-interference",
      activity: "activity-fatigue",
      pain: "training-with-pain",
      soreness: "readiness-score",
    });
    for (const id of Object.values(cited)) expect(isRuleId(id), id).toBe(true);
    // Soreness has no rule of its own, so it must not borrow a research grade.
    expect(getRule("readiness-score").strength).toBe("heuristic");
  });

  it("adds up for every combination of answers, rest, runs, soreness and history", () => {
    const sleeps: (SleepHours | null)[] = [null, "7+", "5-7", "<5"];
    const energies: StressLevel[] = ["good", "normal", "low"];
    const restDays = [null, 1, 2, 3, 30];
    const histories: Pick<ReadinessInputs, "pastScores" | "usualPoints">[] = [
      {},
      { pastScores: [55, 61, 64, 68, 72, 90] },
      { pastScores: [62, 62, 66, 66, 70], usualPoints: { "rest-days": -4, sleep: -3, run: -2, pain: -2 } },
    ];
    let cases = 0;
    for (const sleepHours of sleeps)
      for (const stressLevel of energies)
        for (const rest of restDays)
          for (const history of histories)
            for (const busy of [false, true]) {
              const result = readinessScore(
                {
                  exerciseIds: busy ? B1 : A1,
                  phase: { mode: busy ? "cutting" : "maintaining" },
                  log: sleepHours ? { sleepHours, stressLevel } : null,
                  workouts: rest === null ? [] : [makeWorkout("w", daysBefore(rest), "B2")],
                  runs: busy ? [makeRun({ date: hoursBefore(4), perceivedEffort: 5 })] : [],
                  activities: busy ? [makeActivity()] : [],
                  painEntries: busy
                    ? [
                        makeEntry({ region: "lower_back", severity: 4 }),
                        makeEntry({ id: "p", sensation: "pain", region: "lower_back", severity: 5 }),
                      ]
                    : [],
                  ...history,
                },
                NOW
              );
              expectAddsUp(result);
              cases += 1;
            }
    expect(cases).toBe(4 * 3 * 5 * 3 * 2);
  });

  it("never carries a weight: only the score, the usual, the rows and the accessory hint", () => {
    const result = readinessScore(busyDay, NOW);
    expect(Object.keys(result).sort()).toEqual(
      ["contributions", "score", "suggestSkippingAccessories", "usual"].sort()
    );
    for (const c of result.contributions) {
      expect(Object.keys(c).sort()).toEqual(["detail", "id", "label", "points", "ruleId"].sort());
      expect(`${c.label} ${c.detail}`).not.toMatch(/\blbs?\b|weight/i);
    }
  });

  it("is repeatable and does not change its inputs", () => {
    const frozen = JSON.stringify(busyDay);
    expect(readinessScore(busyDay, NOW)).toEqual(readinessScore(busyDay, NOW));
    expect(JSON.stringify(busyDay)).toBe(frozen);
  });

  it("reports the accessory hint from the answers", () => {
    expect(
      readinessScore({ log: { sleepHours: "<5", stressLevel: "low" } }, NOW).suggestSkippingAccessories
    ).toBe(true);
    expect(
      readinessScore({ log: { sleepHours: "<5", stressLevel: "normal" } }, NOW).suggestSkippingAccessories
    ).toBe(false);
    // A low score alone never triggers it.
    expect(
      readinessScore(
        { pastScores: [10, 10, 10, 10, 10], log: { sleepHours: "5-7", stressLevel: "low" } },
        NOW
      ).suggestSkippingAccessories
    ).toBe(false);
  });
});

describe("shouldSuggestSkippingAccessories", () => {
  it("is true only for under 5 hours of sleep together with low energy", () => {
    const sleeps: (SleepHours | null)[] = ["<5", "5-7", "7+", null];
    const energies: (StressLevel | null)[] = ["low", "normal", "good", null];
    for (const sleepHours of sleeps)
      for (const stressLevel of energies) {
        // The rule as written in PreWorkout/ReadinessCheck.tsx.
        const inline = sleepHours === "<5" && stressLevel === "low";
        expect(shouldSuggestSkippingAccessories({ sleepHours, stressLevel })).toBe(inline);
      }
  });

  it("is false with no answers", () => {
    expect(shouldSuggestSkippingAccessories(null)).toBe(false);
    expect(shouldSuggestSkippingAccessories(undefined)).toBe(false);
  });
});

describe("readinessLevelShift", () => {
  const score = (value: number, usual: number): ReadinessScore => ({
    score: value,
    usual,
    contributions: [],
    suggestSkippingAccessories: false,
  });

  it("is zero on a usual day", () => {
    expect(readinessLevelShift(score(72, 72))).toBe(0);
  });

  it("moves the level by the forecast coefficient for each point from the usual", () => {
    expect(readinessLevelShift(score(78, 72))).toBeCloseTo(6 * REPS_MODEL.readinessLevelShiftPerPoint, 12);
    expect(readinessLevelShift(score(60, 72))).toBeCloseTo(-12 * REPS_MODEL.readinessLevelShiftPerPoint, 12);
  });

  it("is a small fraction even at the extremes", () => {
    expect(Math.abs(readinessLevelShift(score(W.minScore, W.maxScore)))).toBeLessThan(0.1);
  });
});

describe("mainLiftIsLowerBody", () => {
  it("agrees with the run check for every program workout", () => {
    for (const templateId of Object.keys(WORKOUT_TEMPLATES)) {
      expect(mainLiftIsLowerBody(templateExerciseIds(templateId)), templateId).toBe(
        workoutHasLowerBody(templateId)
      );
    }
  });

  it("is false for an empty or unknown workout", () => {
    expect(mainLiftIsLowerBody([])).toBe(false);
    expect(mainLiftIsLowerBody(["not-an-exercise"])).toBe(false);
  });
});

describe("READINESS_WEIGHTS", () => {
  it("keeps every point value modest and whole", () => {
    const values = [
      ...Object.values(W.sleep),
      ...Object.values(W.stress),
      ...Object.values(W.rest),
      ...Object.values(W.run),
      W.hardActivity,
      W.sorenessPerSeverity,
      W.sorenessFloor,
      W.painPerSeverity,
      W.painFloor,
    ];
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(8);
    }
  });

  it("formats points with a sign", () => {
    expect(formatPoints(4)).toBe("+4");
    expect(formatPoints(-3)).toBe("−3");
    expect(formatPoints(0)).toBe("0");
  });
});
