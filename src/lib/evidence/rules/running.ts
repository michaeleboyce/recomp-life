import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import {
  RUN_STRONG_WINDOW_HOURS,
  RUN_ADVISORY_WINDOW_HOURS,
  RUN_LONG_MINUTES,
  RUN_HARD_EFFORT,
  RUN_ADVISORY_EFFORT_THRESHOLD,
} from "@/lib/runRecovery";

export const RUNNING_RULES = {
  "run-interference": {
    area: "running",
    status: "active",
    title: "Why does a recent run matter?",
    summary: "A hard run in the last few hours lowers leg strength",
    appBehavior: `Before a workout with a lower-body T1 lift, the app checks your most recent run. A hard run (effort ${RUN_HARD_EFFORT} or more out of 5, or a non-easy run of ${RUN_LONG_MINUTES} minutes or more) in the last ${RUN_STRONG_WINDOW_HOURS} hours suggests reducing T1 by 10% or lifting later. A run in the last ${RUN_ADVISORY_WINDOW_HOURS} hours at effort ${RUN_ADVISORY_EFFORT_THRESHOLD.long} or more (${RUN_ADVISORY_EFFORT_THRESHOLD.intervals} for intervals or tempo, ${RUN_ADVISORY_EFFORT_THRESHOLD.easy} for easy runs) shows a lighter note. Neither changes your workout unless you choose to.`,
    rationale:
      "Aerobic exercise reduces strength for a while afterwards, more after longer or harder sessions, and less after running than cycling. In a training study, strength gains suffered when sessions were back to back but not when they were 6 hours apart. Over the long run, combining running and lifting does not compromise strength or muscle growth.",
    caveat:
      "The effort thresholds per run type are coaching heuristics. Only the T1 lift is checked.",
    strength: "moderate",
    sources: ["robineau2016", "markov2021", "schumann2022"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/runRecovery.ts#evaluateRunImpact"],
    surfaces: ["src/app/workout/configure/page.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
