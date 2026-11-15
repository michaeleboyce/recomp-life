// Every kind of forecast the app stores: what it is about, the rule that owns its
// numbers and how it is checked against the log. Screens and counts read this.
import type { ForecastKind } from "@/types";
import { RESOLVERS } from "./resolve";
import type { ForecastKindDef } from "./types";

export const FORECAST_KINDS: Record<ForecastKind, ForecastKindDef> = {
  amrapReps: {
    kind: "amrapReps",
    label: "Reps on the last set",
    ruleId: "forecast-reps",
    estimand:
      "Reps logged on the last set of the lift in this workout, at the weight the forecast was made for.",
    scope: "session",
    modelVersion: "reps-1",
    resolve: RESOLVERS.amrapReps,
  },
  newBest: {
    kind: "newBest",
    label: "Chance of a new best",
    ruleId: "forecast-reps",
    estimand:
      "Whether this workout sets a new best estimated max for the lift: the estimate from its last set at the forecast weight, counting the effort logged with it, is above the best that stood when the forecast was made. A last set of more than 10 reps gives no estimate.",
    scope: "session",
    modelVersion: "reps-1",
    resolve: RESOLVERS.newBest,
  },
  liftPass: {
    kind: "liftPass",
    label: "Chance the lift passes",
    ruleId: "forecast-reps",
    estimand:
      "Whether every set of the lift in this workout, at the forecast weight, reaches the target reps with none marked failed. The stated chance is the model's chance for the last set.",
    scope: "session",
    modelVersion: "reps-1",
    resolve: RESOLVERS.liftPass,
  },
  sessionLength: {
    kind: "sessionLength",
    label: "Session length",
    ruleId: "forecast-session-length",
    estimand: "The recorded length of the workout in seconds, when the plan was finished.",
    scope: "session",
    modelVersion: "session-1",
    resolve: RESOLVERS.sessionLength,
  },
  e1rm4w: {
    kind: "e1rm4w",
    label: "Estimated max in 4 weeks",
    ruleId: "projection-rate-of-gain",
    estimand:
      "The mean of the lift's estimated-max results logged within the window around the due date.",
    scope: "horizon",
    modelVersion: "e1rm-1",
    resolve: RESOLVERS.e1rm4w,
  },
  bodyweight4w: {
    kind: "bodyweight4w",
    label: "Bodyweight in 4 weeks",
    ruleId: "forecast-bodyweight",
    estimand: "The mean of the weigh-ins logged within the window around the due date.",
    scope: "horizon",
    modelVersion: "bodyweight-1",
    resolve: RESOLVERS.bodyweight4w,
  },
  stallRisk: {
    kind: "stallRisk",
    label: "Chance of a stall in the next two sessions",
    ruleId: "forecast-stall",
    estimand:
      "Whether the lift misses at its current stage (a session where a set falls short of the target reps or is marked failed) within its next two sessions that count for progression, at the working weights the program sets: today's, then one step up after a pass. Sessions held back for pain, a run or equipment, or stopped part-way, are not counted; a changed weight or scheme sets the forecast aside.",
    scope: "horizon",
    modelVersion: "stall-1",
    resolve: RESOLVERS.stallRisk,
  },
  milestone: {
    kind: "milestone",
    label: "Date of the next round-number weight",
    ruleId: "forecast-milestone",
    estimand:
      "The date of the first workout, after the forecast was made, in which the lift itself (not a home substitute) is lifted at or above the round-number weight in a main-lift set. Not reached by the last day of the range counts as outside it.",
    scope: "horizon",
    modelVersion: "milestone-1",
    resolve: RESOLVERS.milestone,
  },
};

/** The kinds in display order. */
export const FORECAST_KIND_IDS = Object.keys(FORECAST_KINDS) as ForecastKind[];
