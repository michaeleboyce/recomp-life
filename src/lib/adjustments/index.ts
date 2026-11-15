// The adjustment log: one feed of every change to the plan, a forecast or a rule, with
// its reason, its evidence rule and a link. Pure functions: no React, no database, no
// clock. Spec: docs/plans/2026-11-14-glass-box-design.md ("Adjustment log").

export type { AdjustmentFeedInput, AdjustmentUndo, FeedGroup } from "./types";

export { buildAdjustmentFeed, entryGrade } from "./feed";
export { FEED_GROUPS, filterFeed, groupsOf } from "./filter";
export { UNDO_NOTE, undoAdjustment } from "./liftAdjustments";
export { FEED_HREFS, liftHref, ruleHref } from "./text";
