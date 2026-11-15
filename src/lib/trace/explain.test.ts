// Rest, home substitute, accessory limit, and the helpers the traces stand on.
import { describe, expect, it } from "vitest";
import { PHASE_ACCESSORY_CAP, getPhaseAccessoryCap } from "@/lib/accessories";
import { makeOutcome } from "@/lib/progression";
import {
  CUTTING_REST_BONUS_SECONDS,
  REST_SECONDS,
  getRestSeconds,
} from "@/lib/restTimes";
import { EQUIPMENT, makeEntry, makeSession, makeSets } from "@/lib/workout/testFixtures";
import type { DecisionTrace, Tier, TrainingPhase } from "@/types";
import {
  applySteps,
  explainAccessoryCap,
  explainRest,
  explainSubstitute,
  findLastSession,
  findStoredDecision,
  replayTrace,
  type TraceHistory,
} from "./index";
import { joinList, stageWords, step } from "./text";

const CUTTING: TrainingPhase = { mode: "cutting" };
const MAINTAINING: TrainingPhase = { mode: "maintaining" };
const BULKING: TrainingPhase = { mode: "bulking" };
const TIERS: Tier[] = ["T1", "T2", "T3", "accessory", "warmup"];

describe("explainRest", () => {
  it("heavy sets while cutting: the base rest, then the extra time", () => {
    const trace = explainRest({ exerciseId: "squat", tier: "T1" }, { phase: CUTTING });
    expect(trace).toEqual({
      subject: { kind: "rest", exerciseId: "squat", tier: "T1" },
      result: REST_SECONDS.T1 + CUTTING_REST_BONUS_SECONDS,
      unit: "s",
      steps: [
        {
          id: "base-rest",
          title: "T1 sets",
          detail: "Heavy sets get 3:00: longer rest keeps the next set strong.",
          effect: { op: "start", value: REST_SECONDS.T1, unit: "s" },
          ruleId: "rest-heavy",
        },
        {
          id: "cutting-bonus",
          title: "Cutting phase",
          detail: "Adds 30 seconds on T1 and T2 sets while cutting: 3:00 becomes 3:30.",
          effect: { op: "add", value: CUTTING_REST_BONUS_SECONDS, unit: "s" },
          ruleId: "rest-cut-bonus",
        },
      ],
    });
  });

  it("lighter sets while cutting are checked and left alone", () => {
    const trace = explainRest({ exerciseId: "lat_pulldown", tier: "T3" }, { phase: CUTTING });
    expect(trace.result).toBe(REST_SECONDS.T3);
    expect(trace.steps[0].ruleId).toBe("rest-light");
    expect(trace.steps[1]).toMatchObject({
      id: "cutting-bonus",
      detail: "The extra rest while cutting is for T1 and T2 sets only.",
      effect: { op: "none", unit: "s" },
    });
  });

  it("outside a cut there is only the base rest; warm-ups cite no rule", () => {
    const heavy = explainRest({ exerciseId: "squat", tier: "T2" }, { phase: MAINTAINING });
    expect(heavy.steps.map((s) => s.id)).toEqual(["base-rest"]);
    expect(heavy.result).toBe(REST_SECONDS.T2);
    const warmUp = explainRest({ exerciseId: "squat", tier: "warmup" }, { phase: BULKING });
    expect(warmUp.steps[0].ruleId).toBeUndefined();
    expect(warmUp.steps[0].title).toBe("Warm-up sets");
  });

  it("ends at getRestSeconds for every tier in every phase", () => {
    for (const tier of TIERS) {
      for (const phase of [CUTTING, MAINTAINING, BULKING]) {
        const trace = explainRest({ exerciseId: "squat", tier }, { phase });
        expect(trace.result, `${tier} ${phase.mode}`).toBe(getRestSeconds(tier, phase));
        expect(replayTrace(trace), `${tier} ${phase.mode}`).toBe(trace.result);
      }
    }
  });
});

