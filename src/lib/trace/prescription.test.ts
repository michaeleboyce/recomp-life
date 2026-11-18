// The weight and sets-and-reps traces, case by case, on simulated logs.
import { describe, expect, it } from "vitest";
import { rebuildDerived } from "@/lib/rebuild";
import {
  FAIL,
  PARTIAL,
  type SessionOptions,
  type Sim,
  adjust,
  rebuildInput,
  runSession,
  startSim,
} from "@/lib/rebuild/testHelpers";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { buildWorkoutPlan } from "@/lib/workout/buildPlan";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  DecisionTrace,
  PainSorenessEntry,
  PlanEdit,
  Tier,
  TraceStep,
  WorkoutLocation,
} from "@/types";
import { explainPrescription, explainScheme, replayTrace, type TraceContext } from "./index";
import { shortDay } from "./text";

const NOW = new Date("2026-03-01T12:00:00Z");

/** The plan and context for the next workout of a simulated log. */
function next(
  sim: Sim,
  options: {
    templateId?: string;
    location?: WorkoutLocation;
    edits?: PlanEdit[];
    accessories?: string[];
    context?: Partial<TraceContext>;
  } = {}
) {
  const rebuilt = rebuildDerived(rebuildInput(sim));
  const location = options.location ?? "gym";
  const plan = buildWorkoutPlan({
    template: WORKOUT_TEMPLATES[options.templateId ?? "A1"],
    liftStates: rebuilt.liftStates,
    location,
    equipment: sim.settings.equipment,
    includeWarmUps: true,
    selectedAccessories: options.accessories ?? [],
    edits: options.edits,
  });
  const context: TraceContext = {
    now: NOW,
    location,
    equipment: sim.settings.equipment,
    phase: sim.settings.trainingPhase,
    liftStates: rebuilt.liftStates,
    history: { workouts: sim.workouts, outcomes: rebuilt.outcomes, adjustments: sim.adjustments },
    ...options.context,
  };
  const entry = (exerciseId: string, tier: Tier) =>
    plan.find((e) => e.exerciseId === exerciseId && e.tier === tier)!;
  const weight = (exerciseId: string, tier: Tier) =>
    explainPrescription(entry(exerciseId, tier), context, plan);
  const scheme = (exerciseId: string, tier: Tier) => explainScheme(entry(exerciseId, tier), context);
  return { plan, context, entry, weight, scheme };
}

function simOf(...sessions: SessionOptions[]): Sim {
  const sim = startSim();
  for (const options of sessions) runSession(sim, { templateId: "A1", ...options });
  return sim;
}

const byId = (trace: DecisionTrace, id: string): TraceStep => {
  const found = trace.steps.find((s) => s.id === id);
  if (!found) throw new Error(`No step ${id} in ${trace.steps.map((s) => s.id).join(", ")}`);
  return found;
};
const ids = (trace: DecisionTrace) => trace.steps.map((s) => s.id);

