import { useMemo, useState } from "react";
import { buildWeeklyReview, previousWeek, reviewWeeks, weekOf, type WeeklyReview } from "@/lib/review";
// Today's weekly target, so the review and the Today tile count against the same number.
// Read only inside the hook body, so the import cycle through "@/hooks" is harmless.
import { WEEKLY_SESSION_TARGET } from "@/components/Today/GlanceTiles";
import { useInsights } from "./useInsights";
import { useMetricSource } from "./useMetric";
import { useActivities } from "./useRecords";

export interface WeeklyReviewResult {
  review: WeeklyReview;
  /** Weeks with any data, newest first, starting with the current week. */
  weeks: Date[];
  /** Monday of the week containing `now`. */
  thisWeek: Date;
  /** Monday of the most recent completed week (the default). */
  lastWeek: Date;
}

/**
 * The review of the week starting `weekStart` (any date in it works), or of the most
 * recent completed week when omitted; `undefined` while the records load.
 * `now` is taken once per mount.
 */
export function useWeeklyReview(weekStart?: Date): WeeklyReviewResult | undefined {
  const source = useMetricSource();
  const insights = useInsights();
  const activities = useActivities();
  const [now] = useState(() => new Date());
  const key = weekStart ? weekOf(weekStart).getTime() : null;

  return useMemo(() => {
    if (!source || !insights || !activities) return undefined;
    const thisWeek = weekOf(now);
    const lastWeek = previousWeek(thisWeek);
    const full = { ...source, activities };
    const week = key === null ? lastWeek : new Date(key);
    return {
      review: buildWeeklyReview(full, insights, week, now, { sessionTarget: WEEKLY_SESSION_TARGET }),
      weeks: reviewWeeks(full, now),
      thisWeek,
      lastWeek,
    };
  }, [source, insights, activities, now, key]);
}
