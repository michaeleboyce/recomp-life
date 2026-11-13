"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarX } from "lucide-react";
import { useSettings, useWeeklyReview } from "@/hooks";
import { formatWeekRange, parseWeekKey, weekKey } from "@/lib/review";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { BodySection } from "./BodySection";
import { CardioSection } from "./CardioSection";
import { Takeaways } from "./Takeaways";
import { TrainingSection } from "./TrainingSection";
import { VolumeSection } from "./VolumeSection";
import { WeekSwitcher } from "./WeekSwitcher";

/** The weekly review body: reads `?week=YYYY-MM-DD` (default: the last completed week). */
export function WeeklyReviewScreen() {
  const router = useRouter();
  const pathname = usePathname() ?? "/progress/review";
  const params = useSearchParams();
  const requested = parseWeekKey(params?.get("week"));
  const result = useWeeklyReview(requested ?? undefined);
  const settings = useSettings();

  if (!result) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const { review, weeks, thisWeek } = result;
  const go = (week: Date) => router.replace(`${pathname}?week=${weekKey(week)}`, { scroll: false });

  return (
    <div className="flex flex-col gap-6">
      <WeekSwitcher weekStart={review.weekStart} weeks={weeks} thisWeek={thisWeek} onChange={go} />
      {review.isEmpty ? (
        <EmptyState
          icon={<CalendarX />}
          title="Nothing logged that week"
          body={`No workouts, weigh-ins, runs or activities for ${formatWeekRange(review.weekStart)}.`}
        />
      ) : (
        <>
          <Takeaways items={review.takeaways} />
          <TrainingSection review={review} />
          <BodySection body={review.bodyweight} mode={settings?.trainingPhase?.mode} />
          <VolumeSection volume={review.volume} />
          <CardioSection cardio={review.cardio} readiness={review.readiness} />
        </>
      )}
    </div>
  );
}
