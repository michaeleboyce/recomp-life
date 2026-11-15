// Test-only builders for the adjustment feed tests. Not exported from index.ts.
import { rebuildDerived } from "@/lib/rebuild";
import { makeAdjustment, rebuildInput, type Sim } from "@/lib/rebuild/testHelpers";
import type { AdjustmentEntry, CoachEvent, LiftAdjustment } from "@/types";
import type { AdjustmentFeedInput } from "./types";

/** The feed input for a simulated log, with no forecasts, coach events or rule changes. */
export function feedInput(sim: Sim, parts: Partial<AdjustmentFeedInput> = {}): AdjustmentFeedInput {
  return {
    workouts: sim.workouts,
    adjustments: sim.adjustments,
    rebuild: rebuildDerived(rebuildInput(sim)),
    forecasts: [],
    coachEvents: [],
    changelog: [],
    ...parts,
  };
}

/**
 * A change outside a workout from a given source: recorded in the log and applied to
 * the live states, the way `adjust` does for a manual one.
 */
export function adjustFrom(
  sim: Sim,
  source: LiftAdjustment["source"],
  exerciseId: string,
  set: LiftAdjustment["set"],
  at: Date,
  id = `${source}-${sim.adjustments.length + 1}`
): LiftAdjustment {
  sim.states = sim.states.map((ls) => (ls.exerciseId === exerciseId ? { ...ls, ...set } : ls));
  const adjustment = makeAdjustment(exerciseId, set, at, { id, clientId: id, source });
  sim.adjustments.push(adjustment);
  return adjustment;
}

export function coachEvent(overrides: Partial<CoachEvent> = {}): CoachEvent {
  return {
    id: "ce-1",
    clientId: "ce-1",
    at: new Date("2026-11-10T12:02:00Z"),
    kind: "settingsChange",
    title: "Rest after heavy sets 3:00 → 3:30",
    detail: "You set your phase to cutting.",
    ruleId: "rest-cut-bonus",
    synced: false,
    ...overrides,
  };
}

export const bySource = (feed: AdjustmentEntry[], source: AdjustmentEntry["source"]) =>
  feed.filter((entry) => entry.source === source);

/** Every word shown to the user in an entry. */
export const textOf = (entry: AdjustmentEntry) =>
  [entry.title, entry.detail, entry.change?.from ?? "", entry.change?.to ?? ""].join(" ");
