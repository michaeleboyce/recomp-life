// The decision-trace contract (G1): every kind of decision has an explain function,
// every cited rule exists, a trace's steps add up to its result, and for every entry
// of every demo workout the result is the number the plan and the rest timer use.
import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { getPhaseAccessoryCap } from "@/lib/accessories";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { isRuleId } from "@/lib/evidence";
import { rebuildDerived } from "@/lib/rebuild";
import { getRestSeconds } from "@/lib/restTimes";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { WORKOUT_ROTATION, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { DecisionKind, DecisionTrace, TrainingPhase, WorkoutLocation } from "@/types";
import {
  DECISIONS,
  buildSessionDecisions,
  explainAccessoryCap,
  explainDecision,
  explainPrescription,
  explainRest,
  explainScheme,
  explainSubstitute,
  replayTrace,
  type PlanEntry,
  type TraceContext,
} from "./index";

const NOW = new Date(2026, 10, 14, 12, 0, 0);
const settings = DEFAULT_USER_PROFILE.settings;
const data = generateDemoData(NOW);

/** Fails to compile when a decision kind is added without being listed here. */
const KINDS = Object.keys({
  weight: true,
  scheme: true,
  rest: true,
  substitute: true,
  accessoryCap: true,
} satisfies Record<DecisionKind, true>) as DecisionKind[];

const PHASES: TrainingPhase[] = [{ mode: "cutting" }, { mode: "maintaining" }, { mode: "bulking" }];

/** The plan and context of demo workout `index` as it stood when that workout started. */
function demoStart(index: number, overrides: Partial<TraceContext> = {}) {
  const workout = data.workouts[index];
  const prior = data.workouts.slice(0, index);
  const rebuilt = rebuildDerived({ workouts: prior, adjustments: data.liftAdjustments, settings });
  const location = overrides.location ?? workout.location;
  const plan = buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[workout.templateId],
    liftStates: rebuilt.liftStates,
    location,
    equipment: settings.equipment,
    includeWarmUps: true,
    selectedAccessories: [],
  });
  const context: TraceContext = {
    now: workout.startedAt,
    location,
    equipment: settings.equipment,
    phase: settings.trainingPhase,
    liftStates: rebuilt.liftStates,
    history: { workouts: prior, outcomes: rebuilt.outcomes, adjustments: data.liftAdjustments },
    painEntries: data.painEntries,
    ...overrides,
  };
  return { workout, plan, context };
}

/** The upcoming workout after the whole demo log, at either location. */
function demoNext(location: WorkoutLocation, phase: TrainingPhase) {
  const rebuilt = rebuildDerived({
    workouts: data.workouts,
    adjustments: data.liftAdjustments,
    settings,
  });
  const template = WORKOUT_TEMPLATES[WORKOUT_ROTATION[data.workouts.length % WORKOUT_ROTATION.length]];
  const plan = buildWorkoutPlan({
    template,
    liftStates: rebuilt.liftStates,
    location,
    equipment: settings.equipment,
    includeWarmUps: true,
    selectedAccessories: ["face_pulls", "bicep_curls"],
  });
  const context: TraceContext = {
    now: NOW,
    location,
    equipment: settings.equipment,
    phase,
    liftStates: rebuilt.liftStates,
    history: { workouts: data.workouts, outcomes: rebuilt.outcomes, adjustments: data.liftAdjustments },
    painEntries: data.painEntries,
    readiness: { sleepHours: "<5", stressLevel: "low", score: 48 },
  };
  return { plan, context };
}

function everyTrace(plan: PlanEntry[], context: TraceContext): DecisionTrace[] {
  return [
    ...plan.flatMap((entry) => [
      explainPrescription(entry, context, plan),
      explainScheme(entry, context),
      explainRest(entry, context),
      explainSubstitute(entry, context),
    ]),
    explainAccessoryCap(context),
  ];
}

const stepIds = (trace: DecisionTrace) => trace.steps.map((s) => s.id);

