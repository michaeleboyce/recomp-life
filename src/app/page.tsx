"use client";

import { useInsights } from "@/hooks";
import { Stagger } from "@/components/ui/stagger";
import { NextWorkoutHero } from "@/components/Today/NextWorkoutHero";
import {
  AttentionList,
  PositiveInsightLine,
  hasAttention,
  hasPositive,
  useDiscardStaleWorkouts,
} from "@/components/Today/AttentionList";
import { GlanceTiles } from "@/components/Today/GlanceTiles";
import { useStartingWeightsAttention } from "@/components/Today/useStartingWeightsToConfirm";
import { WeeklyReviewLink } from "@/components/Review/WeeklyReviewLink";
import MuscleHeatCard from "@/components/Dashboard/MuscleHeatCard";

/**
 * Today: a photo of the day's main lift, the forecast, the lifts and START, all in
 * the first screen; then up to three things that need attention (an unfinished
 * workout first), the glance tiles and this week's muscles.
 */
export default function TodayPage() {
  useDiscardStaleWorkouts();
  const insights = useInsights();
  const startingWeights = useStartingWeightsAttention();

  return (
    <div data-slot="today" className="mx-auto max-w-lg">
      {/* The day's name is the visible heading; this names the screen. */}
      <h1 className="sr-only">Today</h1>
      <NextWorkoutHero />
      <Stagger className="flex flex-col gap-[18px] px-5 pt-5 pb-6">
        {insights && (hasAttention(insights) || startingWeights) && (
          <AttentionList key="attention" insights={insights} startingWeights={startingWeights} />
        )}
        <GlanceTiles key="tiles" />
        <WeeklyReviewLink key="review" />
        {insights && hasPositive(insights) && <PositiveInsightLine key="positive" insights={insights} />}
        <MuscleHeatCard key="muscles" />
      </Stagger>
    </div>
  );
}
