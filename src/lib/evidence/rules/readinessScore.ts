import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";

/**
 * The readiness score. Registered as planned until the readiness screen ships.
 * The inputs have their own rules (readiness, recovery-windows, run-interference,
 * activity-fatigue, training-with-pain); this rule covers the points given to each.
 * Spec: docs/plans/2026-11-14-glass-box-design.md
 */
export const READINESS_SCORE_RULES = {
  "readiness-score": {
    area: "recovery",
    status: "planned",
    title: "How is the readiness score worked out?",
    summary: "Readiness adds up sleep, stress, rest, recent activity and soreness",
    appBehavior:
      "The score starts from your usual level and adds or takes points for last night's sleep, stress, days since you last trained the muscles, recent runs or other hard sessions, and soreness. It shifts the app's forecasts. It never changes a weight.",
    rationale:
      "Each input is known to affect performance or recovery. Showing every input and its points lets you see why a day is rated the way it is.",
    caveat:
      "The inputs are research-backed, but the points given to each are this app's own weighting and have not been tested.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/readiness/weights.ts#READINESS_WEIGHTS"],
    surfaces: [],
    activationNotes: "Switch on when the readiness screen ships.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
