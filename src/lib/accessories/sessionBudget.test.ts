import { describe, expect, it } from "vitest";
import { estimateSetSeconds, estimateWorkoutSeconds } from "@/lib/workout/duration";
import type { TrainingPhase } from "@/types";
import {
  DEFAULT_SESSION_MINUTES,
  SESSION_MINUTE_CHOICES,
  budgetLine,
  fitAccessoriesToBudget,
  leftOutNote,
  lengthAgainstTarget,
  sanitizeSessionMinutes,
  sessionMinutesFromParam,
  sessionMinutesLabel,
  sessionMinutesOf,
  sessionMinutesParam,
  type BudgetCandidate,
} from "./sessionBudget";

const PHASE: TrainingPhase = { mode: "maintaining" };
const ACC = estimateSetSeconds("accessory", PHASE);

/** A program plan of exactly `seconds` on paper, made of T3 sets plus a remainder of none. */
function programOf(minutes: number) {
  // Build from T1 sets so the length is a whole number of sets; the tests read the
  // length back from the result, never assume it.
  const perSet = estimateSetSeconds("T1", PHASE);
  return [{ tier: "T1" as const, targetSets: Math.round((minutes * 60) / perSet) }];
}

const c = (exerciseId: string, sets = 3, pinned = false): BudgetCandidate => ({ exerciseId, sets, pinned });

describe("session length setting", () => {
  it("offers 30 to 90 minutes and defaults to 60", () => {
    expect([...SESSION_MINUTE_CHOICES]).toEqual([30, 45, 60, 75, 90]);
    expect(DEFAULT_SESSION_MINUTES).toBe(60);
  });

  it("reads a missing or unreadable value as the default, and null as no limit", () => {
    expect(sessionMinutesOf(undefined)).toBe(DEFAULT_SESSION_MINUTES);
    expect(sessionMinutesOf({})).toBe(DEFAULT_SESSION_MINUTES);
    expect(sessionMinutesOf({ sessionMinutes: null })).toBeNull();
    expect(sessionMinutesOf({ sessionMinutes: 45 })).toBe(45);
    expect(sessionMinutesOf({ sessionMinutes: Number.NaN })).toBe(DEFAULT_SESSION_MINUTES);
    expect(sessionMinutesOf({ sessionMinutes: "45" as unknown as number })).toBe(DEFAULT_SESSION_MINUTES);
    expect(sanitizeSessionMinutes(0)).toBeUndefined();
    expect(sanitizeSessionMinutes(-30)).toBeUndefined();
    expect(sanitizeSessionMinutes(10_000)).toBeUndefined();
    expect(sanitizeSessionMinutes(44.6)).toBe(45);
  });

  it("reads and writes the URL value", () => {
    expect(sessionMinutesFromParam("45")).toBe(45);
    expect(sessionMinutesFromParam("none")).toBeNull();
    expect(sessionMinutesFromParam(null)).toBeUndefined();
    expect(sessionMinutesFromParam("")).toBeUndefined();
    expect(sessionMinutesFromParam("soon")).toBeUndefined();
    expect(sessionMinutesFromParam("-5")).toBeUndefined();
    expect(sessionMinutesParam(75)).toBe("75");
    expect(sessionMinutesParam(null)).toBe("none");
    expect(sessionMinutesLabel(30)).toBe("30 min");
    expect(sessionMinutesLabel(null)).toBe("No limit");
  });
});