describe("decision kinds", () => {
  it("every kind has an explain function, and nothing else is registered", () => {
    expect(Object.keys(DECISIONS).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect(typeof DECISIONS[kind].explain, kind).toBe("function");
      expect(DECISIONS[kind].label.length, kind).toBeGreaterThan(0);
    }
  });

  it("each kind explains itself: the right subject, the declared unit, steps that give the result", () => {
    const { plan, context } = demoStart(8);
    const entry = plan.find((e) => e.tier === "T1")!;
    for (const kind of KINDS) {
      const trace = explainDecision(kind, context, entry, plan);
      expect(trace.subject.kind, kind).toBe(kind);
      expect(trace.unit, kind).toBe(DECISIONS[kind].unit);
      expect(trace.steps.length, kind).toBeGreaterThan(0);
      expect(replayTrace(trace), kind).toBe(trace.result);
    }
  });

  it("a per-lift kind cannot be explained without an entry", () => {
    const { context } = demoStart(0);
    expect(() => explainDecision("weight", context)).toThrow();
    expect(explainDecision("accessoryCap", context).result).toBe(getPhaseAccessoryCap(context.phase));
  });
});

describe("every demo entry", () => {
  it("has a weight trace that ends at the plan's weight, from the program's steps alone", () => {
    let entries = 0;
    let withLastSession = 0;
    let atHome = 0;
    for (let i = 0; i < data.workouts.length; i++) {
      const { workout, plan, context } = demoStart(i);
      for (const entry of plan) {
        const trace = explainPrescription(entry, context, plan);
        const where = `${workout.id} ${entry.exerciseId} ${entry.tier}`;
        expect(trace.result, where).toBe(entry.weight);
        expect(replayTrace(trace), where).toBe(entry.weight);
        expect(trace.unit, where).toBe("lb");
        // Nothing was edited or adjusted in the demo log, so the program's own steps
        // must reach the number without the two catch-all steps.
        expect(stepIds(trace), where).not.toContain("your-change");
        expect(stepIds(trace), where).not.toContain("adjustment");
        entries += 1;
        if (stepIds(trace).includes("last-session")) withLastSession += 1;
        if (stepIds(trace).includes("dumbbell")) atHome += 1;
      }
      // The working weights are the ones the session went on to record.
      for (const prescribed of workout.prescribed ?? []) {
        const entry = plan.find(
          (e) => !e.isWarmUp && e.exerciseId === prescribed.exerciseId && e.tier === prescribed.tier
        )!;
        expect(entry.originalWeight ?? entry.weight, workout.id).toBe(prescribed.weight);
      }
    }
    expect(entries).toBeGreaterThan(24 * 5);
    expect(withLastSession).toBeGreaterThan(50);
    expect(atHome).toBeGreaterThan(5);
  });

  it("has a rest trace that ends at getRestSeconds", () => {
    for (let i = 0; i < data.workouts.length; i++) {
      for (const phase of PHASES) {
        const { workout, plan, context } = demoStart(i, { phase });
        for (const entry of plan) {
          const trace = explainRest(entry, context);
          const where = `${workout.id} ${entry.exerciseId} ${entry.tier} ${phase.mode}`;
          expect(trace.result, where).toBe(getRestSeconds(entry.tier, phase));
          expect(replayTrace(trace), where).toBe(trace.result);
          expect(trace.unit, where).toBe("s");
        }
      }
    }
  });

  it("has sets and reps, and a substitute, that match the plan", () => {
    for (let i = 0; i < data.workouts.length; i++) {
      const { workout, plan, context } = demoStart(i);
      for (const entry of plan) {
        const where = `${workout.id} ${entry.exerciseId} ${entry.tier}`;
        const scheme = explainScheme(entry, context);
        expect(scheme.result, where).toBe(`${entry.targetSets}x${entry.targetReps}`);
        expect(replayTrace(scheme), where).toBe(scheme.result);
        expect(stepIds(scheme), where).not.toContain("your-change");
        expect(stepIds(scheme), where).not.toContain("adjustment");

        const substitute = explainSubstitute(entry, context);
        expect(substitute.result, where).toBe(entry.weight);
        expect(replayTrace(substitute), where).toBe(entry.weight);
        if (!entry.isWarmUp) expect(stepIds(substitute), where).not.toContain("your-change");
      }
    }
  });

  it("gives the same weights whatever the phase, readiness or pain: they only add text", () => {
    for (const location of ["gym", "home"] as const) {
      for (const phase of PHASES) {
        const { plan, context } = demoNext(location, phase);
        for (const entry of plan) {
          const trace = explainPrescription(entry, context, plan);
          expect(trace.result).toBe(entry.weight);
          expect(replayTrace(trace)).toBe(entry.weight);
          for (const id of ["readiness", "pain", "phase"]) {
            const check = trace.steps.find((s) => s.id === id);
            if (check) expect(check.effect, id).toEqual({ op: "none", unit: "lb" });
          }
        }
        const cap = explainAccessoryCap(context);
        expect(cap.result).toBe(getPhaseAccessoryCap(phase));
        expect(replayTrace(cap)).toBe(cap.result);
      }
    }
  });
});

