// The rebuild's `before` and `outcomes` maps: for every completed workout, the lift
// states it was evaluated against and what the program rules did to each lift.
import { describe, expect, it } from "vitest";
import { isRuleId } from "@/lib/evidence";
import { outcomePoint } from "@/lib/progression";
import type { LiftState, ProgressionOutcome } from "@/types";
import { applyChange, rebuildDerived } from "./index";
import {
  FAIL,
  PARTIAL,
  adjust,
  rebuildInput,
  runSession,
  startSim,
  stateOf,
} from "./testHelpers";

const kinds = (outcomes: ProgressionOutcome[] | undefined) =>
  (outcomes ?? []).map((o) => `${o.exerciseId} ${o.tier} ${o.kind}`);

describe("rebuildDerived: outcomes and before", () => {
  it("are empty for an empty log", () => {
    const sim = startSim();
    const { outcomes, before } = rebuildDerived(rebuildInput(sim));
    expect(outcomes.size).toBe(0);
    expect(before.size).toBe(0);
  });

  it("have one entry per completed workout, in the same order as the snapshots", () => {
    const sim = startSim();
    for (let i = 0; i < 6; i++) runSession(sim);
    const { outcomes, before, snapshots } = rebuildDerived(rebuildInput(sim));
    expect([...outcomes.keys()]).toEqual([...snapshots.keys()]);
    expect([...before.keys()]).toEqual([...snapshots.keys()]);
    expect([...snapshots.keys()]).toEqual(sim.workouts.map((w) => w.id));
  });

  it("report a pass, a stage change, a reset, a partial and a lift that was not done", () => {
    const sim = startSim();
    const passed = runSession(sim, { templateId: "A1" });
    const missed = runSession(sim, { templateId: "A1", t1: FAIL, t2: PARTIAL, t3: { lastReps: 25 } });
    runSession(sim, { templateId: "A1", t1: FAIL, t2: { sets: 0 } });
    const reset = runSession(sim, { templateId: "A1", t1: FAIL });
    const { outcomes } = rebuildDerived(rebuildInput(sim));

    expect(kinds(outcomes.get(passed.id))).toEqual([
      "squat T1 passed",
      "bench T2 passed",
      "lat_pulldown T3 t3Same",
    ]);
    expect(kinds(outcomes.get(missed.id))).toEqual([
      "squat T1 stageDown",
      "bench T2 partial",
      "lat_pulldown T3 t3Up",
    ]);
    expect(kinds(outcomes.get(sim.workouts[2].id))).toEqual([
      "squat T1 stageDown",
      "bench T2 notDone",
      "lat_pulldown T3 t3Same",
    ]);
    expect(outcomes.get(reset.id)![0]).toMatchObject({
      kind: "reset",
      from: { weight: 200, stage: "10x1" },
      to: { weight: 170, stage: "5x3" },
    });
  });

  it("an accepted T2 load drop is held, with its reason", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1", t2: { drop: true } });
    const { outcomes } = rebuildDerived(rebuildInput(sim));
    expect(outcomes.get(w.id)![1]).toMatchObject({ exerciseId: "bench", kind: "held", reason: "loadDrop" });
  });

  it("before is the state the workout was evaluated against; the snapshot is the state after", () => {
    const sim = startSim();
    for (let i = 0; i < 8; i++) runSession(sim, i === 3 ? { t1: FAIL } : {});
    const { outcomes, before, snapshots } = rebuildDerived(rebuildInput(sim));
    for (const workout of sim.workouts) {
      const start = before.get(workout.id)!;
      const end = snapshots.get(workout.id)!;
      for (const outcome of outcomes.get(workout.id)!) {
        expect(outcome.from, workout.id).toEqual(outcomePoint(stateOf(start, outcome.exerciseId), outcome.tier));
        expect(outcome.to, workout.id).toEqual(outcomePoint(stateOf(end, outcome.exerciseId), outcome.tier));
        expect(isRuleId(outcome.ruleId)).toBe(true);
      }
      // Lifts the workout did not train are the same before and after.
      const trained = new Set(outcomes.get(workout.id)!.map((o) => o.exerciseId));
      for (const state of start) {
        if (!trained.has(state.exerciseId)) expect(stateOf(end, state.exerciseId)).toEqual(state);
      }
    }
  });

  it("before includes an adjustment made between two workouts and the stored prescription", () => {
    const sim = startSim();
    const first = runSession(sim, { templateId: "A1" });
    adjust(sim, "squat", { t1Weight: 150 }, new Date(first.completedAt!.getTime() + 60_000));
    const second = runSession(sim, { templateId: "A1" });
    const { before, snapshots, outcomes } = rebuildDerived(rebuildInput(sim));

    expect(stateOf(snapshots.get(first.id)!, "squat").t1Weight).toBe(200);
    expect(stateOf(before.get(second.id)!, "squat").t1Weight).toBe(150);
    expect(outcomes.get(second.id)![0]).toMatchObject({
      kind: "passed",
      from: { weight: 150, stage: "5x3" },
      to: { weight: 160, stage: "5x3" },
    });
  });

  it("hands out fresh copies: changing a returned state does not change the next rebuild", () => {
    const sim = startSim();
    const w = runSession(sim);
    const first = rebuildDerived(rebuildInput(sim));
    (first.before.get(w.id)![0] as LiftState).t1Weight = 999;
    first.outcomes.get(w.id)![0].to.weight = 999;
    const second = rebuildDerived(rebuildInput(sim));
    expect(second.before.get(w.id)![0].t1Weight).not.toBe(999);
    expect(second.outcomes.get(w.id)![0].to.weight).not.toBe(999);
  });

  it("follow an edit to the log: a corrected set changes that workout's outcome", () => {
    const sim = startSim();
    const w = runSession(sim, { templateId: "A1" });
    const lastSquat = w.sets.filter((s) => s.exerciseId === "squat").at(-1)!;
    const edited = applyChange(
      { workouts: sim.workouts, adjustments: sim.adjustments },
      { kind: "editSet", workoutId: w.id, setId: lastSquat.id, patch: { actualReps: 1 } }
    );
    const { outcomes } = rebuildDerived({ ...edited, settings: sim.settings });
    expect(outcomes.get(w.id)![0]).toMatchObject({ kind: "stageDown", to: { weight: 190, stage: "6x2" } });
  });

  it("a deleted or unfinished workout has no entry", () => {
    const sim = startSim();
    const kept = runSession(sim);
    const gone = runSession(sim);
    const log = applyChange(
      { workouts: sim.workouts, adjustments: sim.adjustments },
      { kind: "deleteWorkout", workoutId: gone.id }
    );
    const { outcomes, before } = rebuildDerived({ ...log, settings: sim.settings });
    expect([...outcomes.keys()]).toEqual([kept.id]);
    expect([...before.keys()]).toEqual([kept.id]);
  });
});