describe("explainPrescription: a T1 lift at the gym", () => {
  it("after a pass: last time, the step added, three checks that change nothing, the plates", () => {
    const sim = simOf({});
    const trace = next(sim).weight("squat", "T1");

    expect(trace.subject).toEqual({ kind: "weight", exerciseId: "squat", tier: "T1" });
    expect(trace.result).toBe(200);
    expect(trace.unit).toBe("lb");
    expect(ids(trace)).toEqual(["last-session", "progression", "readiness", "pain", "phase", "plates"]);
    expect(trace.steps).toEqual([
      {
        id: "last-session",
        title: `Last time, ${shortDay(sim.workouts[0].completedAt!)}`,
        detail: "190 × 3, 3, 3, 3, 3. Every set hit its target, so it counts as a pass.",
        effect: { op: "start", value: 190, unit: "lb" },
      },
      {
        id: "progression",
        title: "Progression",
        detail: "A pass adds your lower-body step.",
        effect: { op: "add", value: 10, unit: "lb" },
        ruleId: "gzclp-progression",
      },
      {
        id: "readiness",
        title: "Readiness",
        detail:
          "Never changes a weight. Under 5 hours of sleep with low energy only suggests skipping accessories.",
        effect: { op: "none", unit: "lb" },
        ruleId: "readiness",
      },
      {
        id: "pain",
        title: "Pain check",
        detail: "No recent pain logged for lower back, left knee or right knee.",
        effect: { op: "none", unit: "lb" },
        ruleId: "training-with-pain",
      },
      {
        id: "phase",
        title: "Cutting phase",
        detail: "Weight stays. Rest goes from 3:00 to 3:30.",
        effect: { op: "none", unit: "lb" },
        ruleId: "rest-cut-bonus",
      },
      {
        id: "plates",
        title: "Plates",
        detail: "Loads exactly: 45, 25, 5 and 2.5 a side on a 45 lb bar.",
        effect: { op: "round", value: 200, unit: "lb" },
      },
    ]);
    expect(replayTrace(trace)).toBe(200);
  });

  it("offers one step lighter, the plan and one step heavier", () => {
    const { weight } = next(simOf({}));
    expect(weight("squat", "T1").alternatives).toEqual([
      { label: "easier", value: 190 },
      { label: "the plan", value: 200 },
      { label: "harder", value: 210 },
    ]);
    // Upper body moves by the smaller step; T3 by its own.
    expect(weight("bench", "T2").alternatives!.map((a) => a.value)).toEqual([100, 105, 110]);
    expect(weight("lat_pulldown", "T3").alternatives!.map((a) => a.value)).toEqual([85, 90, 95]);
  });

  it("with no session yet it starts from the starting weight and adds nothing", () => {
    const trace = next(startSim()).weight("squat", "T1");
    expect(ids(trace).slice(0, 2)).toEqual(["starting-weight", "progression"]);
    expect(byId(trace, "starting-weight").effect).toEqual({ op: "start", value: 190, unit: "lb" });
    expect(byId(trace, "progression").effect).toEqual({ op: "none", unit: "lb" });
    expect(trace.result).toBe(190);
  });

  it("after a miss the weight stays and the trace says where the lift moved", () => {
    const { weight, scheme } = next(simOf({ t1: FAIL }));
    const trace = weight("squat", "T1");
    expect(byId(trace, "last-session").detail).toBe(
      "190 × 3, 3, 3, 3, 2. A set fell short of its target, so it counts as a miss."
    );
    expect(byId(trace, "progression")).toMatchObject({
      detail: "A miss keeps the weight and moves to 6 sets of 2.",
      effect: { op: "none", unit: "lb" },
    });
    expect(trace.result).toBe(190);

    const sets = scheme("squat", "T1");
    expect(sets.result).toBe("6x2");
    expect(sets.steps.map((s) => [s.id, s.effect.op, s.effect.value, s.effect.unit])).toEqual([
      ["last-session", "start", 3, "reps"],
      ["progression", "set", 2, "reps"],
      ["sets", "set", 6, "sets"],
    ]);
    expect(byId(sets, "progression").detail).toBe("A miss moves to 6 sets of 2.");
    expect(replayTrace(sets)).toBe("6x2");
  });

  it("after a miss at the last stage the weight restarts lower, and the sets go back", () => {
    const { weight, scheme } = next(simOf({ t1: FAIL }, { t1: FAIL }, { t1: FAIL }));
    const trace = weight("squat", "T1");
    expect(byId(trace, "last-session").detail).toContain("190 × 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.");
    expect(byId(trace, "progression")).toMatchObject({
      detail: "A miss at the last stage restarts at 85% of 190, rounded to 5.",
      effect: { op: "add", value: -30, unit: "lb" },
    });
    expect(trace.result).toBe(160);
    expect(replayTrace(trace)).toBe(160);
    expect(scheme("squat", "T1").result).toBe("5x3");
    expect(byId(scheme("squat", "T1"), "progression").detail).toBe(
      "A miss at the last stage goes back to 5 sets of 3."
    );
  });

  it("a lift stopped part-way or not done last time adds nothing", () => {
    const partial = next(simOf({ t1: PARTIAL })).weight("squat", "T1");
    expect(byId(partial, "last-session").detail).toBe("190 × 3. Stopped part-way.");
    expect(byId(partial, "progression")).toMatchObject({
      detail: "Only a lift finished as planned moves the weight.",
      effect: { op: "none", unit: "lb" },
    });

    const skipped = next(simOf({ t1: { sets: 0 } })).weight("squat", "T1");
    expect(byId(skipped, "last-session").detail).toBe("Not done that day.");
    expect(skipped.result).toBe(190);
  });

  it("an accepted lighter weight on a T2 lift holds it, and cites the rule that suggested it", () => {
    const trace = next(simOf({ t2: { drop: true } })).weight("bench", "T2");
    expect(byId(trace, "last-session").detail).toBe(
      "100 × 10, 95 × 10, 95 × 10. You took the lighter weight the app suggested."
    );
    expect(byId(trace, "progression")).toMatchObject({
      detail: "A held lift is neither a pass nor a miss: the weight stays.",
      effect: { op: "none", unit: "lb" },
      ruleId: "t2-autoregulation",
    });
    expect(trace.result).toBe(100);
  });

  it("a weight changed outside a workout since then is its own step", () => {
    const sim = simOf({});
    adjust(sim, "squat", { t1Weight: 150 }, new Date(sim.workouts[0].completedAt!.getTime() + 60_000));
    const trace = next(sim).weight("squat", "T1");
    expect(ids(trace).slice(0, 3)).toEqual(["last-session", "progression", "adjustment"]);
    expect(byId(trace, "adjustment")).toMatchObject({
      title: "Changed since",
      effect: { op: "set", value: 150, unit: "lb" },
    });
    expect(byId(trace, "adjustment").detail).toMatch(/^Set to 150 outside a workout, on \w+ \d+\.$/);
    expect(trace.result).toBe(150);
    expect(replayTrace(trace)).toBe(150);
  });

  it("a weight the plates cannot make is not rounded: the step says what the bar carries", () => {
    const sim = simOf({});
    adjust(sim, "squat", { t1Weight: 192 }, new Date(sim.workouts[0].completedAt!.getTime() + 60_000));
    const trace = next(sim).weight("squat", "T1");
    expect(byId(trace, "plates")).toEqual({
      id: "plates",
      title: "Plates",
      detail:
        "Your plates cannot make 192 exactly. The bar carries 190: 45, 25 and 2.5 a side. The plan stays at 192.",
      effect: { op: "none", unit: "lb" },
    });
    expect(trace.result).toBe(192);
    expect(replayTrace(trace)).toBe(192);
  });

  it("a weight you set for the day is the last step, and the result", () => {
    const { weight, entry } = next(simOf({}), {
      edits: [{ kind: "weight", exerciseId: "squat", tier: "T1", weight: 210 }],
    });
    expect(entry("squat", "T1").weight).toBe(210);
    const trace = weight("squat", "T1");
    expect(trace.steps.at(-1)).toEqual({
      id: "your-change",
      title: "Your change",
      detail:
        "You set 210 for today, heavier than the program asks for. If every set is done that heavy, progression carries on from what you lift. A missed rep at the heavier weight changes nothing: the program weight stays at 200.",
      effect: { op: "set", value: 210, unit: "lb" },
      ruleId: "off-program-credit",
    });
    expect(trace.result).toBe(210);
    expect(replayTrace(trace)).toBe(210);
    expect(trace.alternatives!.map((a) => a.value)).toEqual([200, 210, 220]);
  });
});

