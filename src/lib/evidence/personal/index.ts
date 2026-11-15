// "Your own numbers": what the user's own log says about the question a rule's research
// answers. Pure functions over the log; no React, no database, no clock (callers pass
// `now`). A hint from one person's log, never proof of a cause.
// Spec: docs/plans/2026-11-14-glass-box-design.md (G12).
import type { RuleId } from "@/lib/evidence/rules";
import { restLengthEvidence } from "./rest";
import { runEvidence } from "./run";
import { sleepEvidence } from "./sleep";
import type { PersonalEvidence, PersonalLog, PersonalRuleId } from "./types";

export type {
  PersonalEvidence,
  PersonalGroup,
  PersonalLog,
  PersonalResult,
  PersonalRuleId,
  PersonalVerdict,
} from "./types";
export {
  HARD_ACTIVITY_EFFORT,
  HARD_RUN_EFFORT,
  HARD_SESSION_WINDOW_HOURS,
  MAX_SET_GAP_SECONDS,
  PERSONAL_INTERVAL_LEVEL,
  PERSONAL_MIN_GROUP_SIZE,
  REPS_ROUNDING_VARIANCE,
  SET_DURATION_ALLOWANCE_SECONDS,
  SHORT_REST_MARGIN_SECONDS,
} from "./constants";
export { NOT_PROOF, VERDICT_LABELS, formatSignedReps } from "./copy";
export { compareStrata, normalQuantile, tQuantile, type Stratum } from "./stats";
export { lastSetResiduals, type LastSetResidual } from "./expected";
export { restLengthEvidence, restPairs, type RestPair } from "./rest";
export { hardSessionBefore, isLowerBodyLift, runEvidence } from "./run";
export { checkInFor, sleepEvidence } from "./sleep";

const BUILDERS: Record<PersonalRuleId, (log: PersonalLog, now: Date) => PersonalEvidence> = {
  "rest-heavy": restLengthEvidence,
  "run-interference": runEvidence,
  readiness: sleepEvidence,
};

/** The rules with a "Your own numbers" card, in the order the research library lists them. */
export const PERSONAL_RULE_IDS = Object.keys(BUILDERS) as PersonalRuleId[];

export function hasPersonalEvidence(ruleId: string): ruleId is PersonalRuleId {
  return Object.prototype.hasOwnProperty.call(BUILDERS, ruleId);
}

/** "Your own numbers" for a rule, or null for a rule that has none. */
export function personalEvidenceFor(
  ruleId: RuleId,
  log: PersonalLog,
  now: Date
): PersonalEvidence | null {
  return hasPersonalEvidence(ruleId) ? BUILDERS[ruleId](log, now) : null;
}
