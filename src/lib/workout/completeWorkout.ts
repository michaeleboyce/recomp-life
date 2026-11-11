import type { CompletionInput, CompletionResult } from "./types";

const NOT_IMPLEMENTED = "not implemented: src/lib/workout contract stub";

/**
 * Everything that changes when a workout is finished, computed without touching the
 * database: new lift states (progression, or a freeze that only updates the last-
 * workout date when an exercise was partially completed) and the patch for the
 * session row. T1 and T2 share one code path.
 */
export function computeCompletion(input: CompletionInput): CompletionResult {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}
