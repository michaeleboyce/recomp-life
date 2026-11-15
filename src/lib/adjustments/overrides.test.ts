// Weight overrides: the user lifted (or set) a weight other than the planned one. An
// override is the user's choice, so the wording is neutral and no rule is cited.
import { describe, expect, it } from "vitest";
import { forecastRow } from "@/lib/forecast/testHelpers";
import { rebuildDerived } from "@/lib/rebuild";
import { runSession, startSim, type Sim } from "@/lib/rebuild/testHelpers";
import { workoutDetailHref } from "@/lib/routes";
import type { SetLog, WorkoutSession } from "@/types";
import { overrideEntries } from "./overrides";
import { feedInput, textOf } from "./testHelpers";
import type { AdjustmentFeedInput } from "./types";

/** The feed input after the sim's workouts were changed by `edit`. */
function editedInput(
  sim: Sim,
  edit: (workout: WorkoutSession) => WorkoutSession,
  parts: Partial<AdjustmentFeedInput> = {}
): AdjustmentFeedInput {
  const workouts = sim.workouts.map(edit);
  const rebuild = rebuildDerived({ workouts, adjustments: sim.adjustments, settings: sim.settings });
  return feedInput(sim, { workouts, rebuild, ...parts });
}

const editSets =
  (exerciseId: string, change: (set: SetLog, index: number) => Partial<SetLog>) =>
  (workout: WorkoutSession): WorkoutSession => {
    let index = -1;
    return {
      ...workout,
      sets: workout.sets.map((set) => {
        if (set.exerciseId !== exerciseId) return set;
        index += 1;
        return { ...set, ...change(set, index) };
      }),
    };
  };

const entriesOf = (input: AdjustmentFeedInput) => overrideEntries(input).map((ranked) => ranked.entry);

