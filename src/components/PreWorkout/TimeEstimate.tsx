"use client";

import { Clock } from "lucide-react";

interface TimeEstimateProps {
  /**
   * From `estimateWorkoutMinutes(plan, phase)`, the helper Today's next-workout card
   * uses: every set plus its rest, warm-ups and accessories included.
   */
  minutes: number;
}

export function TimeEstimate({ minutes }: TimeEstimateProps) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="size-4" aria-hidden="true" />
      <span>About {minutes} min, rests included</span>
    </p>
  );
}