describe("explainPrescription: the checks that never change a weight", () => {
  const pain = (overrides: Partial<PainSorenessEntry>): PainSorenessEntry => ({
    id: "p1",
    clientId: "p1",
    date: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
    region: "lower_back",
    sensation: "pain",
    severity: 2,
    synced: true,
    ...overrides,
  });

  it("names the day's readiness answers and score, and still changes nothing", () => {
    const { weight } = next(simOf({}), {
      context: { readiness: { sleepHours: "<5", stressLevel: "low", score: 41.6 } },
    });
    const check = byId(weight("squat", "T1"), "readiness");
    expect(check.title).toBe("Readiness 42");
    expect(check.detail).toBe(
      "You logged under 5 hours of sleep and low energy. Never changes a weight. Under 5 hours of sleep with low energy only suggests skipping accessories."
    );
    expect(check.effect).toEqual({ op: "none", unit: "lb" });
  });

  it("mentions active pain in an area the lift loads, and leaves the weight alone", () => {
    const { weight } = next(simOf({}), { context: { painEntries: [pain({})] } });
    const squat = weight("squat", "T1");
    expect(byId(squat, "pain").detail).toMatch(
      /^You logged lower back pain on \w+ \d+\. The app shows it before you start and never changes a weight for pain on its own\.$/
    );
    expect(byId(squat, "pain").effect).toEqual({ op: "none", unit: "lb" });
    expect(squat.result).toBe(200);
    // Bench does not load the lower back.
    expect(byId(weight("bench", "T2"), "pain").detail).toMatch(/^No recent pain logged for /);
  });

  it("ignores soreness, pain that has gone stale and pain logged after now", () => {
    const day = 24 * 60 * 60 * 1000;
    for (const entry of [
      pain({ sensation: "soreness" }),
      pain({ date: new Date(NOW.getTime() - 30 * day) }),
      pain({ date: new Date(NOW.getTime() + day) }),
    ]) {
      const { weight } = next(simOf({}), { context: { painEntries: [entry] } });
      expect(byId(weight("squat", "T1"), "pain").detail).toMatch(/^No recent pain logged for /);
    }
  });

  it("outside a cut the phase step names the phase and no rest change", () => {
    const { weight } = next(simOf({}), { context: { phase: { mode: "bulking" } } });
    const phase = byId(weight("squat", "T1"), "phase");
    expect(phase.title).toBe("Bulking phase");
    expect(phase.detail).toBe("Weight stays. Your phase does not change this lift's rest either.");
    expect(phase.ruleId).toBeUndefined();
  });
});

