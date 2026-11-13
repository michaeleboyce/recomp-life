// Data layer: keeps the derived tables (liftStates, estimated1RMs) equal to what the
// rebuild engine computes from the log. Contracts only: implemented by data-edits.
import type { DerivedDiff, RebuildInput } from "@/lib/rebuild";

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet`);
};

/** Everything the engine needs, read from the local database. */
export async function loadRebuildInput(): Promise<RebuildInput> {
  return notImplemented("loadRebuildInput");
}

/**
 * Rebuilds lift states and e1RM rows from the log and writes only the rows that
 * differ. Joins the caller's Dexie transaction when there is one.
 */
export async function applyRebuild(): Promise<DerivedDiff> {
  return notImplemented("applyRebuild");
}

/** Same comparison as `applyRebuild`, without writing anything. */
export async function checkDerived(): Promise<DerivedDiff> {
  return notImplemented("checkDerived");
}
