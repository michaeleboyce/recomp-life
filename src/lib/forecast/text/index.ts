// Plain words for stored forecasts and their record. No React, no database: every
// function reads a stored row (or rows scored from the log) and `now`, and never
// recomputes a forecast. The screens in `src/components/Forecast` render what these
// return. Kept apart from `lib/forecast/index.ts`, which holds the models.
//
// - `words.ts`: lift names, kinds and categories, dates and numbers, stored inputs.
// - `open.ts`: one open forecast in words (`viewOf`) and the open list (`openForecasts`).
// - `inputs.ts`: what the model saw, line by line (`inputLines`).
// - `record.ts`: the track record in words.

export {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categoryOf,
  dayDate,
  formatAmount,
  formatMinutes,
  isSessionForecast,
  liftLabel,
  liftShort,
  LIFTS_WITH_PAGE,
  MIN_RESULTS_TO_JUDGE,
  mostLikelyFromPmf,
  ruleIdOf,
  shortDate,
  strengthOf,
  TARGET_IN_TEN,
  TARGET_PERCENT,
  TOO_FEW_TO_JUDGE,
} from "./words";
export type { ForecastCategory } from "./words";

export { dueOf, openForecasts, questionOf, restsOnOf, viewOf } from "./open";
export type { ForecastView, OpenForecasts } from "./open";

export { inputLines } from "./inputs";
export type { InputLine } from "./inputs";

export {
  BASIS_LABELS,
  BASIS_ORDER,
  chartBins,
  inPeriod,
  judgeShare,
  kindRows,
  PERIOD_LABELS,
  voidLine,
  widenedKinds,
  wrongest,
} from "./record";
export type { Judged, KindRow, Period, WrongestFinding } from "./record";
