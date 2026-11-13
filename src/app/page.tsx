"use client";

import { useInsights } from "@/hooks";
import { PageShell } from "@/components/ui/page-shell";
import { Stagger } from "@/components/ui/stagger";
import { TodayHeader } from "@/components/Today/TodayHeader";
import { NextWorkoutHero } from "@/components/Today/NextWorkoutHero";
import {
  AttentionList,
  PositiveInsightLine,
  hasAttention,
  hasPositive,
  useDiscardStaleWorkouts,
} from "@/components/Today/AttentionList";
import { GlanceTiles } from "@/components/Today/GlanceTiles";
import { WeeklyReviewLink } from "@/components/Review/WeeklyReviewLink";
import MuscleHeatCard from "@/components/Dashboard/MuscleHeatCard";

/**
 * Today (U2): the next workout and its START button first, then at most three
 * things that need attention, then the glance tiles and this week's muscles.
 */
export default function TodayPage() {
  useDiscardStaleWorkouts();
  const insights = useInsights();

  return (
    <PageShell>
      <Stagger className="flex flex-col gap-[18px]">
        <TodayHeader key="header" />
        <NextWorkoutHero key="hero" />
        {insights && hasAttention(insights) && <AttentionList key="attention" insights={insights} />}
        <GlanceTiles key="tiles" />
        <WeeklyReviewLink key="review" />
        {insights && hasPositive(insights) && <PositiveInsightLine key="positive" insights={insights} />}
        <MuscleHeatCard key="muscles" />
      </Stagger>
    </PageShell>
  );
}
