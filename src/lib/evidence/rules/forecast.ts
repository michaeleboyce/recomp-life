import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";

/**
 * Rules behind the forecasts the app stores and scores. Registered as planned
 * until the forecast screens ship; the research pass fills in sources and
 * grades. Spec: docs/plans/2026-11-14-glass-box-design.md
 */
export const FORECAST_RULES = {
  "forecast-reps": {
    area: "projection",
    status: "planned",
    title: "How does the app forecast reps on the last set?",
    summary: "Last-set reps are forecast from your recent last sets and their scatter",
    appBehavior:
      "For the last set of a T1 lift the app turns your recent last sets into a strength level and a scatter, then gives the chance of each rep count at today's weight. The chance of a new best and the chance of passing come from the same numbers.",
    rationale:
      "A rep count at one weight and a different rep count at another describe the same strength, so recent sets at different weights can be pooled. Day-to-day strength varies, so the forecast is a spread of rep counts, not one number.",
    caveat:
      "With fewer than four recent results the spread is a wide default. The starting values and the bell-curve shape are this app's assumptions.",
    strength: "heuristic",
    sources: [],
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
    appBehavior:
      "The app adds up the planned sets and rests, then scales the total by how your past sessions compared with their estimates, and gives a range from how much those sessions varied.",
    rationale: "Planned rest and set counts explain most of a session's length; the rest is personal pace.",
    caveat: "Until there are several finished sessions the correction is 1 and the range is a wide default.",
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
    appBehavior:
      "The app fits a line through your recent weigh-ins and continues it four weeks, with a range from how much your weigh-ins scatter around that line.",
    rationale: "Over a few weeks a steady deficit or surplus moves weight roughly in a straight line, while single weigh-ins bounce around it.",
    caveat: "Rates of loss usually slow over a long cut, so the forecast is only made four weeks ahead.",
    strength: "heuristic",
    sources: [],
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
    appBehavior:
      "Each forecast is stored before the result exists and never edited. Ranges are built to hold the result 8 times in 10. Once enough forecasts of one kind have been scored and too few landed inside, the app widens that kind's range and says so in the adjustment log.",
    rationale: "A forecast is only useful if its stated odds match what happens. Scoring them in the open shows where the app can be trusted and where it cannot.",
    caveat: "Forecasts are void, not misses, when you change the weight or do not reach the lift.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/forecast/coefficients.ts#CALIBRATION"],
    surfaces: [],
    activationNotes: "Switch on when the track record screen ships.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
