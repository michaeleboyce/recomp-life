// Fixed choices behind "Your own numbers". They decide how the log is read, not what
// the app coaches, so no training number depends on them. The card's method text
// reads them from here.
import { RUN_ADVISORY_WINDOW_HOURS, RUN_HARD_EFFORT } from "@/lib/runRecovery";
import { ACTIVITY_HARD_EFFORT } from "@/lib/activities";

/** Fewest results in each group before any number is shown. */
export const PERSONAL_MIN_GROUP_SIZE = 5;

/** The level of the range shown around the gap between the two groups. */
export const PERSONAL_INTERVAL_LEVEL = 0.9;

/**
 * Reps are counted in whole numbers, so a group's spread is taken as at least the
 * spread rounding alone gives (a uniform spread one rep wide: 1/12 rep²). Without it,
 * five identical results would claim a gap known exactly.
 */
export const REPS_ROUNDING_VARIANCE = 1 / 12;

// ── Rest ────────────────────────────────────────────────────────────────────

/**
 * Rest is not stored reliably (`restAfterSeconds` is written as 0), so it is read from
 * the time between logging two sets of the same lift, less this many seconds for
 * doing the second set and tapping its reps.
 */
export const SET_DURATION_ALLOWANCE_SECONDS = 30;

/** A rest at least this much shorter than the planned rest counts as short. */
export const SHORT_REST_MARGIN_SECONDS = 30;

/** A longer gap between two sets is a break, not a rest, and is left out. */
export const MAX_SET_GAP_SECONDS = 15 * 60;

// ── A hard run or session the day before ──────────────────────────────────────

/** Hours before a workout in which a hard run or session counts. */
export const HARD_SESSION_WINDOW_HOURS = RUN_ADVISORY_WINDOW_HOURS;

/** Effort (1 to 5) at or above which a run counts as hard; the app's own threshold. */
export const HARD_RUN_EFFORT = RUN_HARD_EFFORT;

/** Effort (1 to 5) at or above which another session counts as hard; the app's own threshold. */
export const HARD_ACTIVITY_EFFORT = ACTIVITY_HARD_EFFORT;
