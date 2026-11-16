// Data layer: dated changes to a lift made outside a workout (starting weights, a
// manual change, an accepted time-off reduction). Lift states are never written
// directly: an adjustment is logged and the rebuild applies it.
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import type { DerivedDiff } from "@/lib/rebuild";
import type { LiftAdjustment, Tier } from "@/types";
import { applyRebuild, rebuildTables } from "./derived";
import { newRowStamps } from "./stamp";

export interface NewAdjustment {
  exerciseId: string;
  source: LiftAdjustment["source"];
  set: LiftAdjustment["set"];
  /**
   * For a home exercise standing in for `exerciseId` at a tier: the rebuild sets that
   * exercise's own weight (and stage) from the tier's fields of `set`, not the barbell lift's.
   */
  variant?: { exerciseId: string; tier: Tier } | null;
  /** Defaults to now. */
  at?: Date;
  note?: string;
}

/** Stores the adjustment and rebuilds the derived tables in the same transaction. */
export async function recordAdjustment(adjustment: NewAdjustment): Promise<DerivedDiff> {
  const id = uuidv4();
  const row: LiftAdjustment = {
    id,
    clientId: id,
    exerciseId: adjustment.exerciseId,
    at: adjustment.at ?? new Date(),
    source: adjustment.source,
    set: { ...adjustment.set },
    ...(adjustment.variant
      ? { variant: { exerciseId: adjustment.variant.exerciseId, tier: adjustment.variant.tier } }
      : {}),
    ...(adjustment.note !== undefined ? { note: adjustment.note } : {}),
    ...newRowStamps(),
  };
  return db.transaction("rw", rebuildTables(), async () => {
    await db.liftAdjustments.add(row);
    return applyRebuild();
  });
}
