import { describe, it, expect } from "vitest";
import type { ReadinessLog, ReadinessScore, TrainingPhase, WorkoutSession } from "@/types";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { readinessScore, type ReadinessAnswers } from "./score";
import { readinessFromRecords, readinessUsual, type ReadinessRecords } from "./usual";
import { READINESS_WEIGHTS as W } from "./weights";
import {
  NOW,
  hoursBefore,
  makeActivity,
  makeEntry,
  makeLog,
  makeRun,
  makeWorkout,
  templateExerciseIds,
} from "./testUtils";

const ROTATION = ["A1", "B1", "A2", "B2"];
const CUTTING: TrainingPhase = { mode: "cutting" };
const MAINTAINING: TrainingPhase = { mode: "maintaining" };

const sum = (result: ReadinessScore) => result.contributions.reduce((n, c) => n + c.points, 0);
const points = (result: ReadinessScore, id: string) =>
  result.contributions.find((c) => c.id === id)?.points;

/**
 * `count` finished workouts `gapHours` apart, the last one `gapHours` before NOW,
 * each with the same answers logged a moment after it started (as the app does).
 */
function routine(
  count: number,
  answers: ReadinessAnswers = { sleepHours: "7+", stressLevel: "normal" },
  gapHours = 48
): { workouts: WorkoutSession[]; readinessLogs: ReadinessLog[] } {
  const workouts: WorkoutSession[] = [];
  const readinessLogs: ReadinessLog[] = [];
  for (let i = 0; i < count; i++) {
    const startedAt = hoursBefore(gapHours * (count - i));
    const id = `w${i + 1}`;
    workouts.push(makeWorkout(id, startedAt, ROTATION[i % ROTATION.length]));
    readinessLogs.push(makeLog(id, new Date(startedAt.getTime() + 5), answers));
  }
  return { workouts, readinessLogs };
}

const records = (
  partial: Partial<ReadinessRecords> & Pick<ReadinessRecords, "workouts" | "readinessLogs">,
  phase: TrainingPhase = MAINTAINING
): ReadinessRecords => ({ runs: [], activities: [], painEntries: [], phase, ...partial });

/** The workout that follows `count` workouts of the rotation. */
const nextExercises = (count: number) => templateExerciseIds(ROTATION[count % ROTATION.length]);