describe("explainAccessoryCap", () => {
  it("a cut keeps the usual limit and says why", () => {
    const trace = explainAccessoryCap({ phase: CUTTING });
    expect(trace.subject).toEqual({ kind: "accessoryCap" });
    expect(trace.unit).toBe("count");
    expect(trace.steps).toEqual([
      {
        id: "usual-cap",
        title: "Usual limit",
        detail: `Up to ${PHASE_ACCESSORY_CAP.maintaining} accessories keeps a session manageable.`,
        effect: { op: "start", value: PHASE_ACCESSORY_CAP.maintaining, unit: "count" },
      },
      {
        id: "phase-cap",
        title: "Cutting phase",
        detail: "A cut keeps the same limit: doing less while eating less does not help you keep muscle.",
        effect: { op: "none", unit: "count" },
        ruleId: "accessories-in-cut",
      },
    ]);
  });

  it("bulking allows more, maintaining is the usual limit alone", () => {
    const bulk = explainAccessoryCap({ phase: BULKING });
    expect(bulk.steps[1]).toMatchObject({
      title: "Bulking phase",
      detail: "Bulking allows 1 more.",
      effect: { op: "add", value: 1, unit: "count" },
    });
    expect(explainAccessoryCap({ phase: MAINTAINING }).steps).toHaveLength(1);
  });

  it("ends at getPhaseAccessoryCap in every phase", () => {
    for (const phase of [CUTTING, MAINTAINING, BULKING]) {
      const trace = explainAccessoryCap({ phase });
      expect(trace.result).toBe(getPhaseAccessoryCap(phase));
      expect(replayTrace(trace)).toBe(trace.result);
    }
  });
});

describe("explainSubstitute", () => {
  const home = { location: "home" as const, equipment: EQUIPMENT };

  it("says which dumbbell exercise stands in, and how its weight was reached", () => {
    const entry = makeEntry({
      exerciseId: "bench",
      tier: "T2",
      targetSets: 3,
      targetReps: 10,
      weight: 60,
      originalWeight: 145,
      substituteExerciseId: "db_bench",
    });
    const trace = explainSubstitute(entry, home);
    expect(trace.subject).toEqual({ kind: "substitute", exerciseId: "bench", tier: "T2" });
    expect(trace.steps).toEqual([
      {
        id: "program-weight",
        title: "Barbell Bench Press",
        detail: "The program asks for 145 on this lift.",
        effect: { op: "start", value: 145, unit: "lb" },
      },
      {
        id: "dumbbell",
        title: "At home with dumbbells",
        detail: "DB Bench Press: 80% of 145 split between two hands, rounded to 5, is 60 per hand.",
        effect: { op: "set", value: 60, unit: "lb" },
        ruleId: "dumbbell-conversion",
      },
    ]);
    expect(trace.result).toBe(60);
    expect(replayTrace(trace)).toBe(60);
  });

  it("lists the other substitutes when the first choice is too heavy for your dumbbells", () => {
    const entry = makeEntry({
      exerciseId: "squat",
      weight: 80,
      originalWeight: 250,
      substituteExerciseId: "bulgarian_split_squat",
    });
    const trace = explainSubstitute(entry, home);
    expect(trace.steps[1].title).toBe("At home with dumbbells");
    expect(trace.steps[1].detail).toMatch(
      /^Goblet Squat would need more than your heaviest dumbbell, so Bulgarian Split Squat stands in: 80% of 250 split between two hands/
    );
    expect(trace.alternatives!.map((a) => a.label)).toEqual(["Goblet Squat", "DB Lunge"]);
    expect(replayTrace(trace)).toBe(trace.result);
  });

  it("at the gym, and for a lift that works at home, no substitute is needed", () => {
    const gym = explainSubstitute(makeEntry({ weight: 190 }), { location: "gym", equipment: EQUIPMENT });
    expect(gym.steps[1]).toMatchObject({
      title: "At the gym",
      detail: "The lift is done as programmed: no substitute is needed.",
      effect: { op: "none", unit: "lb" },
    });
    expect(gym.result).toBe(190);

    const row = explainSubstitute(makeEntry({ exerciseId: "db_row", tier: "T3", weight: 35 }), home);
    expect(row.steps[1].detail).toBe("This lift works at home as it is: no substitute is needed.");
    expect(replayTrace(row)).toBe(35);
  });

  it("a substitute weight you changed is the last step", () => {
    const entry = makeEntry({
      exerciseId: "bench",
      tier: "T2",
      weight: 50,
      originalWeight: 145,
      substituteExerciseId: "db_bench",
    });
    const trace = explainSubstitute(entry, home);
    expect(trace.steps.map((s) => s.id)).toEqual(["program-weight", "dumbbell", "your-change"]);
    expect(replayTrace(trace)).toBe(50);
  });
});

