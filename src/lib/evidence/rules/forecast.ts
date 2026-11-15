import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { E1RM_MAX_REPS } from "@/lib/e1rm";
import { CUTTING_RECOVERY_BONUS_HOURS, RECOVERY_HOURS } from "@/lib/recovery";
import {
  BODYWEIGHT_MODEL as B,
  CALIBRATION as K,
  LIFT_OUTLOOK_MODEL as O,
  MILESTONE_MODEL as M,
  NEW_BEST_MODEL as N,
  REPS_MODEL as R,
  SESSION_LENGTH_MODEL as S,
  STALL_MODEL as ST,
} from "@/lib/forecast/coefficients";

/** 0.042 -> "4.2%", 0.1 -> "10%", 0.0005 -> "0.05%". */
const pct = (fraction: number) => `${Number((fraction * 100).toPrecision(3))}%`;
/** 0.8 -> "8 in 10". */
const inTen = (fraction: number) => `${Math.round(fraction * 10)} in 10`;

/**
 * Rules behind the forecasts the app stores and scores, and behind the one estimate
 * the Forecasts screen shows without scoring it (muscles ready again).
 * Research: docs/research/2026-11-forecast-models.md.
 * Spec: docs/plans/2026-11-14-glass-box-design.md
 */
export const FORECAST_RULES = {
  "forecast-reps": {
    area: "projection",
    status: "active",
    title: "How does the app forecast reps on the last set?",
    summary: "Last-set reps are forecast from your recent last sets and their scatter",
    appBehavior: `For the last set of a T1 lift the app turns your recent last sets into a strength level and a scatter, then gives the chance of each rep count at today's weight, up to ${R.maxReps} or more. The chance of a new best and the chance of passing come from the same numbers. A new best is what the app shows as one: the estimated max from your last set, which adds the reps a logged effort says you had left, comes out above your best so far. Its chance assumes your usual effort on the last set (the middle of your last ${N.effortCreditRecentSets} last sets, counting a set logged without an effort as all-out) and leaves out sets of more than ${E1RM_MAX_REPS} reps, which give no estimate. With at least ${R.minTrendPoints} results at the same stage in the last ${R.trendWindowWeeks} weeks it follows their trend, and the scatter is never taken as less than ${pct(R.trendSdFloorFraction)} of your level. With one to three results it uses their average and a scatter of at least ${pct(R.fewPointsSdFloorFraction)}. With none it assumes ${R.priorRepsAboveTarget} reps more than the target and a scatter of ${pct(R.priorSdFraction)}. After a stage change, a reset or ${R.regimeChangeWeeksOff} or more weeks off, the scatter is multiplied by ${R.regimeChangeSdMultiplier}. If you are cutting today but most of those sessions were not, the level is lowered by ${pct(-R.cuttingLevelShift)}. Each point your readiness score is below (or above) your usual moves the level by ${pct(R.readinessLevelShiftPerPoint)}.`,
    rationale:
      "A rep count at one weight and a different rep count at another describe the same strength, so recent sets at different weights can be pooled; estimates of a max from reps are most accurate from sets of fewer than 10 reps. Reps at a set weight change from day to day: trained lifters retested a week later typically did about one rep more or fewer (0.7 to 1.1 reps), so the forecast is a spread of rep counts, not one number. A night of short or lost sleep lowers strength a little, about 3% on average.",
    caveat:
      "The rep study tested only the bench press, in a lab, with fresh sets; a set at the end of a training session varies more, so the smallest scatter is a judgment set above that figure. A tested max varies by more (a median 4.2% between sessions) in studies that mixed beginners and older adults. The sleep figure comes mostly from whole nights without sleep; for one short night the studies found a smaller drop that was not statistically clear, and none measured a readiness score, so the size of the readiness shift is ours. The cutting shift, the starting values with no results, the extra scatter after a change and the bell-curve shape are this app's assumptions. So is the usual effort behind the new-best chance: no study covers how steadily a lifter rates a last set, and on a day you rate it harder or easier than usual that chance is off.",
    strength: "limited",
    sources: ["mitter2022", "grgic2020", "reynolds2006", "mayhew2008", "nuzzo2024", "craven2022"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/forecast/coefficients.ts#REPS_MODEL",
      "src/lib/forecast/coefficients.ts#NEW_BEST_MODEL",
      "src/lib/forecast/reps.ts#lastT1Sets",
      "src/lib/forecast/reps.ts#estimateRepsLevel",
      "src/lib/forecast/reps.ts#repsOutlook",
      "src/lib/forecast/reps.ts#chanceOfAtLeast",
      "src/lib/forecast/reps.ts#usualEffortCredit",
      "src/lib/forecast/reps.ts#chanceOfNewBest",
      "src/lib/forecast/reps.ts#forecastReps",
      "src/lib/readiness/score.ts#readinessLevelShift",
    ],
    surfaces: ["src/components/Today/ForecastTiles.tsx"],
  },
  "forecast-session-length": {
    area: "projection",
    status: "active",
    title: "How does the app forecast how long a workout takes?",
    summary: "Session length comes from planned sets and rests, corrected by your history",
    appBehavior: `The app adds up the planned rests and ${S.secondsPerSet} seconds for each planned set. Once you have finished ${S.minSessionsForCorrection} sessions it scales the total by how your past sessions compared with their estimates, and gives a range from how much those sessions varied. Before that, the range is ${pct(S.defaultRangeFraction)} either side of the estimate.`,
    rationale: "Planned rest and set counts explain most of a session's length; the rest is personal pace, which your own history measures better than any average.",
    caveat:
      "No research covers this; the time per set and the starting range are this app's guesses, and the correction from your own sessions is what makes the forecast fit you.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/forecast/coefficients.ts#SESSION_LENGTH_MODEL",
      "src/lib/forecast/sessionLength.ts#forecastSessionLength",
      "src/lib/workout/duration.ts#estimateWorkoutSeconds",
    ],
    surfaces: ["src/components/Today/ForecastTiles.tsx"],
  },
  "forecast-stall": {
    area: "projection",
    status: "active",
    title: "How does the app judge the chance of a stall?",
    summary: "The chance a lift misses at its stage soon, from your recent last sets",
    appBehavior: `For each main lift the app gives the chance that it misses at its current stage within its next ${ST.sessions} sessions: the first at today's working weight, the next one program step heavier if the first passes. Each session's chance of passing is the rep forecast's chance of reaching the target on the last set at that weight and date; reaching it on the last set is taken to mean every set did. The two sessions are not treated as independent: a lifter weaker than the forecast thinks is weaker at both, so only the day-to-day part of the scatter is drawn afresh each time. The sessions come at the lift's own pace over the last ${O.paceWindowWeeks} weeks. The chance is checked against the next ${ST.sessions} sessions that count for progression, read within ${ST.outcomeWindowDays} days of when the second is due; sessions held back for pain, a run or equipment, or stopped part-way, are skipped, as the program skips them. It never changes a weight.`,
    rationale:
      "In this program a miss is what moves a lift to its next stage, so the chance of one is the useful number before a session, not a verdict after it. It is read from the same rep forecast as the other forecasts, so it is checked by the same record.",
    caveat:
      "This is the rep forecast read twice, not new research: the rep forecast's own limits apply. Taking a last set at the target to mean every set reached it is this app's assumption; a set missed earlier counts as a miss when the forecast is checked. A session at home with dumbbells counts for progression and so for this check, but the chance assumes the barbell lift at the gym.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/forecast/coefficients.ts#STALL_MODEL",
      "src/lib/forecast/coefficients.ts#LIFT_OUTLOOK_MODEL",
      "src/lib/forecast/outlook.ts#forecastStall",
      "src/lib/forecast/outlook.ts#walkProgram",
      "src/lib/forecast/outlook.ts#liftPace",
    ],
    surfaces: ["src/components/Forecast/ForecastsScreen.tsx"],
  },
  "forecast-milestone": {
    area: "projection",
    status: "active",
    title: "How does the app date your next round-number weight?",
    summary: "When a lift's working weight reaches its next round number, with a range",
    appBehavior: `For each main lift the app dates the first session at the next multiple of ${M.roundToLbs} lb above today's working weight. It walks the program's own rules forward session by session at the lift's own pace: a pass adds the lift's step, a miss moves it down a stage and a miss at the last stage resets it, each session passing with the rep forecast's chance at that weight and date. The date is the middle of where that walk lands, with a range built to hold the result ${inTen(K.targetCoverage)} times, allowing for sessions coming earlier or later than usual. No date is given unless the weight is reached within ${M.maxWeeks} weeks with at least a ${pct(M.minReachChance)} chance. The forecast is checked against the first workout in which the lift itself is lifted at that weight or more.`,
    rationale:
      "A date for a round number answers how the program's steady steps add up for you, and it is checked like every other forecast, so its record shows whether to trust it.",
    caveat:
      "No research covers this. It continues today's trend of your last sets for weeks, which holds only while your training goes on as it has; a change of phase, time off or a lot of home sessions move the date. The round number and the horizon are this app's choices.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/forecast/coefficients.ts#MILESTONE_MODEL",
      "src/lib/forecast/outlook.ts#forecastMilestone",
      "src/lib/forecast/outlook.ts#walkProgram",
    ],
    surfaces: ["src/components/Forecast/ForecastsScreen.tsx"],
  },
  "forecast-muscle-ready": {
    area: "projection",
    status: "active",
    title: "When will a muscle be ready again?",
    summary: "Ready-again times read from the recovery windows; shown, never scored",
    appBehavior: `After a workout the Forecasts screen lists the main muscles its T1 and T2 lifts trained and when each should be ready again: ${RECOVERY_HOURS.ready} hours after it was last trained, and at its best from ${RECOVERY_HOURS.primed} hours (${CUTTING_RECOVERY_BONUS_HOURS} hours later for both while cutting). The times are the recovery windows', unchanged. Unlike the other forecasts they are an explanation, not a stored and scored forecast.`,
    rationale:
      "It helps to see when the work you just did should have worn off. The times are those of the recovery statuses, so they agree with what the rest of the app shows.",
    caveat:
      "They are not scored because there is nothing honest to score them against: your log never records when a muscle has recovered, and the next session that trains it is set by the program's rotation, usually after these times, so a check against it would come out right by construction. Whether that session's last set met its forecast is already checked by the rep forecast, and a bad day cannot be told apart from a slow recovery. The windows' own grade and sources are on the recovery rule.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/forecast/muscleReady.ts#muscleReadyTimes"],
    surfaces: ["src/components/Forecast/MuscleReadyList.tsx"],
  },
  "forecast-bodyweight": {
    area: "projection",
    status: "active",
    title: "How does the app forecast your bodyweight?",
    summary: "Bodyweight four weeks out continues your recent trend, with a range",
    appBehavior: `The app fits a straight line through your weigh-ins from the last ${B.fitWindowDays} days (at least ${B.minEntries} of them) and continues it ${B.horizonDays} days ahead, with a range from how much your weigh-ins scatter around that line. The forecast is checked against the average of your weigh-ins within ${B.outcomeWindowDays} days either side of the due date (at least ${B.minOutcomeEntries}), so one heavy or light morning does not decide it.`,
    rationale:
      "Single weigh-ins bounce around: in one man weighed every morning for 26 years, consecutive days differed by about half a percent, and in over a thousand people weighing at home, weight was highest on Monday and lowest on Friday. Averaging over a week evens both out. Bodyweight responds slowly to a lasting change in eating, taking about a year to get halfway to a new steady weight, so over a few weeks the trend is close to a straight line.",
    caveat:
      "The day-to-day figure comes from a single healthy man, the weekly pattern from people keeping off weight they had lost, and the slow response from a mathematical model of average adults, not from lifters on a cut. A big change in eating or training within the last few weeks breaks the straight line. The window lengths and minimum counts are this app's choices.",
    strength: "limited",
    sources: ["schneditz2023", "turicchi2020", "hall2011"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/forecast/coefficients.ts#BODYWEIGHT_MODEL",
      "src/lib/forecast/horizon.ts#forecastBodyweight",
    ],
    surfaces: ["src/components/Forecast/ForecastsScreen.tsx"],
  },
  "forecast-calibration": {
    area: "projection",
    status: "active",
    title: "How does the app check its own forecasts?",
    summary: "Every forecast is saved before the result and scored against it afterwards",
    appBehavior: `Each forecast is stored before the result exists and never edited. Ranges are built to hold the result ${inTen(K.targetCoverage)} times. Once at least ${K.minResolvedForCorrection} forecasts of one kind have been scored and fewer than ${inTen(K.widenBelowCoverage)} landed inside, the app widens that kind's range by ${pct(K.sdScaleStep)} of its starting width at a time, up to ${K.sdScaleMax} times its starting width, and says so in the adjustment log. It never makes a range narrower than the model gives.`,
    rationale: "A forecast is only useful if its stated odds match what happens. Scoring them in the open shows where the app can be trusted and where it cannot.",
    caveat:
      "Forecasts are void, not misses, when you change the weight or do not reach the lift. This is standard forecasting practice rather than training research, so it cites none; the thresholds are this app's choices. With a small number of scored forecasts a well-sized range can still look too narrow by chance.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/forecast/coefficients.ts#CALIBRATION",
      "src/lib/forecast/score.ts#sdScaleFor",
      "src/lib/forecast/reps.ts#repsRange",
      "src/lib/forecast/resolve.ts#resolveForecast",
    ],
    surfaces: ["src/components/Forecast/TrackRecordScreen.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