describe("readinessUsual", () => {
  it("has nothing to say without history", () => {
    expect(readinessUsual(records({ workouts: [], readinessLogs: [] }), NOW)).toEqual({
      pastScores: [],
      usualPoints: {},
    });
  });

  it("scores each earlier check-in from the default baseline, from what was known then", () => {
    // 48 hours between workouts while cutting: every check-in but the first is "still recovering".
    const history = routine(6, { sleepHours: "5-7", stressLevel: "normal" });
    const usual = readinessUsual(records(history, CUTTING), NOW);
    const ordinary = W.defaultUsual + W.sleep["5-7"] + W.rest.recovering;
    expect(usual.pastScores).toEqual([
      W.defaultUsual + W.sleep["5-7"], // nothing trained before the first one
      ordinary,
      ordinary,
      ordinary,
      ordinary,
      ordinary,
    ]);
    expect(usual.usualPoints).toEqual({
      sleep: W.sleep["5-7"],
      "rest-days": W.rest.recovering,
    });
  });

  it("leaves out inputs that are usually neutral", () => {
    const usual = readinessUsual(records(routine(8)), NOW);
    expect(usual.pastScores).toHaveLength(8);
    expect(usual.usualPoints).toEqual({});
  });

  it("gives no usual points until there are enough check-ins", () => {
    const usual = readinessUsual(
      records(routine(W.minPastScores - 1, { sleepHours: "<5", stressLevel: "low" })),
      NOW
    );
    expect(usual.pastScores).toHaveLength(W.minPastScores - 1);
    expect(usual.usualPoints).toEqual({});
  });

  it("uses only the most recent check-ins", () => {
    const history = routine(W.usualWindow + 12);
    // The oldest check-ins were rough; the recent window is all ordinary.
    for (const log of history.readinessLogs.slice(0, 12)) log.sleepHours = "<5";
    const usual = readinessUsual(records(history), NOW);
    expect(usual.pastScores).toHaveLength(W.usualWindow);
    expect(usual.usualPoints).toEqual({});
    expect(new Set(usual.pastScores)).toEqual(new Set([W.defaultUsual]));
  });

  it("skips check-ins dated after `now`, and those whose workout is gone", () => {
    const history = routine(6);
    const orphan = makeLog("deleted-workout", hoursBefore(30), { sleepHours: "<5" });
    const later = makeLog("w6", new Date(NOW.getTime() + 60_000), { id: "later", sleepHours: "<5" });
    const usual = readinessUsual(
      records({ ...history, readinessLogs: [...history.readinessLogs, orphan, later] }),
      NOW
    );
    expect(usual.pastScores).toHaveLength(6);
  });

  it("uses the phase saved with each workout, not today's", () => {
    const history = routine(6);
    for (const w of history.workouts) {
      w.completionContext = { phaseMode: "maintaining", gymBarbellIncrementLbs: 5, dumbbellIncrementLbs: 5 };
    }
    // At 48 hours a maintaining lifter has recovered; a cutting one has not.
    expect(readinessUsual(records(history, CUTTING), NOW).usualPoints).toEqual({});
    for (const w of history.workouts) delete w.completionContext;
    expect(readinessUsual(records(history, CUTTING), NOW).usualPoints).toEqual({
      "rest-days": W.rest.recovering,
    });
  });

  it("counts a run or soreness only for the check-ins it came before", () => {
    const history = routine(6);
    const a1Days = history.workouts.filter((w) => w.templateId === "A1");
    const lastA1 = a1Days[a1Days.length - 1];
    const run = makeRun({
      date: hoursBefore(3, new Date(lastA1.startedAt)),
      perceivedEffort: 5,
    });
    const sore = makeEntry({ date: hoursBefore(10, new Date(lastA1.startedAt)) });
    const usual = readinessUsual(records({ ...history, runs: [run], painEntries: [sore] }), NOW);
    const index = history.workouts.indexOf(lastA1);
    const plain = W.defaultUsual;
    expect(usual.pastScores[index]).toBe(plain + W.run.strong + 2 * W.sorenessPerSeverity);
    // The check-in before did not know about them yet.
    expect(usual.pastScores[index - 1]).toBe(plain);
  });

  it("does not count a workout as rest before its own check-in", () => {
    // The log is saved a moment after its workout starts; that workout must not read as "trained just now".
    const usual = readinessUsual(records(routine(6)), NOW);
    expect(usual.pastScores.slice(1)).toEqual([70, 70, 70, 70, 70]);
  });

  it("leaves today's workout and its check-in out of the history", () => {
    const history = routine(6);
    const today = makeWorkout("today", hoursBefore(2), "A1");
    const todayLog = makeLog("today", hoursBefore(2), { sleepHours: "<5", stressLevel: "low" });
    const withToday = records({
      workouts: [...history.workouts, today],
      readinessLogs: [...history.readinessLogs, todayLog],
    });
    expect(readinessUsual(withToday, NOW, "today")).toEqual(readinessUsual(records(history), NOW));
    expect(readinessUsual(withToday, NOW).pastScores).toHaveLength(7);
  });
});

