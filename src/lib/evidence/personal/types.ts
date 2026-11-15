// Contracts for "Your own numbers". Pure types.
import type {
  ActivityLog,
  Forecast,
  ReadinessLog,
  RunLog,
  WorkoutSession,
} from "@/types";

/** The rules that have a "Your own numbers" card. */
export type PersonalRuleId = "rest-heavy" | "run-interference" | "readiness";

/**
 * The log the comparisons read. Rows are as stored: deleted ones may be included and
 * are left out here. `LedgerRecords` (src/lib/data/forecasts.ts) is one of these.
 */
export interface PersonalLog {
  workouts: WorkoutSession[];
  /** Stored forecasts; the reps forecast of a workout is its expected result. */
  forecasts: Forecast[];
  readinessLogs: ReadinessLog[];
  runs: RunLog[];
  activities: ActivityLog[];
}

/**
 * What the comparison says about the research's claim. "agrees": the whole range lies
 * on the side the research predicts; "opposite": the whole range lies on the other
 * side; "unclear": the range takes in no difference at all.
 */
export type PersonalVerdict = "agrees" | "unclear" | "opposite";

/** One side of the comparison. */
export interface PersonalGroup {
  /** What a result of this group is, after its number: "reps short on the next set after a short rest". */
  label: string;
  /** The group in a phrase: "after a short rest". */
  name: string;
  /** Results counted in the comparison. */
  count: number;
}

/** The numbers, present only once both groups reach the minimum. */
export interface PersonalResult {
  /** Average of the group the research says should do worse. */
  exposedMean: number;
  /** Average of the group to compare it with. */
  referenceMean: number;
  /** exposedMean − referenceMean. */
  difference: number;
  /** The range around the difference, at `level`. */
  low: number;
  high: number;
  level: number;
  verdict: PersonalVerdict;
}

/** "Your own numbers" for one rule. */
export interface PersonalEvidence {
  ruleId: PersonalRuleId;
  /** What one result is: a heavy set or a session. */
  unit: { one: string; many: string };
  /** The group the research says should do worse (short rest, hard run, short sleep). */
  exposed: PersonalGroup;
  /** The group it is compared with. */
  reference: PersonalGroup;
  /**
   * Results left out because nothing like them was in the other group (rest only: a
   * kind of set with only one kind of rest so far).
   */
  unmatched: number;
  /** Why unmatched results wait, after their count: "wait for a match: ...". Null when none can. */
  unmatchedReason: string | null;
  /** PERSONAL_MIN_GROUP_SIZE when the result was worked out. */
  minPerGroup: number;
  /** How many more results each group needs before numbers are shown; 0 once enough. */
  needed: { exposed: number; reference: number };
  /** Null below the minimum sample: the card then says how many more are needed. */
  result: PersonalResult | null;
  /** How it is worked out, sentence by sentence, with the numbers it uses. */
  method: string[];
}