describe("explainPrescription: T3, accessories, warm-ups and lifts swapped in", () => {
  it("a T3 lift goes up from the last set, by the T3 rule", () => {
    const up = next(simOf({ t3: { lastReps: 26 } })).weight("lat_pulldown", "T3");
    expect(byId(up, "last-session").detail).toBe("90 × 15, 15, 26. Last set: 26 reps.");
    expect(byId(up, "progression")).toMatchObject({
      detail: "At 90 the last set needed 18 reps and reached them, which adds 5 lb.",
      effect: { op: "add", value: 5, unit: "lb" },
      ruleId: "t3-progression",
    });
    expect(up.result).toBe(95);
    // A cable lift has no plates to load.
    expect(ids(up)).toEqual(["last-session", "progression", "readiness", "pain", "phase"]);
    expect(byId(up, "pain").detail).toBe("No body area is watched for this lift.");

    const same = next(simOf({ t3: { lastReps: 17 } })).weight("lat_pulldown", "T3");
    expect(byId(same, "progression")).toMatchObject({
      detail: "At 90 it goes up when the last set reaches 18 reps.",
      effect: { op: "none", unit: "lb" },
    });
  });

  it("an accessory starts from its standard weight", () => {
    const { weight, entry, scheme } = next(simOf({}), { accessories: ["face_pulls"] });
    const trace = weight("face_pulls", "accessory");
    expect(trace.steps[0]).toMatchObject({
      id: "accessory-start",
      effect: { op: "start", value: entry("face_pulls", "accessory").weight, unit: "lb" },
    });
    expect(ids(trace)).not.toContain("progression");
    expect(trace.result).toBe(entry("face_pulls", "accessory").weight);
    expect(replayTrace(trace)).toBe(trace.result);
    expect(scheme("face_pulls", "accessory").result).toBe("3x15");
  });

  it("a warm-up set follows from the working weight, through the warm-up generator", () => {
    const { plan, context } = next(simOf({}));
    const warmUps = plan.filter((e) => e.isWarmUp && e.exerciseId === "squat");
    expect(warmUps.length).toBeGreaterThan(1);
    warmUps.forEach((entry, i) => {
      const trace = explainPrescription(entry, context, plan);
      expect(trace.steps.map((s) => s.id)).toEqual(["working-weight", "warm-up"]);
      expect(trace.steps[0].effect).toEqual({ op: "start", value: 200, unit: "lb" });
      expect(trace.steps[1].title).toBe(`Warm-up ${i + 1} of ${warmUps.length}`);
      expect(trace.result).toBe(entry.weight);
      expect(replayTrace(trace)).toBe(entry.weight);
      expect(trace.alternatives).toBeUndefined();
    });
    // Without the plan there is nothing to derive it from: one honest step.
    const alone = explainPrescription(warmUps[1], context);
    expect(alone.steps.map((s) => s.id)).toEqual(["warm-up"]);
    expect(replayTrace(alone)).toBe(warmUps[1].weight);
  });

  it("an exercise swapped in for the day is your choice, not the program's", () => {
    const { plan, context } = next(simOf({}), {
      edits: [{ kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "incline_db_press" }],
    });
    const swapped = plan.find((e) => e.exerciseId === "incline_db_press")!;
    const trace = explainPrescription(swapped, context, plan);
    expect(trace.steps[0]).toMatchObject({ id: "your-choice", ruleId: "off-program-credit" });
    expect(trace.result).toBe(swapped.weight);
    expect(replayTrace(trace)).toBe(swapped.weight);
  });
});

