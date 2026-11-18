import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import {
  REPS_FORMULA_DIVISOR,
  RESET_FACTOR,
  T3_INCREASE_REPS_MAX,
  T3_INCREASE_REPS_MIN,
  T3_INCREMENT_LBS,
  T3_TARGET_REPS,
  t3IncreaseThreshold,
} from "@/lib/progression";
import { CREDIT_MIN_WEIGHT_RATIO } from "@/lib/workout/credit";
import { CAP_REP_STEP, HARDER_HOME_VARIANT } from "@/lib/workout/variant";
import { OWN_HISTORY_WINDOW_WEEKS } from "@/lib/workout/strength";
import { STRENGTH_POOLING } from "@/lib/strength/coefficients";
import { EXERCISES } from "@/lib/exercises";
import { ACCESSORY_DELOAD_FRACTION, ACCESSORY_STUCK_SESSIONS } from "@/lib/accessories";
import { ACCESSORY_LOAD_STEP_LBS, OWN_HISTORY_FIRST_WEIGHT } from "@/lib/accessories/prescription";
import { STARTING_WEIGHT_RULES as SW } from "@/lib/import/startingWeights";

const exerciseName = (id: string) => EXERCISES[id]?.name ?? id;
const HARDER_LIST = Object.entries(HARDER_HOME_VARIANT)
  .map(([from, to]) => `${exerciseName(from)} to ${exerciseName(to)}`)
  .join(", ");

const [t1, t2, t3] = WORKOUT_TEMPLATES.A1.exercises;
const resetPercent = Math.round(RESET_FACTOR * 100);
const creditPercent = Math.round(CREDIT_MIN_WEIGHT_RATIO * 100);
const startPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** A T3 step as a percentage of the weight, rounded. */
const stepPercent = (weight: number, next: number) => Math.round(((next - weight) / weight) * 100);
/** Worked T3 examples, computed by the function that decides (`t3IncreaseThreshold`). */
const T3_EXAMPLES = (
  [
    ["a lat pulldown", 120, 125],
    ["a dumbbell", 50, 55],
    ["a dumbbell", 25, 30],
    ["a dumbbell", 15, 20],
  ] as const
)
  .map(([what, weight, next]) => {
    const t = t3IncreaseThreshold({ weight, nextWeight: next, targetReps: T3_TARGET_REPS });
    const bound = t === T3_INCREASE_REPS_MIN ? " (the floor)" : t === T3_INCREASE_REPS_MAX ? " (the ceiling)" : "";
    return `${what} going ${weight} → ${next} lb (${stepPercent(weight, next)}% heavier) asks for ${t}${bound}`;
  })
  .join(", ");