describe("fitAccessoriesToBudget", () => {
  it("keeps accessories in order while the plan stays at or under the length", () => {
    const program = programOf(40);
    const all = fitAccessoriesToBudget({ minutes: null, programPlan: program, phase: PHASE, candidates: [] });
    const room = 60 * 60 - all.programMinutes * 60;
    const fits = Math.floor(room / (3 * ACC));
    const budget = fitAccessoriesToBudget({
      minutes: 60,
      programPlan: program,
      phase: PHASE,
      candidates: [c("a"), c("b"), c("c"), c("d")],
    });
    expect(budget.kept).toEqual(["a", "b", "c", "d"].slice(0, fits));
    expect(budget.leftOut.map((l) => l.exerciseId)).toEqual(["a", "b", "c", "d"].slice(fits));
    expect(budget.leftOut[0].reason).toBe("Left out to fit 60 min");
    expect(budget.plannedMinutes).toBeLessThanOrEqual(60);
    expect(budget.overBudget).toBe(false);
    expect(budget.offered).toBe(4);
  });

  it("tries the next one when one does not fit", () => {
    const program = programOf(40);
    const base = fitAccessoriesToBudget({ minutes: null, programPlan: program, phase: PHASE, candidates: [] });
    // Room for exactly 2 sets of an accessory.
    const minutes = Math.ceil((base.programMinutes * 60 + 2 * ACC) / 60);
    const budget = fitAccessoriesToBudget({
      minutes,
      programPlan: program,
      phase: PHASE,
      candidates: [c("big", 4), c("small", 2)],
    });
    expect(budget.kept).toEqual(["small"]);
    expect(budget.leftOut).toEqual([
      { exerciseId: "big", minutes: Math.round((4 * ACC) / 60), reason: `Left out to fit ${minutes} min` },
    ]);
  });

  it("counts exactly at the length as fitting", () => {
    const program = [{ tier: "accessory" as const, targetSets: 0 }];
    const minutes = (4 * ACC) / 60;
    expect(Number.isInteger(minutes)).toBe(true);
    const budget = fitAccessoriesToBudget({ minutes, programPlan: program, phase: PHASE, candidates: [c("a", 4)] });
    expect(budget.kept).toEqual(["a"]);
  });

  it("always keeps pinned accessories, even past the length, and counts their time first", () => {
    const program = programOf(50);
    const budget = fitAccessoriesToBudget({
      minutes: 60,
      programPlan: program,
      phase: PHASE,
      candidates: [c("free"), c("pin1", 4, true), c("pin2", 4, true)],
    });
    expect(budget.kept).toEqual(["pin1", "pin2"]);
    expect(budget.leftOut.map((l) => l.exerciseId)).toEqual(["free"]);
    expect(budget.overBudget).toBe(true);
    expect(budgetLine(budget)).toBe(`Your pinned accessories take it to about ${budget.plannedMinutes} of 60 min`);
  });

  it("keeps no unpinned accessory when the lifts alone are over the length, and says so", () => {
    const program = programOf(50);
    const budget = fitAccessoriesToBudget({
      minutes: 30,
      programPlan: program,
      phase: PHASE,
      candidates: [c("a"), c("b", 3, true)],
    });
    expect(budget.programOverBudget).toBe(true);
    expect(budget.kept).toEqual(["b"]);
    expect(budget.leftOut).toHaveLength(1);
    expect(budget.leftOut[0].reason).toBe(`The main lifts alone take about ${budget.programMinutes} min`);
    expect(budgetLine(budget)).toBe(
      `The main lifts alone take about ${budget.programMinutes} of 30 min: only your pinned accessories are in`
    );
    const none = fitAccessoriesToBudget({ minutes: 30, programPlan: program, phase: PHASE, candidates: [c("a")] });
    expect(budgetLine(none)).toBe(`The main lifts alone take about ${none.programMinutes} of 30 min: no accessories added`);
  });

  it("never drops or shortens the program's lifts", () => {
    const program = programOf(80);
    const budget = fitAccessoriesToBudget({ minutes: 30, programPlan: program, phase: PHASE, candidates: [] });
    expect(budget.programMinutes).toBeGreaterThan(30);
    expect(budget.plannedMinutes).toBe(budget.programMinutes);
    expect(budget.overBudget).toBe(true);
  });

  it("keeps everything with no limit", () => {
    const budget = fitAccessoriesToBudget({
      minutes: null,
      programPlan: programOf(80),
      phase: PHASE,
      candidates: [c("a"), c("b"), c("c")],
    });
    expect(budget.kept).toEqual(["a", "b", "c"]);
    expect(budget.leftOut).toEqual([]);
    expect(budgetLine(budget)).toBeNull();
  });

  it("is deterministic", () => {
    const input = { minutes: 45, programPlan: programOf(30), phase: PHASE, candidates: [c("a"), c("b"), c("c")] };
    expect(fitAccessoriesToBudget(input)).toEqual(fitAccessoriesToBudget(input));
  });

  it("times the plan as the screens do, with the phase's rests", () => {
    const program = [
      { tier: "T1" as const, targetSets: 5 },
      { tier: "T2" as const, targetSets: 3 },
      { tier: "warmup" as const, targetSets: 4 },
    ];
    for (const phase of [PHASE, { mode: "cutting" } as TrainingPhase]) {
      const budget = fitAccessoriesToBudget({ minutes: null, programPlan: program, phase, candidates: [c("a", 3)] });
      expect(budget.programMinutes).toBe(Math.round(estimateWorkoutSeconds(program, phase) / 60));
      expect(budget.plannedMinutes).toBe(
        Math.round((estimateWorkoutSeconds(program, phase) + 3 * estimateSetSeconds("accessory", phase)) / 60)
      );
    }
  });
});

describe("the lines", () => {
  it("says how many fit", () => {
    const budget = fitAccessoriesToBudget({
      minutes: 60,
      programPlan: programOf(40),
      phase: PHASE,
      candidates: [c("a"), c("b"), c("c"), c("d")],
    });
    expect(budgetLine(budget)).toBe(`${budget.kept.length} of 4 accessories fit in 60 min`);
    const one = fitAccessoriesToBudget({ minutes: 60, programPlan: programOf(10), phase: PHASE, candidates: [c("a")] });
    expect(budgetLine(one)).toBe("1 of 1 accessory fits in 60 min");
  });

  it("has nothing to say when nothing was asked about", () => {
    const budget = fitAccessoriesToBudget({ minutes: 60, programPlan: programOf(40), phase: PHASE, candidates: [] });
    expect(budgetLine(budget)).toBeNull();
    expect(budgetLine(null)).toBeNull();
  });

  it("gives a short note for a list header", () => {
    const budget = fitAccessoriesToBudget({
      minutes: 30,
      programPlan: programOf(25),
      phase: PHASE,
      candidates: [c("a"), c("b")],
    });
    expect(leftOutNote(budget)).toBe(`${budget.leftOut.length} left out to fit 30 min`);
    expect(leftOutNote(fitAccessoriesToBudget({ minutes: null, programPlan: programOf(25), phase: PHASE, candidates: [c("a")] }))).toBeNull();
    expect(leftOutNote(null)).toBeNull();
  });

  it("puts the forecast against the target", () => {
    expect(lengthAgainstTarget(58, 60)).toBe("About 58 of 60 min");
    expect(lengthAgainstTarget(58, null)).toBe("About 58 min");
  });
});
