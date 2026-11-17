// Read hooks over the local database. Every hook returns `undefined` while its first
// query is loading (the dexie-react-hooks `useLiveQuery` convention) and then stays
// live: it re-renders when the underlying rows change.
export { useProfile, useSettings } from "./useProfile";
export {
  useLiftStates,
  useWorkout,
  useCompletedWorkouts,
  useUnfinishedWorkout,
  useLeftWorkouts,
} from "./useWorkouts";
export {
  useBodyweightLog,
  usePainEntries,
  useE1RMs,
  useRuns,
  useActivities,
  useFavoriteWorkouts,
  useHealthDaily,
  useLastNightSleep,
  useLiftAdjustments,
} from "./useRecords";
export { useVariantStates } from "./useVariantStates";
export { useStrengthEvidence } from "./useStrengthEvidence";
export { useMuscleStrength } from "./useMuscleStrength";
export { useForecasts } from "./useForecasts";
export { useCoachEvents } from "./useCoachEvents";
export { useAdjustmentFeed, type AdjustmentFeed } from "./useAdjustmentFeed";
export {
  useForecastSource,
  useScoredForecasts,
  useSessionForecasts,
  useTrackRecord,
} from "./useForecastLedger";
export { useReadinessToday } from "./useReadinessToday";
export { useDecisionTrace, useStoredDecisions } from "./useDecisions";
export { useNextWorkout } from "./useNextWorkout";
export { useNextSetPlans } from "./useNextSetPlans";
export { saveNextSetPlan } from "@/lib/data/nextSetPlans";
export { useReadinessLogs, useMetricSource, useMetric } from "./useMetric";
export { useInsights } from "./useInsights";
export { useWeeklyReview, type WeeklyReviewResult } from "./useWeeklyReview";
export { useProjection, type ProjectionResult } from "./useProjection";
export { useTrainingLocation } from "./useTrainingLocation";
export { useUpcomingWorkouts } from "./useUpcomingWorkouts";
export { useOpenWorkoutForecast, useTodayForecast, type TodayForecast } from "./useTodayForecast";
export { useWeightChances, type WeightChances } from "./useWeightChances";
export { useAppliedTheme, type AppliedTheme } from "./useAppliedTheme";
export { usePersonalEvidence } from "./usePersonalEvidence";
export {
  useLogChangePreview,
  useRecentlyDeleted,
  useDerivedCheck,
  countDifferences,
  type DerivedCheck,
  type DerivedCheckStatus,
} from "./useLogEdit";
export { useImportedSessions } from "./useImportedSessions";
export { useImportBatches } from "./useImportBatches";
export { useImportedLiftIndex, useImportedStrengthSets, useLiftE1RM } from "./useImportedHistory";
