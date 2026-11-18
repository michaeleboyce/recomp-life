import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { DROP_SET_LIGHTER_BY } from "@/components/ActiveWorkout/setPlan";
import { E1RM_MAX_REPS, E1RM_MAX_REPS_IN_RESERVE } from "@/lib/e1rm";
import { EXERCISES } from "@/lib/exercises";
import { EFFORT_WORD_RPE } from "@/lib/import/evidence";
import {
  DROP_SETS as D,
  MUSCLE_INDEX as I,
  MUSCLE_WEIGHTS as M,
  STRENGTH_POOLING as P,
  TARGET_EVIDENCE as T,
  TRANSFER_PRIORS,
  TRANSFER_RATIO as R,
  type TransferPrior,
} from "@/lib/strength/coefficients";
import { TREND_SMOOTHING } from "@/lib/strength/timeline";

/** 0.4 -> "40%", 0.035 -> "3.5%". */
const pct = (fraction: number) => `${Number((fraction * 100).toPrecision(3))}%`;
/** 0.5625 -> "0.6". */
const one = (x: number) => `${Math.round(x * 10) / 10}`;

const LIFT_NAMES: Record<string, string> = {
  squat: "squat",
  bench: "bench press",
  deadlift: "deadlift",
  ohp: "overhead press",
};

const priors = Object.entries(TRANSFER_PRIORS).flatMap(([lift, table]) =>
  Object.entries(table).map(([exerciseId, prior]) => ({ lift, exerciseId, prior: prior as TransferPrior }))
);

/** "Bulgarian Split Squat 0.5 of the squat (study)" for every starting ratio. */
const PRIOR_LIST = priors
  .map(
    ({ lift, exerciseId, prior }) =>
      `${EXERCISES[exerciseId]?.name ?? exerciseId} ${prior.ratio} of the ${LIFT_NAMES[lift] ?? lift} (${
        prior.grade === "heuristic" ? "assumed" : "study"
      })`
  )
  .join("; ");

/** How many of the lifter's own pairs a starting ratio is worth: (pairLogSd ÷ priorLogSd)². */
const pairsWorth = (prior: TransferPrior) => (R.pairLogSd / prior.priorLogSd) ** 2;
const studied = priors.filter((p) => p.prior.grade !== "heuristic").map((p) => pairsWorth(p.prior));
const assumed = priors.filter((p) => p.prior.grade === "heuristic").map((p) => pairsWorth(p.prior));
const range = (values: number[]) => {
  const lo = one(Math.min(...values));
  const hi = one(Math.max(...values));
  return lo === hi ? lo : `${lo}–${hi}`;
};

const STUDIED_COUNT = studied.length;

/** "Easy 7, Ideal 8, Hard 9" for every effort word an import reads. */
const EFFORT_WORDS = Object.entries(EFFORT_WORD_RPE)
  .map(([word, rpe]) => `${word[0].toUpperCase()}${word.slice(1)} ${rpe}`)
  .join(", ");
const easyRpe = EFFORT_WORD_RPE.easy;

/**
 * Rules behind the one strength model for gym and home, each shown where the app acts on
 * it; the import's effort words stay planned until a screen says how they are read.
 * Research: docs/research/2026-11-strength-transfer.md.
 * Spec: docs/plans/2026-11-15-strength-model-design.md
 */