const T3_SMALL_STEP_PERCENT = stepPercent(120, 120 + T3_INCREMENT_LBS);
const T3_BIG_STEP_PERCENT = stepPercent(25, 25 + T3_INCREMENT_LBS);

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
      "src/components/ExercisePage/NextSession.tsx",
      "src/components/Log/WhatItDid.tsx",
      "src/components/Today/AttentionList.tsx",
    ],
  },
  "t3-progression": {
    area: "progression",
    status: "active",
    title: "When does T3 weight go up?",
    summary: `T3 goes up once the last set shows ${T3_TARGET_REPS} reps at the next weight`,
    appBehavior:
      `When you finish every set of a T3 exercise, its weight goes up for next time if the last set reached the reps the next step asks for, whatever your training phase. ` +
      `That number comes from the rep-to-strength formula the app uses everywhere, weight × (1 + reps ÷ ${REPS_FORMULA_DIVISOR}): the last set must show you could still do ${T3_TARGET_REPS} reps at the next weight. ` +
      `So reps needed = ${REPS_FORMULA_DIVISOR} × (next ÷ current × (1 + ${T3_TARGET_REPS} ÷ ${REPS_FORMULA_DIVISOR}) − 1), rounded up and kept between ${T3_INCREASE_REPS_MIN} and ${T3_INCREASE_REPS_MAX}. ` +
      `The next weight is ${T3_INCREMENT_LBS} lb more for the lift itself, or one dumbbell step (never past your heaviest dumbbell) for a home exercise. ` +
      `For example, ${T3_EXAMPLES}. ` +
      `Bodyweight work, and a T3 already at your heaviest dumbbell, use ${T3_INCREASE_REPS_MAX}. ` +
      `Total reps across the sets do not count. Otherwise the weight stays the same; it never goes down. Stopping part-way, or a set cut short by pain, a recent run or equipment limits, changes nothing. ` +
      `Each T3 exercise's page says its own number and why, the last set of a workout shows the number to reach and then what happens next time, and each workout's page shows what happened to its T3 lift under "What it did".`,
    rationale:
      `A fixed number asks too much after a small step and too little after a big one: ${T3_INCREMENT_LBS} lb is ${T3_SMALL_STEP_PERCENT}% of a 120 lb pulldown but ${T3_BIG_STEP_PERCENT}% of a 25 lb dumbbell. Asking the last set to predict the target reps at the next weight keeps each step about as hard as the last. Muscle growth improves as sets end closer to failure, and people judge reps left least accurately in high-rep sets, so the last set, taken as far as you can, is the honest test.`,
    caveat:
      `The 3×${T3_TARGET_REPS}+ scheme, and the rule that the last set decides, are GZCLP's own (program); stock GZCLP moves up at a flat ${T3_INCREASE_REPS_MAX} reps whatever the step. ` +
      `The step-sized number is this app's own arithmetic (graded heuristic): no study tested it, and the rep formula is known to be imprecise above about 10 reps. ` +
      `The floor of ${T3_INCREASE_REPS_MIN} is there because the formula is rough at high reps, so a tiny step still asks for a hard last set; the ceiling of ${T3_INCREASE_REPS_MAX} keeps the stock rule as the hardest case. ` +
      `The cited studies support taking sets close to failure, not this threshold. A double progression (every set near the top of a rep range, as accessories use) would fit that evidence better; that change is still open.`,
    strength: "program",
    sources: ["robinson2024", "halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/progression.ts#t3IncreaseThreshold",
      "src/lib/progression.ts#evaluateT3Progression",
      "src/lib/workout/completeWorkout.ts#computeCompletion",
      "src/lib/workout/variant.ts#evaluateVariant",
      "src/lib/workout/t3Increase.ts#liftT3Increase",
      "src/lib/workout/t3Increase.ts#homeT3Increase",
    ],
    surfaces: [
      "src/components/Log/WhatItDid.tsx",
      "src/components/ExercisePage/NextSession.tsx",
      "src/components/ExercisePage/ExerciseStrength.tsx",
      "src/components/ActiveWorkout/ExerciseBlock.tsx",
      "src/components/ActiveWorkout/T3NextTime.tsx",
    ],
  },
  "accessory-progression": {
    area: "progression",
    status: "active",
    title: "When would accessory weights go up?",
    summary: "Add weight once every set reaches the top of its rep range",
    appBehavior: `When every set of an accessory's last session reaches the top of its rep range, add one step (${ACCESSORY_LOAD_STEP_LBS} lb, or your dumbbell increment for dumbbell work). After ${ACCESSORY_STUCK_SESSIONS} sessions in a row at the same weight without that, drop to ${Math.round(ACCESSORY_DELOAD_FRACTION * 100)}% and rebuild; otherwise keep the weight. A weight you set by hand wins until you next log the exercise. The first time an exercise is done in the app, its weight comes from its own history (imported or logged at another tier) over the ${OWN_HISTORY_FIRST_WEIGHT.recentDays} days before its newest set: the heaviest weight at which you reached the top of the range, else your estimated strength for the middle of the range, never more than the heaviest weight lifted plus ${OWN_HISTORY_FIRST_WEIGHT.stepsAboveHeaviest} step, rounded down. With no history the weight is left for you to enter. The workout shows each accessory's rep range, and after its last set, the summary and the Log say what it does next time.`,
    rationale:
      "This double progression keeps every set reasonably close to failure, which is where muscle growth responds best.",
    caveat:
      "The first-weight limits are a cautious choice, not a researched rule: they keep a weight from another app or an old session from starting too heavy.",
    strength: "moderate",
    sources: ["robinson2024"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/accessories.ts#evaluateAccessoryProgression",
      "src/lib/accessories/prescription.ts#accessoryPrescription",
      "src/lib/accessories/prescription.ts#ownHistoryFirstWeight",
      "src/lib/workout/accessoryPlan.ts#planAccessories",
      "src/lib/workout/accessoryPlan.ts#accessoryNextTime",
      "src/lib/workout/accessoryPlan.ts#accessoryOutcomesOf",
    ],
    surfaces: [
      "src/components/PreWorkout/AccessorySheet.tsx",
      "src/components/Why/AccessoryWhySheet.tsx",
      "src/components/ActiveWorkout/ExerciseBlock.tsx",
      "src/components/ExercisePage/AccessoryNextSession.tsx",
    ],
  },
  "off-program-credit": {
    area: "progression",
    status: "active",
    title: "Does a changed workout still count toward progression?",
    summary: "A lift done as prescribed progresses; a changed one is only logged",
    appBehavior: `When a workout has been changed, each lift is judged on its own. A program lift done at its prescribed sets and reps and at ${creditPercent}% of its prescribed weight or more is evaluated as usual (pass, fail or stage change), whichever day you did it on. A lift done heavier than prescribed in every set counts too, and a pass builds the next weight from the heavier one; missing reps at a heavier weight changes nothing. A lift done lighter or at a different scheme, and any exercise you swapped in or added, is logged and counts toward muscle load and history but leaves the program's weights alone: neither a pass nor a fail. A home equipment substitute still counts as the program lift. The rotation only moves on when the workout was the one that was due and its heavy (T1) lift was done as prescribed. Before you start, the edit sheet on the Configure screen shows which of these applies to each lift you change.`,
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
      "src/lib/trace/substitute.ts#weightChangeEffect",
    ],
    surfaces: ["src/components/PreWorkout/EditWorkoutSheet.tsx"],
  },
  "home-progression": {
    area: "progression",
    status: "active",
    title: "What does a home session do to your weights?",
    summary: "Home sessions progress their own weight; the barbell moves when you return",
    appBehavior:
      `At home, each exercise keeps its own weight, stage and reps: a Bulgarian split squat done for the squat has its own working weight, and the same pass, miss and reset rules move it in dumbbell steps. A home session counts for the rotation like any other, so the next workout is still the next one in the order. The barbell weight does not move at home: that session is held for the barbell lift. Home sessions still count as evidence for the program lift, through the strength estimate, and the first barbell weight back at the gym is the smaller of the last barbell weight plus the steps your home passes earned and what the estimate allows, rounded down to plates you can load. The first weight of a home exercise with no weight of its own comes, in this order, from: its own sets in the last ${OWN_HISTORY_WINDOW_WEEKS} weeks, in the app or imported from another app (the heaviest weight its latest estimated max allows for the stage's reps, rounded down to your dumbbell step, and never more than one step above the heaviest weight you lifted it at in those weeks); else the barbell lift's strength estimate through the exercise's ratio, learned from your own sessions when there are pairs, else the starting ratio; else the ratio times the barbell weight, or a flat conversion. Today says which: "From your history" with the session only when its own sets set the weight, "Last done" with the date when they are older than that, and "First time" only for an exercise never done. A weight you set yourself always wins. Imported sessions never count as home sessions for the workout order or the progression.`,
    rationale:
      "A home exercise is a different movement with its own load, so a pass on it says the movement went well, not that the barbell is ready for more. Letting it progress by itself keeps home training moving, while moving the barbell only at re-entry, and never past what your passes or your measured strength support, keeps a run of home sessions from over- or under-loading the bar.",
    caveat: `This is a convention of this app and part of no program or study. How many steps a home pass is worth at re-entry, and how far home evidence may move the barbell, are this app's judgment. So is the first weight's order and its limits (graded heuristic): an exercise's own recent sets describe that movement better than any ratio to the barbell lift, but no study says how recent they must be. ${OWN_HISTORY_WINDOW_WEEKS} weeks is four of the strength estimate's ${STRENGTH_POOLING.evidenceHalfLifeDays}-day half-lives, after which a session would count a sixteenth as much, and the one-step limit keeps a light day's estimate from jumping a first session past what you actually lifted.`,
    strength: "program",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/workout/variant.ts#chooseHomeVariant",
      "src/lib/workout/variant.ts#seedVariantWeight",
      "src/lib/workout/variant.ts#seedVariantState",
      "src/lib/workout/strength.ts#OWN_HISTORY_WINDOW_WEEKS",
      "src/lib/workout/strength.ts#ownHistoryOf",
      "src/lib/workout/variant.ts#evaluateVariant",
      "src/lib/workout/variant.ts#homeStepsEarned",
      "src/lib/workout/credit.ts#sessionCountsForRotation",
      "src/lib/workout/reentry.ts#resolveReentry",
      "src/lib/workout/startPlan.ts#planWorkoutStart",
      "src/lib/workout/liftResolution.ts#resolveLifts",
      "src/lib/trace/homeWeight.ts#homeWeightSteps",
    ],
    surfaces: [
      "src/components/ExercisePage/HomeNextSession.tsx",
      "src/components/Log/WhatItDid.tsx",
      "src/components/WorkoutSummary/WhatItChanged.tsx",
    ],
  },
  "cap-progression": {
    area: "progression",
    status: "active",
    title: "What happens at your heaviest dumbbell?",
    summary: "At the heaviest dumbbell a pass moves to a harder exercise or adds reps",
    appBehavior: `A pass never takes a home exercise past your heaviest dumbbell. At that weight the pass moves you on instead. If the exercise has a harder version your dumbbells can load at a total no lighter (${HARDER_LIST}), the next session uses it, starting at the lightest weight that keeps the total load. Otherwise every set asks for more reps at the same weight: ${CAP_REP_STEP.T1} more for the heavy lift (5 sets of 3 become 5 of 4) and ${CAP_REP_STEP.T2} more for the moderate lift (3 sets of 10 become 3 of 12). The light lift adds none and keeps asking for as many reps as you can on its last set. A miss or a reset clears the added reps.`,
    rationale:
      "Once the dumbbells run out, load cannot rise, but difficulty can: a harder exercise at the same load, or more reps, still gives the muscles more to do. Muscle growth is similar across a wide range of loads when sets end near failure, which is why more reps at a fixed weight is a fair way to keep progressing.",
    caveat:
      "Which exercise is harder, and how many reps to add, are this app's choices, not research findings. Added reps do not make the lift heavier, so they say less about barbell strength than added weight.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/workout/variant.ts#CAP_REP_STEP",
      "src/lib/workout/variant.ts#HARDER_HOME_VARIANT",
      "src/lib/workout/variant.ts#evaluateVariant",
      "src/lib/trace/homeWeight.ts#homeWeightSteps",
    ],
    surfaces: [
      "src/components/Today/LiftRows.tsx",
      "src/components/ExercisePage/HomeNextSession.tsx",
      "src/components/Log/WhatItDid.tsx",
      "src/components/WorkoutSummary/WhatItChanged.tsx",
    ],
  },
  "starting-weights": {
    area: "progression",
    status: "active",
    title: "Where do the suggested starting weights come from?",
    summary: `Starting weights from your history: T1 at ${startPercent(SW.t1FractionOfFiveRepMax)} of a ${SW.fiveRepMaxReps}-rep max`,
    appBehavior: `After an import, each program lift the imported history informs gets a suggested starting weight, worked out from the lift's strength estimate: its latest session, home sessions after it through their ratios, older sessions counting less. T1 (${t1.sets}×${t1.reps}) starts at ${startPercent(SW.t1FractionOfFiveRepMax)} of the ${SW.fiveRepMaxReps}-rep max the estimate implies and T2 (${t2.sets}×${t2.reps}) at ${startPercent(SW.t2FractionOfFiveRepMax)} of it; T3 starts at the weight the estimate says you could lift about ${SW.t3Reps} times. When the newest session is old, the time-off rule takes its share off. Barbell weights are rounded down to plates you can load. A home exercise's weight goes through its ratio to the lift, is rounded down to the dumbbell step (per hand where it is per hand) and is capped at your heaviest dumbbell. Each suggestion shows its working. Nothing changes until you confirm a weight, which you can edit first; confirming records a starting-weight change that shows in the adjustment log and can be changed like any other.`,
    rationale: `The GZCLP guide starts T1 at about ${startPercent(SW.t1FractionOfFiveRepMax)} of a ${SW.fiveRepMaxReps}-rep max and T2 at about ${startPercent(SW.t2FractionOfFiveRepMax)}, so the first weeks are submaximal and leave room to progress. Starting from what your history shows, rather than from a guess, puts those weeks near your real strength, and taking off for time away keeps a long break from starting you too heavy.`,
    caveat:
      "The guide's percentages are of a rep max you have tested; here it is estimated from your history, often from dumbbell exercises converted through a ratio, so it can be off either way. The T3 rep target, the rounding and the use of the time-off rule are this app's choices.",
    strength: "program",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/import/startingWeights.ts#STARTING_WEIGHT_RULES",
      "src/lib/import/startingWeights.ts#suggestStartingWeights",
    ],
    surfaces: ["src/components/Import/StartingWeights.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
