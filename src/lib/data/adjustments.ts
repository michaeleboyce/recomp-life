// Data layer: dated changes to a lift made outside a workout (starting weights, a
// manual change, an accepted time-off reduction). Contracts only: implemented by data-edits.
import type { DerivedDiff } from "@/lib/rebuild";
import type { LiftAdjustment } from "@/types";

export interface NewAdjustment {
  exerciseId: string;
  source: LiftAdjustment["source"];
  set: LiftAdjustment["set"];
  /** Defaults to now. */
  at?: Date;
  note?: string;
}

/** Stores the adjustment and rebuilds the derived tables in the same transaction. */
export async function recordAdjustment(adjustment: NewAdjustment): Promise<DerivedDiff> {
  void adjustment;
  throw new Error("recordAdjustment is not implemented yet");
}