describe("readinessFromRecords", () => {
  const roughNight: ReadinessAnswers = { sleepHours: "5-7", stressLevel: "normal" };

  it("an unchanging routine keeps the same usual, and an ordinary day scores it", () => {
    const ordinary = W.defaultUsual + W.sleep["5-7"] + W.rest.recovering;
    for (const count of [6, 7, 12, 25, 40, 70]) {
      const result = readinessFromRecords(
        records(routine(count, roughNight), CUTTING),
        { exerciseIds: nextExercises(count), log: roughNight },
        NOW
      );
      expect(result.usual, `${count} workouts`).toBe(ordinary);
      expect(result.score, `${count} workouts`).toBe(ordinary);
      expect(result.contributions.every((c) => c.points === 0)).toBe(true);
      expect(result.contributions.map((c) => c.id).sort()).toEqual(["rest-days", "sleep", "stress"]);
    }
  });

  it("feeding shown scores straight back would make the usual creep; this does not", () => {
    // What a caller would get by passing each shown score back as a past score with plain points.
    const shown: number[] = [];
    for (let i = 0; i < 40; i++) {
      shown.push(
        readinessScore({ log: { sleepHours: "<5", stressLevel: "normal" }, pastScores: shown }, NOW).score
      );
    }
    const naive = readinessScore({ pastScores: shown }, NOW).usual;
    expect(naive).toBeLessThan(W.defaultUsual + 2 * W.sleep["<5"]);

    const steady = readinessFromRecords(
      records(routine(40, { sleepHours: "<5", stressLevel: "normal" })),
      { exerciseIds: nextExercises(40), log: { sleepHours: "<5", stressLevel: "normal" } },
      NOW
    );
    expect(steady.usual).toBe(W.defaultUsual + W.sleep["<5"]);
    expect(steady.score).toBe(steady.usual);
  });

  it("a day that differs from the routine moves by the difference", () => {
    const result = readinessFromRecords(
      records(routine(12, roughNight), CUTTING),
      { exerciseIds: nextExercises(12), log: { sleepHours: "<5", stressLevel: "good" } },
      NOW
    );
    expect(points(result, "sleep")).toBe(W.sleep["<5"] - W.sleep["5-7"]);
    expect(points(result, "stress")).toBe(W.stress.good);
    expect(points(result, "rest-days")).toBe(0);
    expect(result.score).toBe(result.usual + W.sleep["<5"] - W.sleep["5-7"] + W.stress.good);
  });

  it("gives back the cost of a habit on the day it is missing", () => {
    // A hard yoga class the evening before every workout.
    const history = routine(10);
    const activities = history.workouts.map((w, i) =>
      makeActivity({ id: `yoga-${i}`, date: hoursBefore(14, new Date(w.startedAt)) })
    );
    const result = readinessFromRecords(
      records({ ...history, activities }),
      { exerciseIds: nextExercises(10), log: { sleepHours: "7+", stressLevel: "normal" } },
      NOW
    );
    expect(result.usual).toBe(W.defaultUsual + W.hardActivity);
    expect(points(result, "activity")).toBe(-W.hardActivity);
    expect(result.score).toBe(W.defaultUsual);
  });

  it("starts from the default, with plain points, until there is enough history", () => {
    const result = readinessFromRecords(
      records(routine(3, roughNight), CUTTING),
      { exerciseIds: nextExercises(3), log: roughNight },
      NOW
    );
    expect(result.usual).toBe(W.defaultUsual);
    expect(points(result, "sleep")).toBe(W.sleep["5-7"]);
    expect(points(result, "rest-days")).toBe(W.rest.recovering);
  });

  it("works before any answers are given", () => {
    const result = readinessFromRecords(
      records(routine(12, roughNight), CUTTING),
      { exerciseIds: nextExercises(12) },
      NOW
    );
    expect(result.contributions.map((c) => c.id)).toEqual(["rest-days"]);
    expect(result.score).toBe(result.usual);
    expect(result.suggestSkippingAccessories).toBe(false);
  });

  it("does not count today's own workout as the last time the muscles were trained", () => {
    const history = routine(8);
    const today = makeWorkout("today", hoursBefore(1), "A1");
    const todayLog = makeLog("today", hoursBefore(1));
    const all = records({
      workouts: [...history.workouts, today],
      readinessLogs: [...history.readinessLogs, todayLog],
    });
    const result = readinessFromRecords(
      all,
      { exerciseIds: templateExerciseIds("A1"), log: todayLog, sessionId: "today" },
      NOW
    );
    expect(result.contributions.find((c) => c.id === "rest-days")?.label).toBe("One rest day");
    expect(result.score).toBe(result.usual);
  });

  it("adds up on the demo data", () => {
    const demo = generateDemoData(NOW);
    const result = readinessFromRecords(
      {
        readinessLogs: demo.readinessLogs,
        workouts: demo.workouts,
        runs: demo.runs,
        activities: [],
        painEntries: demo.painEntries,
        phase: CUTTING,
      },
      { exerciseIds: templateExerciseIds("A1"), log: { sleepHours: "5-7", stressLevel: "good" } },
      NOW
    );
    expect(result.score).toBe(result.usual + sum(result));
    expect(result.usual).toBeGreaterThanOrEqual(50);
    expect(result.usual).toBeLessThanOrEqual(80);
    expect(result.contributions.length).toBeGreaterThanOrEqual(3);
  });
});