describe("rule ids and wording", () => {
  const all: DecisionTrace[] = [];
  for (let i = 0; i < data.workouts.length; i++) {
    const { plan, context } = demoStart(i);
    all.push(...everyTrace(plan, context));
  }
  for (const location of ["gym", "home"] as const) {
    for (const phase of PHASES) {
      const { plan, context } = demoNext(location, phase);
      all.push(...everyTrace(plan, context));
    }
  }
  const steps = all.flatMap((trace) => trace.steps);

  it("every rule id on a step names a rule in the evidence registry", () => {
    const cited = new Set(steps.flatMap((s) => (s.ruleId ? [s.ruleId] : [])));
    for (const id of cited) expect(isRuleId(id), id).toBe(true);
    // The rules the brief names are all reached by the demo data.
    for (const id of [
      "gzclp-progression",
      "t3-progression",
      "readiness",
      "training-with-pain",
      "rest-cut-bonus",
      "rest-heavy",
      "rest-light",
      "dumbbell-conversion",
      "accessories-in-cut",
    ]) {
      expect(cited.has(id), id).toBe(true);
    }
  });

  it("every step has a stable id, a title and a detail in plain words", () => {
    for (const s of steps) {
      expect(s.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.detail.length).toBeGreaterThan(0);
      expect(`${s.title} ${s.detail}`).not.toMatch(/AMRAP|RPE|e1RM|undefined|NaN/);
    }
  });

  it("is a pure function of its input: the same plan and context give the same traces", () => {
    const first = demoStart(12);
    const second = demoStart(12);
    expect(everyTrace(second.plan, second.context)).toEqual(everyTrace(first.plan, first.context));
  });
});

describe("buildSessionDecisions", () => {
  it("saves weight and rest for each planned lift, in plan order, and skips warm-ups", () => {
    const { plan, context } = demoStart(8);
    const decisions = buildSessionDecisions(plan, context);
    const lifts = plan.filter((e) => !e.isWarmUp);
    expect(decisions.map((d) => `${d.subject.exerciseId} ${d.subject.tier} ${d.subject.kind}`)).toEqual(
      lifts.flatMap((e) => [`${e.exerciseId} ${e.tier} weight`, `${e.exerciseId} ${e.tier} rest`])
    );
    for (const trace of decisions) expect(replayTrace(trace)).toBe(trace.result);
  });

  it("is plain data that survives being stored: JSON in, the same trace out", () => {
    const { plan, context } = demoStart(8);
    const decisions = buildSessionDecisions(plan, context);
    expect(JSON.parse(JSON.stringify(decisions))).toEqual(decisions);
  });

  it("stays small: the workout row is sent again on every set", () => {
    for (let i = 0; i < data.workouts.length; i++) {
      const { plan, context } = demoStart(i);
      const decisions = buildSessionDecisions(plan, context);
      for (const trace of decisions) {
        expect(JSON.stringify(trace).length, `${trace.subject.exerciseId} ${trace.subject.kind}`).toBeLessThan(2000);
      }
      expect(JSON.stringify(decisions).length).toBeLessThan(8000);
    }
  });
});
