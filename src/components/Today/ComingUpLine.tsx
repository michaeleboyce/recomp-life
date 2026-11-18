"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useUpcomingWorkouts } from "@/hooks";
import type { WorkoutLocation } from "@/types";
import { inlineTitle } from "@/lib/workoutNames";

/**
 * "Coming up: B1 Press day, then A2 Bench day": the two workouts after the next
 * one, as a sequence (no dates), opening the full list. Hidden while loading.
 */
export function ComingUpLine({ location }: { location: WorkoutLocation }) {
  const upcoming = useUpcomingWorkouts(location, 3);
  if (!upcoming || upcoming.length < 3) return null;
  const [, then, after] = upcoming;

  return (
    <Link
      href="/progress/upcoming?from=today"
      className="flex min-h-11 items-center gap-2 rounded-[10px] text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1">
        Coming up: <b className="font-bold text-foreground">{inlineTitle(then.templateId, then.template)}</b>, then{" "}
        <b className="font-bold text-foreground">{inlineTitle(after.templateId, after.template)}</b>
      </span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}
