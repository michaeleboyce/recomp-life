import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import {
  RESET_FACTOR,
  T3_INCREMENT_LBS,
  T3_LAST_SET_INCREASE_REPS,
  T3_LAST_SET_ONLY_PHASES,
  T3_TOTAL_INCREASE_REPS,
} from "@/lib/progression";

const [t1, t2, t3] = WORKOUT_TEMPLATES.A1.exercises;
const resetPercent = Math.round(RESET_FACTOR * 100);
const lastSetOnlyPhases = T3_LAST_SET_ONLY_PHASES.map((mode) => (mode === "cutting" ? "a cut" : mode)).join(" or ");

export const PROGRESSION_RULES = {
  "tier-structure": {
    area: "progression",
    status: "active",
    title: "Why heavy sets first, then volume?",
    summary: "Heavy sets first and 2+ sessions a week build strength best",
    appBehavior: `Each workout starts with one heavy lift (T1: ${t1.sets} sets of ${t1.reps}), then a moderate lift (T2: ${t2.sets} sets of ${t2.reps}), then lighter work (T3: ${t3.sets} sets of ${t3.reps} or more). The four workouts rotate so squat, bench, deadlift and overhead press are each trained heavy once and for volume once per cycle.`,
    rationale:
      "The largest review of the evidence found strength gains are higher with loads of 80% of 1RM or more, 2–3 sets or more, lifting early in the session and training at least twice a week. Muscle growth keeps rising with more weekly sets, with diminishing returns, which is what the T2 and T3 work adds.",
    caveat:
      "The exact set and rep split is GZCLP's design, not a research finding.",
    strength: "strong",
    sources: ["acsm2026", "pelland2026"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/workoutTemplates.ts#WORKOUT_TEMPLATES"],
    surfaces: ["src/components/Lift/SessionList.tsx"],
  },
  "gzclp-progression": {
    area: "progression",
    status: "active",
    title: "Why does the weight go up, change stage or reset?",
    summary: "Complete every set and the weight goes up; miss and the scheme changes",
    appBehavior: `Complete every set and the lift goes up next time: by your plate increment for upper-body lifts and double that for lower-body lifts. Miss reps and T1 moves from 5×3 to 6×2 to 10×1, and T2 from 3×10 to 3×8 to 3×6. After the last stage the weight resets to ${resetPercent}% and the cycle restarts. Sessions cut short by pain, a recent run or equipment limits freeze progression: they count as neither a pass nor a fail. Today notes when a T1 lift has reached its last stage through failed sessions, and the weight it would reset to. Editing or deleting a logged session re-runs progression from the log, so the next workout reflects the change; later sessions that are already logged are not rewritten.`,
    rationale:
      "This is the GZCLP linear progression. Adding load whenever the work is completed is the standard way to progress a newer lifter, and the stage changes let you keep training heavy after a miss instead of stalling.",
    caveat:
      "These are program rules, not research findings. The freeze rule is this app's addition.",
    strength: "program",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/progression.ts#evaluateT1Progression"],
    surfaces: [
      "src/app/progress/upcoming/page.tsx",
      "src/components/Log/WhatItDid.tsx",
      "src/components/Today/AttentionList.tsx",
    ],
  },
  "t3-progression": {
    area: "progression",
    status: "active",
    title: "When does T3 weight go up?",
    summary: `T3 weight goes up when the last set reaches ${T3_LAST_SET_INCREASE_REPS} reps`,
    appBehavior: `When you finish every set of a T3 exercise, the app adds ${T3_INCREMENT_LBS} lb for next time if the last set reached ${T3_LAST_SET_INCREASE_REPS} reps, or, except during ${lastSetOnlyPhases}, if the sets totalled ${T3_TOTAL_INCREASE_REPS} reps or more. During ${lastSetOnlyPhases} only the last set counts. Otherwise the weight stays the same; it never goes down. Stopping part-way, or a set cut short by pain, a recent run or equipment limits, changes nothing. Each workout's page shows what happened to its T3 lift under "What it did".`,
    rationale:
      "Muscle growth improves as sets end closer to failure. Under this rule the first two sets of 15 can be about 10 reps short of failure, and people judge reps left least accurately in high-rep sets.",
    caveat:
      "This is the stock GZCLP rule. A double progression (every set near the top of a rep range) would fit the evidence on proximity to failure better; that change is still open.",
    strength: "program",
    sources: ["robinson2024", "halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/progression.ts#evaluateT3Progression",
      "src/lib/workout/completeWorkout.ts#computeCompletion",
    ],
    surfaces: ["src/components/Log/WhatItDid.tsx"],
  },
  "accessory-progression": {
    area: "progression",
    status: "planned",
    title: "When would accessory weights go up?",
    summary: "Add weight once every set reaches the top of its rep range",
    appBehavior:
      "Rule in code: when every set reaches the top of its rep range, add 5 lb. After 3 sessions stuck at the same weight, drop to 90% and rebuild. Not connected.",
    rationale:
      "This double progression keeps every set reasonably close to failure, which is where muscle growth responds best.",
    strength: "moderate",
    sources: ["robinson2024"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/accessories.ts#evaluateAccessoryProgression"],
    surfaces: [],
    activationNotes:
      "Ready to connect once accessory weights are tracked per exercise in the UI.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
