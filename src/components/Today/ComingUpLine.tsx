"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useUpcomingWorkouts } from "@/hooks";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
import type { WorkoutLocation } from "@/types";

/** "A2 · Bench day" -> "A2 Bench day": reads better mid-sentence. */
function inlineTitle(templateId: string): string {
  return templateTitle(templateId).replace(" · ", " ");
}

/**
 * "Coming up: A2 Bench day, then B2 Deadlift day": the two workouts after the next
 * one, as a sequence (no dates), opening the full list. Hidden while loading.
 */
export function ComingUpLine({ location }: { location: WorkoutLocation }) {
  const upcoming = useUpcomingWorkouts(location, 3);
  if (!upcoming || upcoming.length < 3) return null;
  const [, then, after] = upcoming;

  return (
    <Link
      href="/progress/upcoming?from=today"
      className="-mt-1.5 -mb-2 flex min-h-11 items-center gap-2 rounded-[10px] text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1">
        Coming up: <span className="text-foreground">{inlineTitle(then.templateId)}</span>, then{" "}
        <span className="text-foreground">{inlineTitle(after.templateId)}</span>
      </span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}
