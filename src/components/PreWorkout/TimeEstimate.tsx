"use client";

import { Clock } from "lucide-react";
import type { ReadyLength } from "./useReadyLength";

interface TimeEstimateProps {
  /**
   * From `useReadyLength`: the session-length forecast Today shows, for this screen's
   * own plan (warm-ups, accessories and edits included), with its range.
   */
  length: ReadyLength;
}

export function TimeEstimate({ length }: TimeEstimateProps) {
  const range =
    length.low !== undefined && length.high !== undefined && length.high > length.low
      ? ` (${length.low} to ${length.high})`
      : "";
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="ready-length">
      <Clock className="size-4" aria-hidden="true" />
      <span>
        About {length.minutes} min{range}, rests included
      </span>
    </p>
  );
}
