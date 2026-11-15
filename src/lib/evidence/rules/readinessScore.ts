import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { READINESS_WEIGHTS as W, formatPoints as pts } from "@/lib/readiness/weights";
import { REPS_MODEL } from "@/lib/forecast/coefficients";
import { RUN_ADVISORY_WINDOW_HOURS, RUN_STRONG_WINDOW_HOURS } from "@/lib/runRecovery";
import { ACTIVITY_NOTE_WINDOW_HOURS } from "@/lib/activities";

/** "0.05%" for a fraction of 0.0005. */
const percent = (fraction: number) => `${Number((fraction * 100).toFixed(3))}%`;

/**
 * The readiness score. Registered as planned until the readiness screen ships.
 * The inputs have their own rules (readiness, recovery-windows, run-interference,
 * activity-fatigue, training-with-pain); this rule covers the points given to each,
 * and soreness, which has no rule of its own.
 * Spec: docs/plans/2026-11-14-glass-box-design.md
 */
export const READINESS_SCORE_RULES = {
  "readiness-score": {
    area: "recovery",
    status: "active",
    title: "How is the readiness score worked out?",
    summary: "Readiness adds up sleep, stress, rest, recent activity and soreness",
    appBehavior: `The score runs from ${W.minScore} to ${W.maxScore} and starts from your usual level. Until you have ${W.minPastScores} check-ins that is ${W.defaultUsual}; after that it is the middle of your last ${W.usualWindow} check-ins, each scored on its own from ${W.defaultUsual}. Points are then added or taken away. Sleep: ${pts(W.sleep["5-7"])} for 5 to 7 hours, ${pts(W.sleep["<5"])} for under 5. Energy: ${pts(W.stress.good)} for good, ${pts(W.stress.low)} for low. Rest: ${pts(W.rest.recovering)} while the muscles in today's workout are still recovering, ${pts(W.rest.primed)} when they are fully rested. A run in the last ${RUN_ADVISORY_WINDOW_HOURS} hours before a lower-body day: ${pts(W.run.advisory)}, or ${pts(W.run.strong)} for a hard run in the last ${RUN_STRONG_WINDOW_HOURS} hours. Another hard session in the last ${ACTIVITY_NOTE_WINDOW_HOURS} hours: ${pts(W.hardActivity)}. Soreness where the workout loads the body: ${pts(W.sorenessPerSeverity)} for each step of severity, ${pts(W.sorenessFloor)} at most, for ${W.sorenessWindowHours} hours. Pain there: ${pts(W.painPerSeverity)} for each step, ${pts(W.painFloor)} at most, for ${W.painWindowDays} days. Once you have ${W.minPastScores} check-ins, each input is measured against what it usually is for you, so an ordinary day scores your usual and only the differences show. Each point above or below your usual moves the forecast of your strength level by ${percent(REPS_MODEL.readinessLevelShiftPerPoint)}. The score never changes a weight.`,
    rationale:
      "Each input is known to affect performance or recovery. Showing every input and its points lets you see why a day is rated the way it is. Measuring against your own usual keeps a habit, such as lifting on one rest day, from being counted again every day when your results already reflect it.",
    caveat:
      "The inputs are research-backed, but the points given to each are this app's own weighting and have not been tested. Soreness has no rule of its own, so its points rest on this rule alone.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/readiness/weights.ts#READINESS_WEIGHTS",
      "src/lib/readiness/score.ts#readinessScore",
      "src/lib/readiness/usual.ts#readinessUsual",
    ],
    surfaces: ["src/components/Today/ForecastTiles.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
