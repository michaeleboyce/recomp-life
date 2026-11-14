// The rebuild engine: lift states and e1RM rows are projections of the log.
// Pure TypeScript: no React, no database, no clock, no randomness.
// Rules: docs/plans/2026-11-12-edit-rebuild-plan.md ("Engine rules").
export type * from "./types";

export { rebuildDerived, emptyLiftState, programLiftIds, anchorToPrescription } from "./fold";
export { e1rmsForWorkout, e1rmRowId } from "./e1rm";
export { applyChange } from "./change";
export { previewLogChange, compareRebuilds, tierPrescription } from "./preview";
export { diffDerived } from "./diff";