describe("explainPrescription: at home", () => {
  // 2026-11-16 (H3): a first home weight is the exercise's starting ratio to the lift
  // (here with no strength sets given, so ratio x the barbell weight), not 80% of it.
  it("ends with the home exercise's first weight from its starting ratio", () => {
    const sim = simOf({});
    const { weight, entry } = next(sim, { location: "home" });

    const bench = weight("bench", "T2");
    expect(entry("bench", "T2")).toMatchObject({ substituteExerciseId: "db_bench", weight: 45 });
    expect(bench.steps.at(-1)).toEqual({
      id: "dumbbell",
      title: "At home with dumbbells",
      detail:
        "DB Bench Press: a first time here, so it starts at 0.83 of your bench press: 0.83 × 105 is 87.2 in all, split between two hands, rounded to 5, is 45 per hand.",
      effect: { op: "set", value: 45, unit: "lb" },
      ruleId: "transfer-ratio",
    });
    expect(ids(bench)).not.toContain("plates");
    expect(bench.result).toBe(45);
    expect(bench.alternatives!.map((a) => a.value)).toEqual([40, 45, 50]);

    // 200 on the bar is too much for one dumbbell, so the next exercise that fits stands in.
    const squat = weight("squat", "T1");
    expect(entry("squat", "T1")).toMatchObject({
      substituteExerciseId: "bulgarian_split_squat",
      weight: 50,
    });
    expect(squat.steps.at(-1)).toMatchObject({
      detail:
        "Goblet Squat would need more than your heaviest dumbbell, so Bulgarian Split Squat stands in: a first time here, so it starts at 0.50 of your squat: 0.50 × 200 is 100 in all, split between two hands, rounded to 5, is 50 per hand.",
      effect: { op: "set", value: 50, unit: "lb" },
    });
    expect(replayTrace(squat)).toBe(50);
    // The steps before it are still about the barbell weight.
    expect(byId(squat, "progression").effect).toEqual({ op: "add", value: 10, unit: "lb" });
  });

  it("names the imported session a first home weight from the exercise's own history rests on (made-up history)", () => {
    const sim = simOf({});
    const at = new Date(2026, 1, 20, 12);
    const imported = [
      importedSession(
        [0, 1, 2].map(() =>
          importedSet({ exerciseName: "Dumbbell Bench Press", mappedExerciseId: "db_bench", weightPerImplementLb: 45, reps: 10 })
        ),
        { startedAt: at }
      ),
    ];
    const sets = strengthEvidenceOf(sim.workouts, imported);
    const rebuilt = rebuildDerived(rebuildInput(sim));
    const plan = buildWorkoutPlan({
      template: WORKOUT_TEMPLATES.A1,
      liftStates: rebuilt.liftStates,
      location: "home",
      equipment: sim.settings.equipment,
      includeWarmUps: false,
      selectedAccessories: [],
      strengthSets: sets,
    });
    const entry = plan.find((e) => e.exerciseId === "bench" && e.tier === "T2")!;
    expect(entry.seed).toMatchObject({ source: "history", ownEstimate: 120, history: { weight: 45, reps: 10, perHand: true, imported: true } });
    const context: TraceContext = {
      now: NOW,
      location: "home",
      equipment: sim.settings.equipment,
      phase: sim.settings.trainingPhase,
      liftStates: rebuilt.liftStates,
      history: { workouts: sim.workouts, outcomes: rebuilt.outcomes, adjustments: sim.adjustments },
      home: { variantStates: [], sets },
    };
    const trace = explainPrescription(entry, context, plan);
    expect(trace.steps.at(-1)!.detail).toContain(
      "DB Bench Press: from your own history: 45 per hand × 10 on Feb 20, 2026 (imported) gives an estimated max of 120 in all; the heaviest weight for 10 reps, rounded down to 5, is 45 per hand."
    );
    expect(entry.weight).toBe(45);
    expect(replayTrace(trace)).toBe(entry.weight);
  });

  it("when even the substitute's first weight is too heavy, it is capped at your heaviest dumbbell", () => {
    const sim = simOf({});
    adjust(sim, "squat", { t1Weight: 340 }, new Date(sim.workouts[0].completedAt!.getTime() + 60_000));
    const { weight, entry } = next(sim, { location: "home" });
    const max = sim.settings.equipment.maxDumbbellWeight;
    expect(entry("squat", "T1")).toMatchObject({ substituteExerciseId: "bulgarian_split_squat", weight: max, cappedFrom: 85 });
    const squat = weight("squat", "T1");
    expect(squat.steps.at(-1)).toMatchObject({
      detail: `Goblet Squat would need more than your heaviest dumbbell, so Bulgarian Split Squat stands in: a first time here, so it starts at 0.50 of your squat: 0.50 × 340 is 170 in all, split between two hands, rounded to 5, is 85 per hand. Your heaviest dumbbell is ${max}, so it stops there and nothing heavier is offered.`,
      effect: { op: "set", value: max, unit: "lb" },
    });
    expect(replayTrace(squat)).toBe(max);
    expect(squat.alternatives!.map((a) => a.label)).toEqual(["easier", "the plan"]);
  });

  it("offers nothing heavier than your heaviest dumbbell, and says why", () => {
    const sim = simOf({});
    adjust(sim, "squat", { t1Weight: 320 }, new Date(sim.workouts[0].completedAt!.getTime() + 60_000));
    const { weight, entry } = next(sim, { location: "home" });
    const max = sim.settings.equipment.maxDumbbellWeight;
    // Bulgarian split squat at 0.5 x 320, 80 per hand, and the heaviest dumbbell is 80.
    expect(entry("squat", "T1")).toMatchObject({ substituteExerciseId: "bulgarian_split_squat", weight: max });
    const squat = weight("squat", "T1");
    expect(squat.alternatives).toEqual([
      { label: "easier", value: max - sim.settings.equipment.dumbbellIncrementLbs },
      { label: "the plan", value: max },
    ]);
    expect(squat.steps.at(-1)!.detail).toMatch(
      new RegExp(`One step heavier would need ${max + 5}, more than your heaviest dumbbell \\(${max}\\), so nothing heavier is offered\\.$`)
    );
    expect(replayTrace(squat)).toBe(max);

    // Where the next step fits, it is offered as before.
    const bench = weight("bench", "T2");
    expect(bench.alternatives!.map((a) => a.value)).toEqual([40, 45, 50]);
    expect(bench.steps.at(-1)!.detail).not.toMatch(/heavier/);
  });

  it("stops the heavier choice at your heaviest dumbbell when a step would pass it", () => {
    const sim = simOf({});
    // Bench T2 at 100: DB bench 0.83 x 100 = 83, 41.5 a hand, rounded to 40.
    adjust(sim, "bench", { t2Weight: 100 }, new Date(sim.workouts[0].completedAt!.getTime() + 60_000));
    const heavy = { ...sim.settings.equipment, maxDumbbellWeight: 42.5 };
    const { weight } = next({ ...sim, settings: { ...sim.settings, equipment: heavy } }, { location: "home" });
    const bench = weight("bench", "T2");
    expect(bench.result).toBe(40);
    expect(bench.alternatives).toEqual([
      { label: "easier", value: 35 },
      { label: "the plan", value: 40 },
      { label: "harder", value: 42.5, note: "heaviest dumbbell" },
    ]);
    expect(bench.steps.at(-1)!.detail).toMatch(
      /One step heavier would need 45, more than your heaviest dumbbell \(42\.5\), so the heavier choice stops at 42\.5\.$/
    );
  });

  it("holds a dumbbell lift done as itself at home to the heaviest dumbbell too, with a step that says so", () => {
    const sim = startSim();
    const light = { ...sim.settings.equipment, maxDumbbellWeight: 35 };
    const { weight } = next({ ...sim, settings: { ...sim.settings, equipment: light } }, {
      templateId: "B1",
      location: "home",
    });
    const row = weight("db_row", "T3");
    expect(row.result).toBe(35);
    expect(row.alternatives).toEqual([
      { label: "easier", value: 30 },
      { label: "the plan", value: 35 },
    ]);
    expect(byId(row, "dumbbell-limit")).toEqual({
      id: "dumbbell-limit",
      title: "Heaviest dumbbell",
      detail: "One step heavier would need 40, more than your heaviest dumbbell (35), so nothing heavier is offered.",
      effect: { op: "none", unit: "lb" },
    });
    expect(replayTrace(row)).toBe(35);
    // At the gym the dumbbells at home do not matter.
    const gym = next({ ...sim, settings: { ...sim.settings, equipment: light } }, { templateId: "B1" });
    expect(ids(gym.weight("db_row", "T3"))).not.toContain("dumbbell-limit");
  });

  // 2026-11-15 (H1): a home session progresses the home exercise's own weight and holds
  // the barbell lift; it used to add the dumbbell step to the barbell weight.
  it("a home session last time holds the barbell lift", () => {
    const sim = simOf({ location: "home" });
    const trace = next(sim).weight("squat", "T1");
    expect(byId(trace, "last-session").detail).toContain("with dumbbells at home.");
    expect(byId(trace, "progression")).toMatchObject({
      detail: "A held lift is neither a pass nor a miss: the weight stays.",
      effect: { op: "none", unit: "lb" },
    });
    expect(trace.result).toBe(190);
  });

  it("a lift that already works at home has no conversion step", () => {
    const { weight } = next(startSim(), { templateId: "B1", location: "home" });
    const row = weight("db_row", "T3");
    expect(ids(row)).not.toContain("dumbbell");
    expect(row.result).toBe(35);
  });
});

