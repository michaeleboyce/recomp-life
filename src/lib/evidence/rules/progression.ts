import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { RESET_FACTOR } from "@/lib/progression";
import { CREDIT_MIN_WEIGHT_RATIO } from "@/lib/workout/credit";

const [t1, t2, t3] = WORKOUT_TEMPLATES.A1.exercises;
const resetPercent = Math.round(RESET_FACTOR * 100);
const creditPercent = Math.round(CREDIT_MIN_WEIGHT_RATIO * 100);

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
    appBehavior: `Complete every set and the lift goes up next time: by your plate increment for upper-body lifts and double that for lower-body lifts. Miss reps and T1 moves from 5×3 to 6×2 to 10×1, and T2 from 3×10 to 3×8 to 3×6. After the last stage the weight resets to ${resetPercent}% and the cycle restarts. Sessions cut short by pain, a recent run or equipment limits freeze progression: they count as neither a pass nor a fail. Today notes when a T1 lift has reached its last stage through failed sessions, and the weight it would reset to.`,
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
      "src/components/WorkoutSummary/LiftResult.tsx",
      "src/components/Today/AttentionList.tsx",
    ],
  },
  "t3-progression": {
    area: "progression",
    status: "planned",
    title: "When does T3 weight go up?",
    summary: "T3 weight goes up when the last set reaches 25 reps",
    appBehavior:
      "When you finish every set of a T3 exercise, the app adds 5 lb for next time if the last AMRAP set reached 25 reps (or, outside a cut, if the three sets totalled 50 reps). Otherwise the weight stays the same; it never goes down. Stopping part-way, or a set cut short by pain, a recent run or equipment limits, changes nothing. The app does not yet tell you on screen when this happens.",
    rationale:
      "Muscle growth improves as sets end closer to failure. Under this rule the first two sets of 15 can be about 10 reps short of failure, and people judge reps left least accurately in high-rep sets.",
    strength: "program",
    sources: ["robinson2024", "halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/progression.ts#evaluateT3Progression",
      "src/lib/workout/completeWorkout.ts#computeCompletion",
    ],
    surfaces: [],
    activationNotes:
      "The rule now runs when a workout is finished (computeCompletion), but no screen shows it. Show the T3 result with its citation on the workout summary, then mark the rule active. Still open: keep the stock GZCLP rule or move to a double progression (every set near the top of a rep range), which fits the evidence better.",
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
  "off-program-credit": {
    area: "progression",
    status: "active",
    title: "Does a changed workout still count toward progression?",
    summary: "A lift done as prescribed progresses; a changed one is only logged",
    appBehavior: `When a workout has been changed, each lift is judged on its own. A program lift done at its prescribed sets and reps and at ${creditPercent}% of its prescribed weight or more is evaluated as usual (pass, fail or stage change), whichever day you did it on. A lift done lighter or at a different scheme, and any exercise you swapped in or added, is logged and counts toward muscle load and history but leaves the program's weights alone: neither a pass nor a fail. A home equipment substitute still counts as the program lift. The rotation only moves on when the workout was the one that was due and its heavy (T1) lift was done as prescribed. Before you start, the edit sheet on the Configure screen shows which of these applies to each lift you change.`,
    rationale:
      "GZCLP's pass and fail rules assume the prescribed sets, reps and weight. Applying them to a lighter or different session would raise the weight after work that did not test it, or count a deliberate easy day as a failure. Judging each lift separately lets a changed workout keep the progress it earned without distorting the rest.",
    caveat:
      "This is a convention of this app, not part of GZCLP and not a research finding.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/workout/credit.ts#classifyEntry",
      "src/lib/workout/credit.ts#foldRotation",
      "src/lib/workout/completeWorkout.ts#computeCompletion",
      "src/lib/workout/buildPlan.ts#describeNextWorkout",
    ],
    surfaces: ["src/components/PreWorkout/EditWorkoutSheet.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