describe("applySteps and replayTrace", () => {
  const steps = [
    step("a", "A", "a", "start", "lb", 205),
    step("b", "B", "b", "add", "lb", 10),
    step("c", "C", "c", "none", "lb"),
    step("d", "D", "d", "add", "lb", -2.5),
    step("e", "E", "e", "round", "lb", 215),
    step("f", "F", "f", "set", "s", 90),
  ];

  it("start, set and round replace the value, add adds to it, none leaves it", () => {
    expect(applySteps(steps.slice(0, 2))).toEqual({ lb: 215 });
    expect(applySteps(steps.slice(0, 4))).toEqual({ lb: 212.5 });
    expect(applySteps(steps)).toEqual({ lb: 215, s: 90 });
    expect(applySteps([])).toEqual({});
  });

  it("reads the result in the trace's own unit, and sets and reps as text", () => {
    const weight: DecisionTrace = { subject: { kind: "weight" }, result: 215, unit: "lb", steps };
    expect(replayTrace(weight)).toBe(215);
    const scheme: DecisionTrace = {
      subject: { kind: "scheme" },
      result: "6x2",
      unit: "none",
      steps: [step("r", "R", "r", "start", "reps", 2), step("s", "S", "s", "set", "sets", 6)],
    };
    expect(replayTrace(scheme)).toBe("6x2");
    expect(replayTrace({ ...scheme, steps: scheme.steps.slice(0, 1) })).toBeUndefined();
    expect(replayTrace({ ...weight, steps: [] })).toBeUndefined();
  });
});

describe("findLastSession", () => {
  const outcome = (exerciseId: string, tier: "T1" | "T2" | "T3") =>
    makeOutcome(exerciseId, tier, "passed", { weight: 100, stage: "5x3" }, { weight: 105, stage: "5x3" });
  const done = (id: string, day: number, overrides = {}) =>
    makeSession({
      id,
      completedAt: new Date(2026, 0, day, 10),
      sets: makeSets("squat", "T1", 5, 3),
      ...overrides,
    });
  const history: TraceHistory = {
    workouts: [done("w2", 7), done("w1", 5), done("w3", 9, { deletedAt: 1 }), makeSession({ id: "open" })],
    outcomes: new Map([
      ["w1", [outcome("squat", "T1")]],
      ["w2", [outcome("squat", "T1"), outcome("bench", "T2")]],
      ["w3", [outcome("squat", "T1")]],
      ["open", [outcome("squat", "T1")]],
    ]),
  };
  const now = new Date(2026, 0, 20);

  it("is the latest finished, undeleted workout that had the lift at that tier", () => {
    const last = findLastSession(history, "squat", "T1", now)!;
    expect(last.workoutId).toBe("w2");
    expect(last.sets).toHaveLength(5);
    expect(last.location).toBe("gym");
    expect(findLastSession(history, "bench", "T2", now)!.workoutId).toBe("w2");
  });

  it("looks no later than now, and is undefined when there is nothing", () => {
    expect(findLastSession(history, "squat", "T1", new Date(2026, 0, 6))!.workoutId).toBe("w1");
    expect(findLastSession(history, "squat", "T1", new Date(2026, 0, 1))).toBeUndefined();
    expect(findLastSession(history, "squat", "T2", now)).toBeUndefined();
    expect(findLastSession(undefined, "squat", "T1", now)).toBeUndefined();
  });
});

describe("findStoredDecision", () => {
  it("finds a saved trace by kind, lift and tier", () => {
    const rest = explainRest({ exerciseId: "squat", tier: "T1" }, { phase: CUTTING });
    const other = explainRest({ exerciseId: "bench", tier: "T2" }, { phase: CUTTING });
    expect(findStoredDecision([other, rest], "rest", "squat", "T1")).toBe(rest);
    expect(findStoredDecision([other, rest], "weight", "squat", "T1")).toBeUndefined();
    expect(findStoredDecision(undefined, "rest", "squat", "T1")).toBeUndefined();
  });
});

describe("wording helpers", () => {
  it("joins lists and spells out stages", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"], "or")).toBe("a, b or c");
    expect(stageWords("10x1")).toBe("10 sets of 1");
    expect(stageWords(undefined)).toBe("");
  });
});