describe("explainScheme", () => {
  it("a lift with no session yet reads its stage from the lift state", () => {
    const trace = next(startSim()).scheme("squat", "T1");
    expect(trace).toMatchObject({
      subject: { kind: "scheme", exerciseId: "squat", tier: "T1" },
      result: "5x3",
      unit: "none",
    });
    expect(trace.steps.map((s) => s.id)).toEqual(["stage", "sets"]);
    expect(byId(trace, "sets").detail).toBe(
      "At 3 reps a set the program asks for 5 sets, the last one as many as you can."
    );
  });

  it("a T3 lift has one fixed scheme, from the workout template", () => {
    const trace = next(simOf({})).scheme("lat_pulldown", "T3");
    expect(trace.result).toBe("3x15");
    expect(trace.steps[0]).toMatchObject({
      id: "fixed-scheme",
      detail: "Always sets of 15, the last one as many as you can.",
      effect: { op: "start", value: 15, unit: "reps" },
      ruleId: "tier-structure",
    });
  });

  it("sets and reps you changed for the day are the last steps", () => {
    const { scheme, entry } = next(simOf({}), {
      edits: [{ kind: "scheme", exerciseId: "bench", tier: "T2", sets: 4, reps: 8 }],
    });
    expect(entry("bench", "T2")).toMatchObject({ targetSets: 4, targetReps: 8 });
    const trace = scheme("bench", "T2");
    expect(trace.result).toBe("4x8");
    expect(trace.steps.slice(-2).map((s) => [s.id, s.effect.value, s.effect.unit])).toEqual([
      ["your-change", 8, "reps"],
      ["your-change", 4, "sets"],
    ]);
    expect(trace.steps.at(-1)!.detail).toBe("You set 4 sets for today, so this lift is only logged.");
    expect(replayTrace(trace)).toBe("4x8");
  });

  it("a stage set outside a workout is its own step", () => {
    const sim = simOf({});
    adjust(sim, "squat", { t1Stage: "10x1" }, new Date(sim.workouts[0].completedAt!.getTime() + 60_000));
    const trace = next(sim).scheme("squat", "T1");
    expect(trace.result).toBe("10x1");
    expect(byId(trace, "adjustment")).toMatchObject({
      detail: "The stage was set to 10 sets of 1 outside a workout.",
      effect: { op: "set", value: 1, unit: "reps" },
    });
    expect(byId(trace, "sets").detail).toBe(
      "At 1 rep a set the program asks for 10 sets, the last one as many as you can."
    );
    expect(replayTrace(trace)).toBe("10x1");
  });
});