describe("overrideEntries", () => {
  it("says nothing when every set was lifted at the planned weight", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    runSession(sim, { templateId: "B1", location: "home" });
    expect(entriesOf(feedInput(sim))).toEqual([]);
  });

  it("a heavier weight with every set made: neutral words, no rule, next weight builds from it", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1" });
    const entries = entriesOf(editedInput(sim, editSets("squat", () => ({ weight: 200 }))));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: `override:${workout.id}:squat:T1`,
      at: workout.completedAt,
      source: "override",
      title: "Squat T1: you lifted 200 instead of the planned 190",
      detail: "The next weight builds from what you lifted: 210.",
      href: workoutDetailHref(workout.id),
    });
  });

  it("a heavier weight with reps missed is not counted as a miss", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const entries = entriesOf(
      editedInput(
        sim,
        editSets("squat", (set, i) =>
          i === 4 ? { weight: 200, actualReps: 2, status: "failed" } : { weight: 200 }
        )
      )
    );
    expect(entries[0].title).toBe("Squat T1: you lifted 200 instead of the planned 190");
    expect(entries[0].detail).toBe(
      "You missed reps at that weight, which is not counted as a miss; the plan stays at 190."
    );
  });

  it("a lighter weight is logged and leaves the plan where it was", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const entries = entriesOf(editedInput(sim, editSets("bench", () => ({ weight: 90 }))));
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Bench press T2: you lifted 90 instead of the planned 100");
    expect(entries[0].detail).toBe("It is logged as lifted and the plan stays at 100.");
  });

  it("some sets at another weight", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const entries = entriesOf(
      editedInput(sim, editSets("squat", (set, i) => (i >= 3 ? { weight: 200 } : {})))
    );
    expect(entries[0].title).toBe(
      "Squat T1: you lifted two of five sets at 200 instead of the planned 190"
    );
    expect(entries[0].detail).toBe("Progression was worked out as usual from the planned 190.");
  });

  it("every set at a different weight, not all the same", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const entries = entriesOf(
      editedInput(sim, editSets("squat", (set, i) => ({ weight: i < 2 ? 195 : 205 })))
    );
    expect(entries[0].title).toBe("Squat T1: you lifted 195 to 205 instead of the planned 190");
  });

  it("a T3 lift has no tier in its title", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const entries = entriesOf(editedInput(sim, editSets("lat_pulldown", () => ({ weight: 100 }))));
    expect(entries[0].title).toBe("Lat pulldown: you lifted 100 instead of the planned 90");
    expect(entries[0].detail).toBe("The next weight builds from what you lifted: 100.");
  });

  it("a set lightened for a run, pain or equipment, or by an accepted drop, is not an override", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", t2: { drop: true } });
    const input = editedInput(
      sim,
      editSets("squat", (set, i) =>
        i === 2 ? { weight: 170, status: "reduced_run_fatigue" } : {}
      )
    );
    expect(entriesOf(input)).toEqual([]);
  });

  it("a home substitute is compared as the program lift it stands for", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1", location: "home" });
    const squatSets = sim.workouts[0].sets.filter((set) => set.exerciseId === "squat");
    expect(squatSets.every((set) => set.isSubstituted && set.originalWeight === 190)).toBe(true);
    expect(entriesOf(feedInput(sim))).toEqual([]);

    const lighter = entriesOf(editedInput(sim, editSets("squat", () => ({ originalWeight: 170 }))));
    expect(lighter[0].title).toBe(
      "Squat T1: you went lighter than the planned 190 on the home substitute"
    );
  });

  it("says when the forecast made for the planned weight is set aside", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1" });
    const forecast = forecastRow({
      id: `fc:${workout.id}:amrapReps:squat:T1`,
      slot: `fc:${workout.id}:amrapReps:squat:T1`,
      workoutId: workout.id,
      event: { type: "amrapReps", weight: 190 },
    });
    const edit = editSets("squat", () => ({ weight: 200 }));

    expect(entriesOf(editedInput(sim, edit, { forecasts: [forecast] }))[0].detail).toBe(
      "The next weight builds from what you lifted: 210. " +
        "The forecast made for 190 is set aside, not scored as a miss."
    );
    // A forecast that was made for the weight lifted still stands.
    const made = { ...forecast, event: { type: "amrapReps" as const, weight: 200 } };
    expect(entriesOf(editedInput(sim, edit, { forecasts: [made] }))[0].detail).toBe(
      "The next weight builds from what you lifted: 210."
    );
  });

  it("a weight set before starting for a lift that was then not done", () => {
    const sim = startSim();
    const workout = runSession(sim, { templateId: "A1", t2: { sets: 0 } });
    const entries = entriesOf(
      editedInput(sim, (w) => ({
        ...w,
        planEdits: [{ kind: "weight", exerciseId: "bench", tier: "T2", weight: 110 }],
      }))
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: `override:${workout.id}:bench:T2`,
      title: "Bench press T2: you set 110 for this workout instead of the planned 100",
      detail: "The lift was not done, so nothing changes.",
    });
  });

  it("a weight set before starting and then lifted is one entry, from the sets", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const entries = entriesOf(
      editedInput(sim, (w) => ({
        ...editSets("bench", () => ({ weight: 110 }))(w),
        planEdits: [{ kind: "weight", exerciseId: "bench", tier: "T2", weight: 110 }],
      }))
    );
    expect(entries.map((entry) => entry.title)).toEqual([
      "Bench press T2: you lifted 110 instead of the planned 100",
    ]);
  });

  it("works for a workout stored without its prescription", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const entries = entriesOf(
      editedInput(sim, (w) => ({
        ...editSets("squat", () => ({ weight: 200 }))(w),
        prescribed: undefined,
      }))
    );
    expect(entries.map((entry) => entry.title)).toEqual([
      "Squat T1: you lifted 200 instead of the planned 190",
    ]);
  });

  it("never blames: no rule, no undo, no fault words", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    runSession(sim, { templateId: "B1" });
    const entries = entriesOf(
      editedInput(sim, (w) =>
        editSets("squat", (set, i) => (i === 4 ? { weight: 200, actualReps: 1, status: "failed" } : { weight: 200 }))(
          editSets("deadlift", () => ({ weight: 100 }))(w)
        )
      )
    );
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.ruleId).toBeUndefined();
      expect(entry.undo).toBeUndefined();
      expect(textOf(entry)).not.toMatch(/fail|wrong|should|mistake|error|too (heavy|light)|ignored/i);
    }
  });

  it("a deleted or unfinished workout gives nothing", () => {
    const sim = startSim();
    runSession(sim, { templateId: "A1" });
    const heavier = editSets("squat", () => ({ weight: 200 }));
    expect(entriesOf(editedInput(sim, (w) => ({ ...heavier(w), deletedAt: 5 })))).toEqual([]);
    expect(entriesOf(editedInput(sim, (w) => ({ ...heavier(w), completedAt: null })))).toEqual([]);
  });
});
