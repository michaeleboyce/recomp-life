import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import {
  BODYWEIGHT_MODEL as B,
  CALIBRATION as K,
  REPS_MODEL as R,
  SESSION_LENGTH_MODEL as S,
} from "@/lib/forecast/coefficients";

/** 0.042 -> "4.2%", 0.1 -> "10%", 0.0005 -> "0.05%". */
const pct = (fraction: number) => `${Number((fraction * 100).toPrecision(3))}%`;
/** 0.8 -> "8 in 10". */
const inTen = (fraction: number) => `${Math.round(fraction * 10)} in 10`;

/**
 * Rules behind the forecasts the app stores and scores. Registered as planned
 * until the forecast screens ship. Research: docs/research/2026-11-forecast-models.md.
 * Spec: docs/plans/2026-11-14-glass-box-design.md
 */
export const FORECAST_RULES = {
  "forecast-reps": {
    area: "projection",
    status: "planned",
    title: "How does the app forecast reps on the last set?",
    summary: "Last-set reps are forecast from your recent last sets and their scatter",
    appBehavior: `For the last set of a T1 lift the app turns your recent last sets into a strength level and a scatter, then gives the chance of each rep count at today's weight, up to ${R.maxReps} or more. The chance of a new best and the chance of passing come from the same numbers. With at least ${R.minTrendPoints} results at the same stage in the last ${R.trendWindowWeeks} weeks it follows their trend, and the scatter is never taken as less than ${pct(R.trendSdFloorFraction)} of your level. With one to three results it uses their average and a scatter of at least ${pct(R.fewPointsSdFloorFraction)}. With none it assumes ${R.priorRepsAboveTarget} reps more than the target and a scatter of ${pct(R.priorSdFraction)}. After a stage change, a reset or ${R.regimeChangeWeeksOff} or more weeks off, the scatter is multiplied by ${R.regimeChangeSdMultiplier}. If you are cutting today but most of those sessions were not, the level is lowered by ${pct(-R.cuttingLevelShift)}. Each point your readiness score is below (or above) your usual moves the level by ${pct(R.readinessLevelShiftPerPoint)}.`,
    rationale:
      "A rep count at one weight and a different rep count at another describe the same strength, so recent sets at different weights can be pooled; estimates of a max from reps are most accurate from sets of fewer than 10 reps. Reps at a set weight change from day to day: trained lifters retested a week later typically did about one rep more or fewer (0.7 to 1.1 reps), so the forecast is a spread of rep counts, not one number. A night of short or lost sleep lowers strength a little, about 3% on average.",
    caveat:
      "The rep study tested only the bench press, in a lab, with fresh sets; a set at the end of a training session varies more, so the smallest scatter is a judgment set above that figure. A tested max varies by more (a median 4.2% between sessions) in studies that mixed beginners and older adults. The sleep figure comes mostly from whole nights without sleep; for one short night the studies found a smaller drop that was not statistically clear, and none measured a readiness score, so the size of the readiness shift is ours. The cutting shift, the starting values with no results, the extra scatter after a change and the bell-curve shape are this app's assumptions.",
    strength: "limited",
    sources: ["mitter2022", "grgic2020", "reynolds2006", "mayhew2008", "nuzzo2024", "craven2022"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/forecast/coefficients.ts#REPS_MODEL"],
    surfaces: [],
    activationNotes: "Switch on when the active-set forecast and the track record screens ship.",
  },
  "forecast-session-length": {
    area: "projection",
    status: "planned",
    title: "How does the app forecast how long a workout takes?",
    summary: "Session length comes from planned sets and rests, corrected by your history",
    appBehavior: `The app adds up the planned rests and ${S.secondsPerSet} seconds for each planned set. Once you have finished ${S.minSessionsForCorrection} sessions it scales the total by how your past sessions compared with their estimates, and gives a range from how much those sessions varied. Before that, the range is ${pct(S.defaultRangeFraction)} either side of the estimate.`,
    rationale: "Planned rest and set counts explain most of a session's length; the rest is personal pace, which your own history measures better than any average.",
    caveat:
      "No research covers this; the time per set and the starting range are this app's guesses, and the correction from your own sessions is what makes the forecast fit you.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/forecast/coefficients.ts#SESSION_LENGTH_MODEL"],
    surfaces: [],
    activationNotes: "Switch on when Today shows the session forecast.",
  },
  "forecast-bodyweight": {
    area: "projection",
    status: "planned",
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
    implementedIn: ["src/lib/forecast/coefficients.ts#BODYWEIGHT_MODEL"],
    surfaces: [],
    activationNotes: "Switch on when the Forecasts screen ships.",
  },
  "forecast-calibration": {
    area: "projection",
    status: "planned",
    title: "How does the app check its own forecasts?",
    summary: "Every forecast is saved before the result and scored against it afterwards",
    appBehavior: `Each forecast is stored before the result exists and never edited. Ranges are built to hold the result ${inTen(K.targetCoverage)} times. Once at least ${K.minResolvedForCorrection} forecasts of one kind have been scored and fewer than ${inTen(K.widenBelowCoverage)} landed inside, the app widens that kind's range by ${pct(K.sdScaleStep)} of its starting width at a time, up to ${K.sdScaleMax} times its starting width, and says so in the adjustment log. It never makes a range narrower than the model gives.`,
    rationale: "A forecast is only useful if its stated odds match what happens. Scoring them in the open shows where the app can be trusted and where it cannot.",
    caveat:
      "Forecasts are void, not misses, when you change the weight or do not reach the lift. This is standard forecasting practice rather than training research, so it cites none; the thresholds are this app's choices. With a small number of scored forecasts a well-sized range can still look too narrow by chance.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/forecast/coefficients.ts#CALIBRATION"],
    surfaces: [],
    activationNotes: "Switch on when the track record screen ships.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