export const STRENGTH_RULES = {
  "transfer-ratio": {
    area: "effort",
    status: "active",
    title: "How does a home exercise count toward a barbell lift?",
    summary: "Home exercises convert to the barbell lift by a ratio learned from you",
    appBehavior: `Each home exercise has a starting ratio to its barbell lift: its estimated max divided by the lift's, counting both dumbbells when you hold one in each hand. ${PRIOR_LIST}. The ratio is then learned from your own sessions, those imported from another app included: a home session and a barbell session of the same lift at most ${R.pairWindowDays} days apart form a pair, and the learned ratio is a weighted average of the starting ratio and your pairs (on a log scale). A starting ratio from a study counts like ${range(studied)} of your pairs and an assumed one like ${range(assumed)}, so a few of your own pairs soon outweigh it. From ${R.minPairsForOwnSpread} pairs on, pairs that disagree with each other widen the ratio's range. The app says how many pairs a ratio rests on. A home exercise with no weight of its own and no recent sets of its own starts from the barbell lift's estimate through this ratio, the learned one as soon as there is a pair; with recent sets of its own, those decide instead.`,
    rationale:
      "Lifters handle less weight with dumbbells than with a barbell: in trained men the dumbbell bench press 1RM was about 17% below the barbell bench press, and the standing dumbbell shoulder press about 7% below the standing barbell press. In academy rugby players a rear-foot-elevated split squat 1RM, on one leg, was about half the back squat 1RM. How much less differs between people, so your own sessions become the better guide once there are a few of them.",
    caveat: `Only ${STUDIED_COUNT} of the ${priors.length} pairs have a study, and each is one small study: the bench press (12 trained men), the shoulder press (15 men) and a split squat loaded with a barbell rather than dumbbells (18 rugby players; the half is our reading of their averages). The other starting ratios are assumptions. A ratio between estimated maxes also shifts with rep range and fatigue, and two sessions up to ${R.pairWindowDays} days apart include some real change in strength.`,
    strength: "limited",
    sources: ["saeterbakken2011", "saeterbakken2013", "speirs2016"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/strength/coefficients.ts#TRANSFER_PRIORS",
      "src/lib/strength/coefficients.ts#TRANSFER_RATIO",
      "src/lib/strength/ratio.ts#pairSessions",
      "src/lib/strength/ratio.ts#learnTransferRatio",
      "src/lib/workout/strength.ts#transferRatioOf",
      "src/lib/workout/variant.ts#seedVariantWeight",
      "src/lib/trace/homeWeight.ts#homeWeightSteps",
    ],
    surfaces: [
      "src/components/ExercisePage/HomeNextSession.tsx",
      "src/components/Import/StartingWeights.tsx",
      "src/components/ExercisePage/CountsToward.tsx",
    ],
  },
  "strength-pooling": {
    area: "effort",
    status: "active",
    title: "How do gym and home sessions combine into one strength estimate?",
    summary: "Barbell and home sessions pool into one estimate; home ones count less",
    appBehavior: `Every session gives an estimated max with the same formula and limits as the barbell lift (T1 sets taken as far as you can, ${E1RM_MAX_REPS} reps or fewer), on the total weight moved: both dumbbells when you hold one in each hand, the single dumbbell for a goblet squat. A lift's estimate starts from its latest barbell session; with only barbell sessions it is exactly your latest estimated 1RM. Home sessions after it are converted through the exercise's ratio and added, each counting ${pct(P.transferWeight)} as much as a barbell session, and a session's weight halves for every ${P.evidenceHalfLifeDays} days it is older than the newest one. The range assumes one session's estimate is off by about ${pct(P.sessionSdFraction)}, a home session by more, plus the uncertainty of the ratio. Back at the gym after home sessions, the barbell weight is the smaller of your last barbell weight plus the steps your home passes earned and the heaviest weight at which the estimate says the stage's reps are possible, rounded down to plates you can load; the first home weight after gym sessions follows the same rule, capped by your heaviest dumbbell. Each muscle's trend averages every exercise that works it, a primary muscle at ${M.primary} and a secondary one at ${M.secondary}, each exercise against its own earlier sessions; an exercise not done for ${I.staleAfterDays} days drops out until you do it again. Sessions imported from another app count by the same rules and the same ${P.evidenceHalfLifeDays}-day halving, so a session years old informs the trend but not next week's weight: they feed every plan (a home exercise's first weight, re-entry and the learned ratios) and the lift pages, where they are marked as imported, but they never change the workout order or the progression. The estimated-max chart on each lift's page, and the strength trend chart of each muscle, draw this as one smooth line: the estimate as of each session, the weighted mean of every session up to then with these same weights (a home session through its ratio at ${pct(P.transferWeight)}), with a band of one standard deviation and every session behind it as a dot by source. Its smoothing can be light (a weight halves every ${TREND_SMOOTHING.light} days), standard (${TREND_SMOOTHING.standard} days, as the plan) or heavy (${TREND_SMOOTHING.heavy} days); the smoothing and the sources you switch off change only the line, never a planned weight. The big number is the plan's own estimate, which starts from the latest barbell session and adds only the home sessions after it, so it can differ from the line; the chart says by how much and why. The Strength tab's total adds the lifts' lines.`,
    rationale:
      "A barbell session measures the lift itself; a home session measures the same muscles through a different movement, so it says something about the lift, but less. Counting it for less keeps one good home day from moving the barbell weight much, while a run of home sessions still shows. Taking the smaller of the two re-entry rules means the barbell weight never jumps past what either your passes or your measured strength supports.",
    caveat:
      "No research gives these weights. The share a home session counts follows the app's projection rule, where a set of another exercise for the same muscles counts that much toward training the lift, which is a related but different question. The half-life, the scatter and the reading of a muscle's trend from several exercises are this app's assumptions.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/strength/coefficients.ts#STRENGTH_POOLING",
      "src/lib/strength/coefficients.ts#MUSCLE_INDEX",
      "src/lib/strength/estimate.ts#externalLoad",
      "src/lib/strength/estimate.ts#sessionEstimates",
      "src/lib/strength/pooled.ts#pooledLiftEstimate",
      "src/components/Progress/strength.ts#liftEstimate",
      "src/lib/strength/muscleIndex.ts#muscleStrengthIndex",
      "src/lib/strength/reentry.ts#barbellReentryWeight",
      "src/lib/strength/reentry.ts#homeReentryWeight",
      "src/lib/workout/reentry.ts#resolveReentry",
      "src/lib/workout/startPlan.ts#planWorkoutStart",
      "src/lib/workout/strength.ts#strengthEvidenceOf",
      "src/lib/data/forecasts.ts#strengthSetsFrom",
      "src/lib/import/history.ts#importedLiftIndex",
      "src/lib/trace/homeWeight.ts#homeWeightSteps",
      "src/lib/strength/timeline.ts#TREND_SMOOTHING",
      "src/lib/strength/timeline.ts#strengthTimeline",
      "src/lib/strength/timeline.ts#muscleTimeline",
      "src/lib/strength/timeline.ts#smoothedEstimate",
      "src/lib/strength/timeline.ts#weeklyShares",
    ],
    surfaces: [
      "src/components/Progress/MusclesTab.tsx",
      "src/components/ExercisePage/HomeNextSession.tsx",
      "src/components/ExercisePage/CountsToward.tsx",
      "src/components/Lift/ImportedHistory.tsx",
      "src/components/StrengthTrend/StrengthTrendPanel.tsx",
    ],
  },
  "target-evidence": {
    area: "effort",
    status: "active",
    title: "Does a home weight I set myself count before I lift it?",
    summary: "A weight you set counts a little toward the lift's estimate until you lift it",
    appBehavior: `When you set a home exercise's weight yourself, the app keeps its own weight beside yours ("Plan 60 · You 70") and you can go back to it in one tap. Until you lift your weight, it counts toward the barbell lift's strength estimate as one session at the planned reps taken as far as you can, which is a cautious reading of what you expect to manage, through the exercise's ratio, at ${pct(T.weight)} of a logged home session. That estimate sets the first weight of the lift's other home exercises and bounds the barbell weight when you go back to the gym, so your weight shifts those a little. The first session of the exercise after your change replaces it, and it never makes an estimated max, a new best, a ratio pair or a muscle trend point. The barbell weight itself does not move: GZCLP still progresses it from barbell sessions.`,
    rationale:
      "A weight you pick says something about your strength that the log does not yet show, for example after training elsewhere or when the app's start was too light. Counting it for less than a lifted session lets it nudge the plan without letting a guess outweigh what you have done, and you always have the final say on the weight itself.",
    caveat:
      "No study measures how well a lifter's own pick predicts the weight they then lift. The share it counts and the reading of a target as reps taken as far as you can are this app's judgment.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/strength/coefficients.ts#TARGET_EVIDENCE",
      "src/lib/strength/estimate.ts#targetEstimates",
      "src/lib/strength/pooled.ts#pooledLiftEstimate",
      "src/lib/workout/variant.ts#targetStrengthSets",
      "src/lib/workout/variant.ts#withHandSetWeight",
      "src/components/Lift/homeVersion.ts#homePlanWeight",
      "src/components/LogEdit/AdjustLiftSheet.tsx#BackToPlanButton",
      "src/hooks/useStrengthEvidence.ts#useStrengthEvidence",
      "src/lib/data/forecasts.ts#strengthSetsFrom",
      "src/lib/trace/homeWeight.ts#homeWeightSteps",
      "src/lib/strength/timeline.ts#strengthTimeline",
    ],
    surfaces: ["src/components/ExercisePage/HomeNextSession.tsx"],
  },
  "drop-set-evidence": {
    area: "effort",
    status: "active",
    title: "How do drop sets count?",
    summary: "Drops add volume and a little strength evidence, never a new best",
    appBehavior: `A drop follows a set with no rest and starts about ${pct(DROP_SET_LIGHTER_BY)} lighter than the set before, rounded to your plates or dumbbell step; you can change it before logging. Its reps understate your strength. Only the first drop after each set is used for the strength estimate: its estimated max is taken as ${pct(D.fatigueDiscount)} below fresh (divided by ${1 - D.fatigueDiscount}), and the first drops together count ${pct(D.evidenceWeight)} as much as the session's best set. A drop never makes an estimated max or a new best, and a session with only drops gives no estimate. Ramp and back-off sets count like any other set, at their own weight. For muscle volume each drop counts as ${D.volumeCredit} of a set, and the drops after one set add at most ${D.maxExtraSetsPerWorkingSet} set. A drop is never part of a pass or a fail: a missed drop does not turn a pass into a miss.`,
    rationale:
      "Drop sets built about as much muscle and strength over weeks as traditional sets, in less time, and felt harder in the moment, with more lactate. In the studies' protocols the reps after a drop were far fewer than the lighter weight allows fresh, and maximal force fell more after drop sets than after traditional sets.",
    caveat:
      "The fatigue allowance and both weights are this app's judgment. The reps reported in two protocols put a drop a fifth to a third below fresh strength by the app's formula (our arithmetic), and nobody has measured this for a lifter's estimated max. Counting a drop as half a set is cautious: in one study, one set with three drops grew muscle as much as three full sets.",
    strength: "limited",
    sources: ["havers2026", "sodal2023"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/strength/coefficients.ts#DROP_SETS",
      "src/lib/strength/estimate.ts#sessionEstimates",
      "src/lib/strength/volume.ts#volumeCredits",
      "src/lib/strength/volume.ts#muscleVolume",
      "src/lib/workout/setSelectors.ts#isWorkingSet",
      "src/components/ActiveWorkout/setPlan.ts#dropSetWeight",
    ],
    surfaces: ["src/components/ActiveWorkout/DropSetPanel.tsx"],
  },
  "import-effort-words": {
    area: "effort",
    status: "active",
    title: "How are effort words from other apps read?",
    summary: "An imported set's effort word becomes an approximate RPE",
    appBehavior: `Sets imported from another app can carry an effort word. When those sets feed the strength estimate, each word is read as an approximate RPE: ${EFFORT_WORDS}. The reps left in reserve are then 10 minus that RPE, at most ${E1RM_MAX_REPS_IN_RESERVE}, as for an RPE you log yourself: a set marked Easy counts as ${10 - easyRpe} reps short of failure. A set with no word, or a word not in the list, is read as taken to its limit, which gives the lower estimate. Warm-ups give no estimate, and a drop counts as drops do.`,
    rationale:
      "An estimated max from a set depends on how close to failure it went. The other apps record that in words, not reps, so the words are mapped to the nearest RPE that matches their usual meaning, and a set with no word is read the cautious way.",
    caveat:
      "The apps do not say what their words mean in reps; the mapping is this app's reading of them, not a research finding. Imported sets with these words also count less as they age, like any other session.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/import/evidence.ts#EFFORT_WORD_RPE",
      "src/lib/import/evidence.ts#effortRpe",
      "src/lib/import/evidence.ts#importedSessionStrengthSets",
    ],
    surfaces: ["src/components/ImportedHistory/ImportedSessionSheet.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
