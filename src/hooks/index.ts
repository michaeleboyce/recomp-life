// Read hooks over the local database. Every hook returns `undefined` while its first
// query is loading (the dexie-react-hooks `useLiveQuery` convention) and then stays
// live: it re-renders when the underlying rows change.
export { useProfile, useSettings } from "./useProfile";
export {
  useLiftStates,
  useWorkout,
  useCompletedWorkouts,
  useUnfinishedWorkout,
} from "./useWorkouts";
export {
  useBodyweightLog,
  usePainEntries,
  useE1RMs,
  useRuns,
  useActivities,
  useLiftAdjustments,
} from "./useRecords";
export { useNextWorkout } from "./useNextWorkout";
export { useReadinessLogs, useMetricSource, useMetric } from "./useMetric";
export { useInsights } from "./useInsights";
export { useWeeklyReview, type WeeklyReviewResult } from "./useWeeklyReview";
export { useProjection, type ProjectionResult } from "./useProjection";
export { useTrainingLocation } from "./useTrainingLocation";
export { useUpcomingWorkouts } from "./useUpcomingWorkouts";
export {
  useLogChangePreview,
  useRecentlyDeleted,
  useDerivedCheck,
  countDifferences,
  type DerivedCheck,
  type DerivedCheckStatus,
} from "./useLogEdit";
